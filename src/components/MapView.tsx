import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import mlcontour from 'maplibre-contour'
import type { Trip, Stop } from '@/types/trip'
import { groupPlaces, pinNumber, pickStopFromMarker, climbStops } from '@/lib/places'
import { activeLegForStop, allRouteCoords, hikeLeg } from '@/lib/route'
import { prefersReducedMotion } from '@/lib/utils'
import type { MapViewMode } from '@/components/map-types'

export interface MapViewProps {
  trip: Trip
  activeId: string
  mode: MapViewMode
  terrain3d: boolean
  hoverLngLat: [number, number] | null
  onMarkerSelect: (stopId: string) => void
  onReady?: () => void
  onFail?: () => void
  cameraHost: HTMLElement | null
}

const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
      paint: {
        'raster-saturation': -0.45,
        'raster-contrast': -0.1,
        'raster-brightness-min': 0.08,
      },
    },
  ],
}

function isLg() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
}

function allow3D() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches && !prefersReducedMotion()
}

function padding(): maplibregl.PaddingOptions {
  if (isLg()) return { top: 40, right: 40, bottom: 40, left: 40 }
  const sheetPeek = Math.round(window.innerHeight * 0.12)
  return { top: 56, right: 32, bottom: sheetPeek + 24, left: 32 }
}

function boundsFor(coords: [number, number][]) {
  const b = new maplibregl.LngLatBounds(coords[0], coords[0])
  for (const c of coords) b.extend(c)
  return b
}

function writeCamera(host: HTMLElement | null, map: maplibregl.Map) {
  if (!host) return
  const c = map.getCenter()
  host.dataset.mapLng = c.lng.toFixed(5)
  host.dataset.mapLat = c.lat.toFixed(5)
  host.dataset.mapZoom = map.getZoom().toFixed(2)
  host.dataset.mapReady = 'true'
}

function setLegEmphasis(map: maplibregl.Map, active: 'drive' | 'hike') {
  if (!map.getLayer('route-drive')) return
  const driveOn = active === 'drive'
  map.setPaintProperty('route-drive', 'line-opacity', driveOn ? 1 : 0.45)
  map.setPaintProperty('route-hike', 'line-opacity', driveOn ? 0.45 : 1)
  map.setPaintProperty('route-drive', 'line-width', driveOn ? 5 : 3.5)
  map.setPaintProperty('route-hike', 'line-width', driveOn ? 4 : 5.5)
  map.setPaintProperty('route-drive-casing', 'line-width', (driveOn ? 5 : 3.5) + 2.5)
  map.setPaintProperty('route-hike-casing', 'line-width', (driveOn ? 4 : 5.5) + 2.5)
  map.setPaintProperty('route-drive-casing', 'line-opacity', driveOn ? 0.95 : 0.5)
  map.setPaintProperty('route-hike-casing', 'line-opacity', driveOn ? 0.5 : 0.95)
}

function addRouteLayers(map: maplibregl.Map, trip: Trip) {
  map.addSource('route', { type: 'geojson', data: trip.route })

  const casing: Partial<maplibregl.LineLayerSpecification> = {
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  }

  map.addLayer({
    ...casing,
    id: 'route-drive-casing',
    filter: ['==', ['get', 'leg'], 'drive'],
    paint: { 'line-color': '#F8F4EC', 'line-width': 6, 'line-opacity': 0.95 },
  } as maplibregl.LineLayerSpecification)

  map.addLayer({
    ...casing,
    id: 'route-hike-casing',
    filter: ['==', ['get', 'leg'], 'hike'],
    paint: { 'line-color': '#F8F4EC', 'line-width': 6.5, 'line-opacity': 0.95 },
  } as maplibregl.LineLayerSpecification)

  map.addLayer({
    ...casing,
    id: 'route-drive',
    filter: ['==', ['get', 'leg'], 'drive'],
    paint: { 'line-color': '#2F5A48', 'line-width': 3.5, 'line-opacity': 1 },
  } as maplibregl.LineLayerSpecification)

  map.addLayer({
    ...casing,
    id: 'route-hike',
    filter: ['==', ['get', 'leg'], 'hike'],
    paint: {
      'line-color': '#A8441E',
      'line-width': 4,
      'line-dasharray': [1.6, 1.2],
      'line-opacity': 1,
    },
  } as maplibregl.LineLayerSpecification)
}

function addTerrainLayers(map: maplibregl.Map) {
  const demSource = new mlcontour.DemSource({
    url: DEM_URL,
    encoding: 'terrarium',
    maxzoom: 15,
    worker: true,
  })
  demSource.setupMaplibre(maplibregl)

  map.addSource('dem', {
    type: 'raster-dem',
    encoding: 'terrarium',
    tiles: [demSource.sharedDemProtocolUrl],
    tileSize: 256,
    maxzoom: 15,
    attribution: 'Terrain: Mapzen / AWS Terrain Tiles',
  })

  map.addSource('contours', {
    type: 'vector',
    tiles: [
      demSource.contourProtocolUrl({
        multiplier: 1,
        thresholds: {
          11: [200, 1000],
          12: [50, 250],
          13: [50, 250],
          14: [50, 250],
          15: [50, 250],
        },
      }),
    ],
    maxzoom: 15,
  })

  const before = map.getLayer('route-drive-casing') ? 'route-drive-casing' : undefined

  map.addLayer(
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem',
      minzoom: 9,
      paint: {
        'hillshade-shadow-color': '#1F3D32',
        'hillshade-highlight-color': '#F8F4EC',
        'hillshade-accent-color': '#2F5A48',
        'hillshade-exaggeration': 0.35,
      },
    },
    before,
  )

  map.addLayer(
    {
      id: 'contour-minor',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      minzoom: 12,
      filter: ['==', ['get', 'level'], 0],
      paint: {
        'line-color': '#5E574C',
        'line-width': 0.6,
        'line-opacity': 0.22,
      },
    },
    before,
  )

  map.addLayer(
    {
      id: 'contour-index',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      minzoom: 12,
      filter: ['>', ['get', 'level'], 0],
      paint: {
        'line-color': '#5E574C',
        'line-width': 1,
        'line-opacity': 0.45,
      },
    },
    before,
  )

  map.addLayer(
    {
      id: 'contour-labels',
      type: 'symbol',
      source: 'contours',
      'source-layer': 'contours',
      minzoom: 12,
      filter: ['>', ['get', 'level'], 0],
      layout: {
        'symbol-placement': 'line',
        'text-size': 11,
        'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'],
        'text-font': ['Open Sans Regular', 'Noto Sans Regular'],
        'text-max-angle': 30,
      },
      paint: {
        'text-color': '#5E574C',
        'text-halo-color': '#F8F4EC',
        'text-halo-width': 1.5,
      },
    },
    before,
  )
}

export default function MapView({
  trip,
  activeId,
  mode,
  terrain3d,
  hoverLngLat,
  onMarkerSelect,
  onReady,
  onFail,
  cameraHost,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null)
  const loadedRef = useRef(false)
  const terrainReadyRef = useRef(false)
  const onReadyRef = useRef(onReady)
  const onFailRef = useRef(onFail)
  const onMarkerRef = useRef(onMarkerSelect)
  onReadyRef.current = onReady
  onFailRef.current = onFail
  onMarkerRef.current = onMarkerSelect
  const activeRef = useRef(activeId)
  activeRef.current = activeId

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let cancelled = false
    let failTimer: ReturnType<typeof setTimeout> | undefined
    let map: maplibregl.Map | undefined

    try {
      map = new maplibregl.Map({
        container: el,
        style: OSM_STYLE,
        attributionControl: false,
        fadeDuration: prefersReducedMotion() ? 0 : 200,
        pitch: 0,
        maxPitch: 60,
      })
      mapRef.current = map

      failTimer = setTimeout(() => {
        if (!loadedRef.current && !cancelled) onFailRef.current?.()
      }, 5000)

      map.on('load', () => {
        if (cancelled || !map) return
        loadedRef.current = true
        if (failTimer) clearTimeout(failTimer)

        addRouteLayers(map, trip)
        const stop = trip.stops.find((s) => s.id === activeRef.current)
        setLegEmphasis(map, activeLegForStop(stop?.order ?? 1))

        map.fitBounds(boundsFor(allRouteCoords(trip.route)), {
          padding: padding(),
          duration: 0,
        })

        const groups = groupPlaces(trip.stops)
        for (const g of groups) {
          const pin = document.createElement('div')
          pin.className = 'map-pin' + (g.placeId === 'maja-e-vajushes' ? ' map-pin-summit' : '')
          pin.tabIndex = -1
          pin.setAttribute('aria-hidden', 'true')
          pin.dataset.placeId = g.placeId
          pin.textContent = String(pinNumber(g, activeRef.current))
          if (g.stops.some((s) => s.id === activeRef.current)) pin.classList.add('is-active')
          pin.addEventListener('click', (ev) => {
            ev.stopPropagation()
            const picked = pickStopFromMarker(g, activeRef.current)
            onMarkerRef.current(picked.id)
          })
          const marker = new maplibregl.Marker({ element: pin, anchor: 'center' }).setLngLat([g.lng, g.lat]).addTo(map)
          markersRef.current.push(marker)
        }

        writeCamera(cameraHost, map)
        onReadyRef.current?.()
        el.classList.add('map-live')

        // Terrain AFTER first paint: hillshade + contours on idle. No DEM requests before this.
        let terrainAdded = false
        const add = () => {
          if (terrainAdded || cancelled || !map) return
          terrainAdded = true
          try {
            addTerrainLayers(map)
            terrainReadyRef.current = true
          } catch (err) {
            console.warn('Terrain layers could not be added (hillshade/contours skipped):', err)
          }
        }
        map.once('idle', add)
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(add, { timeout: 2500 })
        } else {
          setTimeout(add, 50)
        }
      })

      map.on('moveend', () => {
        if (map) writeCamera(cameraHost, map)
      })

      map.on('error', (e) => {
        const msg = String((e as { error?: { message?: string } }).error?.message ?? '')
        if (!loadedRef.current && /webgl|getcontext|failed to initialize/i.test(msg)) {
          onFailRef.current?.()
        }
      })
    } catch {
      onFailRef.current?.()
    }

    const onResize = () => map?.resize()
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      if (failTimer) clearTimeout(failTimer)
      window.removeEventListener('resize', onResize)
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      hoverMarkerRef.current?.remove()
      hoverMarkerRef.current = null
      map?.remove()
      mapRef.current = null
    }
    // trip is stable for this page
  }, [trip, cameraHost])

  useEffect(() => {
    const groups = groupPlaces(trip.stops)
    for (const marker of markersRef.current) {
      const pin = marker.getElement()
      const placeId = pin.dataset.placeId
      const g = groups.find((x) => x.placeId === placeId)
      if (!g) continue
      pin.textContent = String(pinNumber(g, activeId))
      pin.classList.toggle('is-active', g.stops.some((s) => s.id === activeId))
    }
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const stop = trip.stops.find((s) => s.id === activeId)
    setLegEmphasis(map, activeLegForStop(stop?.order ?? 1))
  }, [activeId, trip.stops])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const reduced = prefersReducedMotion()
    const pad = padding()

    map.stop()
    if (mode === 'whole') {
      map.fitBounds(boundsFor(allRouteCoords(trip.route)), {
        padding: pad,
        duration: reduced ? 0 : 800,
        pitch: 0,
      })
      return
    }
    if (mode === 'climb') {
      const hike = hikeLeg(trip.route)
      const pts = (hike?.geometry.coordinates ?? climbStops(trip.stops).map((s) => [s.lng, s.lat])) as [number, number][]
      const pitch = terrain3d && allow3D() && !reduced ? 50 : 0
      map.fitBounds(boundsFor(pts), {
        padding: pad,
        duration: reduced ? 0 : 800,
        maxZoom: 14,
        pitch,
      })
      return
    }
    const stop: Stop | undefined = trip.stops.find((s) => s.id === activeId)
    if (!stop) return
    const camera = {
      center: [stop.lng, stop.lat] as [number, number],
      zoom: 13,
      padding: pad,
      pitch: terrain3d && allow3D() && !reduced && stop.order === 4 ? 50 : 0,
    }
    if (reduced) map.jumpTo({ center: camera.center, zoom: camera.zoom, pitch: 0 })
    else map.flyTo({ ...camera, duration: 800 })
  }, [activeId, mode, trip, terrain3d])

  // 3D terrain: desktop/opt-in only, never on phone, never under reduced motion.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const on = terrain3d && allow3D()
    const apply = () => {
      if (!map.getSource('dem')) return
      try {
        if (on) {
          map.setTerrain({ source: 'dem', exaggeration: 1.3 })
          // Pitch is owned by the camera effect for climb/stop flyTo; only
          // nudge pitch here when we are already looking at that view and
          // not mid-flight.
        } else if (map.getTerrain()) {
          map.setTerrain(null)
          if (map.getPitch() > 0.5) {
            map.easeTo({ pitch: 0, duration: prefersReducedMotion() ? 0 : 400 })
          }
        }
      } catch {
        /* dem source may not be ready yet */
      }
    }
    apply()
    const t = setInterval(() => {
      if (map.getSource('dem')) {
        apply()
        clearInterval(t)
      }
    }, 200)
    const kill = setTimeout(() => clearInterval(t), 6000)
    return () => {
      clearInterval(t)
      clearTimeout(kill)
    }
  }, [terrain3d, mode])

  // Elevation-profile scrubber marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    if (!hoverLngLat) {
      hoverMarkerRef.current?.remove()
      hoverMarkerRef.current = null
      return
    }
    if (!hoverMarkerRef.current) {
      const dot = document.createElement('div')
      dot.className = 'profile-hover-dot'
      dot.setAttribute('aria-hidden', 'true')
      hoverMarkerRef.current = new maplibregl.Marker({ element: dot, anchor: 'center' }).setLngLat(hoverLngLat).addTo(map)
    } else {
      hoverMarkerRef.current.setLngLat(hoverLngLat)
    }
  }, [hoverLngLat])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[1] opacity-0 transition-opacity duration-200 [&:is(.map-live)]:opacity-100 motion-reduce:transition-none motion-reduce:[&:is(.map-live)]:opacity-100"
      data-testid="maplibre"
    />
  )
}
