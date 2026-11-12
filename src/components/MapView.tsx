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
  onTerrainReady?: () => void
  cameraHost: HTMLElement | null
}

const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

const MOUNTAIN_SVG =
  '<svg class="map-pin-mountain" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>'

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: '/glyphs/{fontstack}/{range}.pbf',
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
        'raster-saturation': -0.7,
        'raster-contrast': -0.18,
        'raster-brightness-min': 0.1,
      },
    },
  ],
}

function isLg() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
}

/** 3D is allowed whenever the user (or desktop auto-on) asked for it, unless reduced motion. */
function allow3D() {
  return typeof window !== 'undefined' && !prefersReducedMotion()
}

function clampPad(
  pad: maplibregl.PaddingOptions,
  width: number,
  height: number,
): maplibregl.PaddingOptions {
  const top = Number(pad.top) || 0
  const bottom = Number(pad.bottom) || 0
  const left = Number(pad.left) || 0
  const right = Number(pad.right) || 0
  const maxV = Math.max(48, height - 64)
  const maxH = Math.max(48, width - 64)
  let t = top
  let b = bottom
  let l = left
  let r = right
  if (t + b > maxV) {
    const s = maxV / (t + b)
    t = Math.floor(t * s)
    b = Math.floor(b * s)
  }
  if (l + r > maxH) {
    const s = maxH / (l + r)
    l = Math.floor(l * s)
    r = Math.floor(r * s)
  }
  return { top: t, right: r, bottom: b, left: l }
}


/** MapLibre adds fit/fly `padding` on top of the transform’s persistent padding
 *  from the last camera call. After a padded flyTo (e.g. to the summit, with
 *  the sheet as bottom padding) a later fitBounds would double-count and warn
 *  “cannot fit within canvas”, leaving the camera stuck. Always zero it first. */
function resetPadding(map: maplibregl.Map) {
  const z = { top: 0, right: 0, bottom: 0, left: 0 }
  const cur = map.getPadding?.() ?? z
  if (cur.top || cur.right || cur.bottom || cur.left) {
    map.setPadding(z)
  }
}

/** Camera padding. Phone climb uses the measured sheet overlap; desktop climb is ≥64 plus room for controls. */
function padding(map: maplibregl.Map | undefined, mode: MapViewMode): maplibregl.PaddingOptions {
  const container = map?.getContainer()
  const pane = (container?.closest('[data-active-stop]') as HTMLElement | null) ?? container
  const rect = pane?.getBoundingClientRect()
  const width = rect?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 390)
  const height = rect?.height ?? 380

  if (isLg()) {
    if (mode === 'climb') {
      // ≥64 all sides, extra top/right so Whole day / 3D / attribution and the summit pin
      // sit clear of the edge and of the basemap "Maja e Vajushës 2057 m" label.
      return clampPad({ top: 128, right: 120, bottom: 88, left: 80 }, width, height)
    }
    return clampPad({ top: 64, right: 64, bottom: 64, left: 64 }, width, height)
  }

  const sheet = typeof document !== 'undefined' ? document.querySelector('[data-sheet]') : null
  let overlap = 0
  if (rect && sheet) {
    const sr = sheet.getBoundingClientRect()
    overlap = Math.max(0, Math.round(rect.bottom - sr.top))
  }
  const bottom = overlap + 24
  // Clear the top-right stack (view toggle + 3D + attribution) and the wordmark.
  const top = mode === 'climb' ? 112 : 80
  return clampPad({ top, right: 36, bottom, left: 36 }, width, height)
}

function boundsFor(coords: [number, number][]) {
  const b = new maplibregl.LngLatBounds(coords[0], coords[0])
  for (const c of coords) b.extend(c)
  return b
}

function hikeBounds(trip: Trip): maplibregl.LngLatBounds {
  const hike = hikeLeg(trip.route)
  const pts = (hike?.geometry.coordinates ?? climbStops(trip.stops).map((s) => [s.lng, s.lat])) as [
    number,
    number,
  ][]
  return boundsFor(pts)
}


function refreshMarkers(markers: maplibregl.Marker[]) {
  for (const m of markers) {
    // Re-project so HTML pins follow terrain after setTerrain / pitch.
    m.setLngLat(m.getLngLat())
  }
}

/** Resolve on the next map idle, or after `timeout` ms if idle already fired. */
function waitIdle(map: maplibregl.Map, timeout = 1800): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    map.once('idle', finish)
    setTimeout(finish, timeout)
  })
}

function writeCamera(host: HTMLElement | null, map: maplibregl.Map) {
  if (!host) return
  const c = map.getCenter()
  host.dataset.mapLng = c.lng.toFixed(5)
  host.dataset.mapLat = c.lat.toFixed(5)
  host.dataset.mapZoom = map.getZoom().toFixed(2)
  host.dataset.mapPitch = map.getPitch().toFixed(1)
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

function paintPin(pin: HTMLElement, group: ReturnType<typeof groupPlaces>[number], activeId: string) {
  const num = String(pinNumber(group, activeId))
  const isSummit = group.placeId === 'maja-e-vajushes'
  pin.classList.toggle('is-active', group.stops.some((s) => s.id === activeId))
  pin.classList.toggle('map-pin-summit', isSummit)
  if (isSummit) {
    pin.innerHTML = `${MOUNTAIN_SVG}<span class="map-pin-num">${num}</span>`
    pin.setAttribute('aria-label', `${num}, Maja e Vajushës`)
  } else {
    pin.textContent = num
    pin.setAttribute('aria-label', num)
  }
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
        // MapLibre glyph atlas ships Open Sans, not Source Sans 3; Semibold ≈ the 600 weight in the spec.
        'text-font': ['Source Sans 3 SemiBold'],
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
  onTerrainReady,
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
  const onTerrainReadyRef = useRef(onTerrainReady)
  const onMarkerRef = useRef(onMarkerSelect)
  onReadyRef.current = onReady
  onFailRef.current = onFail
  onTerrainReadyRef.current = onTerrainReady
  onMarkerRef.current = onMarkerSelect
  const activeRef = useRef(activeId)
  activeRef.current = activeId
  const modeRef = useRef(mode)
  modeRef.current = mode
  const camKeyRef = useRef({ activeId, mode })

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

        // First paint is always a flat fit of the whole day — 3D stays out of this path.
        resetPadding(map)
        map.fitBounds(boundsFor(allRouteCoords(trip.route)), {
          padding: padding(map, 'whole'),
          duration: 0,
          pitch: 0,
        })

        const groups = groupPlaces(trip.stops)
        for (const g of groups) {
          const pin = document.createElement('div')
          pin.className = 'map-pin'
          pin.tabIndex = -1
          pin.setAttribute('aria-hidden', 'true')
          pin.dataset.placeId = g.placeId
          paintPin(pin, g, activeRef.current)
          pin.addEventListener('click', (ev) => {
            ev.stopPropagation()
            const picked = pickStopFromMarker(g, activeRef.current)
            onMarkerRef.current(picked.id)
          })
          const isSummit = g.placeId === 'maja-e-vajushes'
          // Summit pin sits just above the peak so it does not cover the OSM
          // "Maja e Vajushës 2057 m" raster label at the same coordinate.
          const marker = new maplibregl.Marker({
            element: pin,
            anchor: isSummit ? 'bottom' : 'center',
            offset: isSummit ? [10, -6] : [0, 0],
            pitchAlignment: 'viewport',
            rotationAlignment: 'viewport',
          })
            .setLngLat([g.lng, g.lat])
            .addTo(map)
          markersRef.current.push(marker)
        }

        writeCamera(cameraHost, map)
        onReadyRef.current?.()
        el.classList.add('map-live')
        // MapLibre's stylesheet sets position:relative and can win over Tailwind
        // `absolute` once the lazy CSS chunk loads after index.css; the container
        // is !absolute so it fills the pane. Resize after that layout.
        map.resize()

        // Terrain AFTER first paint: hillshade + contours on idle. No DEM requests before this.
        let terrainAdded = false
        const add = () => {
          if (terrainAdded || cancelled || !map) return
          terrainAdded = true
          try {
            addTerrainLayers(map)
            terrainReadyRef.current = true
            // Notify the parent after the DEM is in, so desktop can turn 3D on
            // without putting it on the first-paint path.
            onTerrainReadyRef.current?.()
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
      paintPin(pin, g, activeId)
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
    const wantPitch = (m: MapViewMode, order?: number) => {
      if (!terrain3d || !allow3D() || reduced) return 0
      if (m === 'climb') return 50
      if (m === 'stop' && order === 4) return 50
      return 0
    }

    const prev = camKeyRef.current
    const only3d = prev.activeId === activeId && prev.mode === mode
    camKeyRef.current = { activeId, mode }

    let cancelled = false
    const frameClimb = async (pitch: number, duration: number) => {
      // If 3D is requested, wait until the DEM terrain is actually on and idle
      // before fitting — otherwise the hike ends up off-canvas once pitch applies.
      if (pitch > 0) {
        if (!map.getSource('dem')) return
        if (!map.getTerrain()) {
          try {
            map.setTerrain({ source: 'dem', exaggeration: 1.3 })
          } catch {
            return
          }
        }
        await waitIdle(map, 2000)
        if (cancelled) return
      }
      const pad = padding(map, 'climb')
      map.stop()
      resetPadding(map)
      map.fitBounds(hikeBounds(trip), {
        padding: pad,
        duration,
        maxZoom: 14,
        pitch,
      })
      await waitIdle(map, 2000)
      if (cancelled) return
      refreshMarkers(markersRef.current)
    }

    if (only3d) {
      if (mode === 'climb') {
        void frameClimb(wantPitch('climb'), reduced ? 0 : 700)
      } else if (mode === 'whole') {
        if (map.getPitch() > 0.5) {
          map.easeTo({ pitch: 0, duration: reduced ? 0 : 400 })
        }
      } else {
        const stop = trip.stops.find((s) => s.id === activeId)
        const pitch = wantPitch('stop', stop?.order)
        if (Math.abs(map.getPitch() - pitch) > 1) {
          map.easeTo({ pitch, duration: reduced ? 0 : 500 })
        }
      }
      return () => {
        cancelled = true
      }
    }

    map.stop()
    if (mode === 'whole') {
      resetPadding(map)
      map.fitBounds(boundsFor(allRouteCoords(trip.route)), {
        padding: padding(map, 'whole'),
        duration: reduced ? 0 : 800,
        pitch: 0,
      })
      return
    }
    if (mode === 'climb') {
      void frameClimb(wantPitch('climb'), reduced ? 0 : 800)
      return () => {
        cancelled = true
      }
    }
    const stop: Stop | undefined = trip.stops.find((s) => s.id === activeId)
    if (!stop) return
    const camera = {
      center: [stop.lng, stop.lat] as [number, number],
      zoom: 13,
      padding: padding(map, 'stop'),
      pitch: wantPitch('stop', stop.order),
    }
    resetPadding(map)
    if (reduced) map.jumpTo({ center: camera.center, zoom: camera.zoom, pitch: 0 })
    else map.flyTo({ ...camera, duration: 800 })
  }, [activeId, mode, trip, terrain3d])

  // 3D terrain source: set after the DEM is on the map, then re-frame the climb on idle.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const on = terrain3d && allow3D()
    let cancelled = false
    const apply = async () => {
      if (!map.getSource('dem')) return false
      try {
        if (on) {
          if (!map.getTerrain()) map.setTerrain({ source: 'dem', exaggeration: 1.3 })
          await waitIdle(map, 2000)
          if (cancelled) return true
          refreshMarkers(markersRef.current)
          // Camera effect also frames; do it here too so a late setTerrain
          // after a 2D climb fit gets a correct pitched frame.
          if (modeRef.current === 'climb') {
            const reduced = prefersReducedMotion()
            map.stop()
            resetPadding(map)
            map.fitBounds(hikeBounds(trip), {
              padding: padding(map, 'climb'),
              duration: reduced ? 0 : 700,
              maxZoom: 14,
              pitch: 50,
            })
            await waitIdle(map, 2000)
            if (!cancelled) refreshMarkers(markersRef.current)
          }
        } else if (map.getTerrain()) {
          map.setTerrain(null)
          if (map.getPitch() > 0.5 && modeRef.current === 'whole') {
            map.easeTo({ pitch: 0, duration: prefersReducedMotion() ? 0 : 400 })
          }
          refreshMarkers(markersRef.current)
        }
        return true
      } catch {
        return false
      }
    }
    void apply()
    const t = setInterval(() => {
      void apply().then((ok) => {
        if (ok) clearInterval(t)
      })
    }, 200)
    const kill = setTimeout(() => clearInterval(t), 6000)
    return () => {
      cancelled = true
      clearInterval(t)
      clearTimeout(kill)
    }
  }, [terrain3d, mode, trip])

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
      className="!absolute inset-0 z-[1] h-full w-full opacity-0 transition-opacity duration-200 [&:is(.map-live)]:opacity-100 motion-reduce:transition-none motion-reduce:[&:is(.map-live)]:opacity-100"
      data-testid="maplibre"
    />
  )
}
