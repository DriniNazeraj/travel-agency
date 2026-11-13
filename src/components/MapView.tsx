import { useEffect, useLayoutEffect, useRef } from 'react'
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
/** Cap overzoom so climb (zoom 13–14) reuses z11 tiles instead of pulling a z12–14 band. */
const DEM_MAXZOOM = 11

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

/** 3D is allowed when the user asked for it, unless reduced motion. */
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
 *  the sheet as bottom padding) a later cameraForBounds would double-count and
 *  warn “cannot fit within canvas”, leaving the camera stuck. Always zero it first. */
function resetPadding(map: maplibregl.Map) {
  map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 })
}

type CamGen = { current: number; cleanup?: () => void }

type CamMoveOpts = {
  padding: maplibregl.PaddingOptions
  pitch: number
  duration: number
  maxZoom?: number
  bearing?: number
}

type CamTarget = { lng: number; lat: number; zoom: number; pitch: number; bearing: number }

function lngLatOf(center: maplibregl.LngLatLike): { lng: number; lat: number } {
  if (Array.isArray(center)) return { lng: Number(center[0]), lat: Number(center[1]) }
  const c = center as { lng: number; lat: number }
  return { lng: c.lng, lat: c.lat }
}


/**
 * Apply an ease on the next frame (so we are not inside a previous ease's
 * synchronous `_onEaseEnd` / `moveend` — MapLibre can drop the new jump there)
 * and re-assert the target on `moveend` and a timeout. Only the newest `gen`
 * applies; a stale callback is a no-op. If the ease was dropped, jumpTo the
 * latest target so it always wins.
 */
function scheduleEase(
  map: maplibregl.Map,
  genBox: CamGen,
  gen: number,
  duration: number,
  easeOpts: maplibregl.EaseToOptions,
  target: CamTarget,
  onSettled?: () => void,
) {
  // Cancel any previous ensure/timeout so a stale jumpTo cannot overwrite
  // the newest target after the next keyboard request.
  genBox.cleanup?.()
  genBox.cleanup = undefined

  const stillMine = () => gen === genBox.current && !!map.getContainer()

  const apply = () => {
    if (!stillMine()) {
      return
    }
    map.stop()
    map.easeTo({ ...easeOpts, essential: true, duration: Math.max(0, duration) })
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let done = false
  const finish = () => {
    if (done) return
    done = true
    if (timeoutId != null) clearTimeout(timeoutId)
    timeoutId = undefined
    map.off('moveend', finish)
    if (genBox.cleanup === cleanup) genBox.cleanup = undefined
    if (!stillMine()) {
      return
    }
    const c = map.getCenter()
    const far =
      Math.hypot(c.lng - target.lng, c.lat - target.lat) > 0.015 ||
      Math.abs(map.getZoom() - target.zoom) > 0.85 ||
      Math.abs(map.getPitch() - target.pitch) > 8
    if (far) {
      map.stop()
      map.jumpTo({
        center: [target.lng, target.lat],
        zoom: target.zoom,
        pitch: target.pitch,
        bearing: target.bearing,
      })
    }
    onSettled?.()
  }
  const cleanup = () => {
    done = true
    if (timeoutId != null) clearTimeout(timeoutId)
    timeoutId = undefined
    map.off('moveend', finish)
  }
  genBox.cleanup = cleanup

  // Apply synchronously, after stop() has already run the previous
  // `_onEaseEnd` / moveend. Stale ensures were cancelled above, so they
  // cannot drop or overwrite this jump. Avoid rAF — a deferred start
  // made a 900ms keyboard tour always land one stop behind.
  apply()
  if (duration <= 0) {
    finish()
    return
  }
  if (!stillMine()) return
  map.once('moveend', finish)
  timeoutId = setTimeout(finish, duration + 120)
}

/**
 * Stop in-flight motion, drop stale padding, compute a camera with
 * `cameraForBounds(bounds, {padding, pitch, bearing})` (the fit math is 2D —
 * MapLibre does not model pitch or terrain elevation), then `easeTo` that
 * camera with the requested pitch. Retries with smaller padding if the first
 * compute cannot fit. `genBox`/`gen` make only the newest request apply.
 */
function easeToBounds(
  map: maplibregl.Map,
  bounds: maplibregl.LngLatBounds,
  opts: CamMoveOpts,
  genBox?: CamGen,
  gen?: number,
): boolean {
  const box = genBox ?? { current: 0 }
  const my = gen ?? ++box.current
  map.stop()
  resetPadding(map)

  const bearing = opts.bearing ?? 0
  const maxZoom = opts.maxZoom ?? 14
  const pitch = opts.pitch ?? 0

  const compute = (pad: maplibregl.PaddingOptions) =>
    map.cameraForBounds(bounds, { padding: pad, pitch, bearing, maxZoom })

  let cam = compute(opts.padding)
  if (!cam) cam = compute({ top: 48, right: 48, bottom: 48, left: 48 })
  if (!cam) cam = compute({ top: 24, right: 24, bottom: 24, left: 24 })
  if (!cam || cam.center == null || cam.zoom == null) {
    return false
  }
  if (my !== box.current) {
    return false
  }

  let zoom = cam.zoom
  if (pitch > 1) {
    const shrink = Math.log2(Math.max(0.55, Math.cos((pitch * Math.PI) / 180)))
    zoom = Math.min(maxZoom, Math.max(0, zoom + shrink))
  }

  const ll = lngLatOf(cam.center)
  scheduleEase(
    map,
    box,
    my,
    opts.duration,
    {
      center: cam.center,
      zoom,
      bearing: cam.bearing ?? bearing,
      pitch,
      essential: true,
    },
    { lng: ll.lng, lat: ll.lat, zoom, pitch, bearing: cam.bearing ?? bearing },
  )
  return true
}

/** Frame a stop in the padded visual center without setting persistent padding. */
function easeToPoint(
  map: maplibregl.Map,
  center: [number, number],
  opts: { zoom: number; pitch: number; padding: maplibregl.PaddingOptions; duration: number },
  genBox?: CamGen,
  gen?: number,
): boolean {
  const box = genBox ?? { current: 0 }
  const my = gen ?? ++box.current
  map.stop()
  resetPadding(map)
  if (my !== box.current) {
    return false
  }

  const d = 0.0015
  const bounds = new maplibregl.LngLatBounds(
    [center[0] - d, center[1] - d],
    [center[0] + d, center[1] + d],
  )
  const cam = map.cameraForBounds(bounds, {
    padding: opts.padding,
    pitch: opts.pitch,
    bearing: 0,
    maxZoom: opts.zoom,
  })
  const p = opts.padding
  const ox = ((p.left ?? 0) - (p.right ?? 0)) / 2
  const oy = ((p.top ?? 0) - (p.bottom ?? 0)) / 2
  const dest = cam?.center != null ? lngLatOf(cam.center) : { lng: center[0], lat: center[1] }
  const easeOpts: maplibregl.EaseToOptions =
    cam && cam.center != null
      ? {
          center: cam.center,
          zoom: opts.zoom,
          bearing: 0,
          pitch: opts.pitch,
          essential: true,
        }
      : {
          center,
          zoom: opts.zoom,
          pitch: opts.pitch,
          bearing: 0,
          offset: [ox, oy],
          essential: true,
        }

  scheduleEase(
    map,
    box,
    my,
    opts.duration,
    easeOpts,
    { lng: dest.lng, lat: dest.lat, zoom: opts.zoom, pitch: opts.pitch, bearing: 0 },
  )
  return true
}

/** Visible height of the phone sheet where it overlaps the map (peek 40% or the current snap). */
function visibleSheetHeight(mapRect: DOMRect | undefined): number {
  const fallback = Math.round(0.4 * (mapRect?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 844)))
  if (typeof document === 'undefined') return fallback
  // Prefer .sheet-snap-body (the 40%/88% column) over the 100dvh vaul drawer.
  const el =
    (document.querySelector('.sheet-snap-body') as HTMLElement | null) ??
    (document.querySelector('[data-sheet]') as HTMLElement | null)
  if (el && mapRect) {
    const sr = el.getBoundingClientRect()
    const overlap = Math.max(
      0,
      Math.round(Math.min(sr.bottom, mapRect.bottom) - Math.max(sr.top, mapRect.top)),
    )
    if (overlap > 0) return overlap
  }
  const snap = Number(document.querySelector('[data-sheet-snap]')?.getAttribute('data-sheet-snap'))
  const vh = typeof window !== 'undefined' ? window.innerHeight : fallback / 0.4
  return Math.round((Number.isFinite(snap) && snap > 0 && snap <= 1 ? snap : 0.4) * vh)
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

  const vw = typeof window !== 'undefined' ? window.innerWidth : width
  const sheet = typeof document !== 'undefined' ? document.querySelector('[data-sheet]') : null
  let overlap = 0
  if (rect && sheet) {
    const sr = sheet.getBoundingClientRect()
    overlap = Math.max(0, Math.round(rect.bottom - sr.top))
  }
  // Phone whole-day (<768): ~120px top clears the wordmark, view/3D toggles
  // and attribution; bottom is the sheet's actual current height (peek 40%
  // or the live snap) + 24px. Same resetPadding + cameraForBounds path as
  // The climb (via easeToBounds). Desktop (isLg) is unchanged above.
  if (mode === 'whole' && vw < 768) {
    // 120 clears the control + attribution stack (~100px). The summit pin is
    // bottom-anchored with a -6 y offset, so its graphic sits ~34px above the
    // padded coordinate; add that so the pin itself is below 120px.
    const top = 120 + 36
    // +24 as specified, plus half the 28px pin so Tirana (center-anchored)
    // sits fully above the sheet, not just its coordinate.
    const bottom = visibleSheetHeight(rect) + 24 + 16
    return clampPad({ top, right: 36, bottom, left: 36 }, width, height)
  }
  const bottom = overlap + 24
  // Clear the top-right stack (view toggle + 3D + attribution) and the wordmark.
  const top = mode === 'climb' ? 112 : 80
  // Phone climb (<768): extra ~32px right so the summit pin clears the
  // canvas edge and the basemap "Maja e Vajushës 2057 m" label. Desktop
  // climb framing (isLg, above) is unchanged.
  const right = mode === 'climb' && vw < 768 ? 36 + 32 : 36
  return clampPad({ top, right, bottom, left: 36 }, width, height)
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
  if (map.getSource('dem')) return
  // Every DEM consumer is capped at DEM_MAXZOOM (11): DemSource itself
  // (shared protocol + contour fetches), the raster-dem `dem` source
  // (hillshade + setTerrain share it), and the contours vector source.
  const demSource = new mlcontour.DemSource({
    url: DEM_URL,
    encoding: 'terrarium',
    maxzoom: DEM_MAXZOOM,
    worker: true,
  })
  demSource.setupMaplibre(maplibregl)

  map.addSource('dem', {
    type: 'raster-dem',
    encoding: 'terrarium',
    tiles: [demSource.sharedDemProtocolUrl],
    tileSize: 256,
    maxzoom: DEM_MAXZOOM,
    attribution: 'Terrain: Mapzen / AWS Terrain Tiles',
  })

  map.addSource('contours', {
    type: 'vector',
    tiles: [
      demSource.contourProtocolUrl({
        multiplier: 1,
        // z11 covers the climb (map zoom 13–14 overzooms). 100 m minor, 250 m index.
        thresholds: {
          11: [100, 250],
        },
      }),
    ],
    maxzoom: DEM_MAXZOOM,
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
        'hillshade-exaggeration': 0.4,
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
  cameraHost,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null)
  const loadedRef = useRef(false)
  const onReadyRef = useRef(onReady)
  const onFailRef = useRef(onFail)
  const onMarkerRef = useRef(onMarkerSelect)
  onReadyRef.current = onReady
  onFailRef.current = onFail
  onMarkerRef.current = onMarkerSelect
  const activeRef = useRef(activeId)
  activeRef.current = activeId
  const modeRef = useRef(mode)
  modeRef.current = mode
  const camKeyRef = useRef({ activeId, mode })
  const camGenRef = useRef<CamGen>({ current: 0 })

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
        easeToBounds(map, boundsFor(allRouteCoords(trip.route)), {
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

        // MapLibre's stylesheet sets position:relative and can win over Tailwind
        // `absolute` once the lazy CSS chunk loads after index.css; the container
        // is !absolute so it fills the pane. Resize, then re-fit the whole-day
        // camera (same stop / resetPadding / cameraForBounds path as The climb)
        // so phone padding sees the measured sheet.
        map.resize()
        easeToBounds(map, boundsFor(allRouteCoords(trip.route)), {
          padding: padding(map, 'whole'),
          duration: 0,
          pitch: 0,
        })
        writeCamera(cameraHost, map)

        // Reveal (cross-fade from the skeleton) on the first idle — the route
        // is on the map, and no DEM has been requested. Hillshade/contours/3D
        // DEM wait for climb or an explicit 3D toggle.
        const reveal = () => {
          if (cancelled) return
          onReadyRef.current?.()
          el.classList.add('map-live')
          map?.resize()
          // Re-fit after the reveal resize so phone whole-day padding sees
          // the final layout (sheet height and canvas size).
          if (map && modeRef.current === 'whole') {
            easeToBounds(map, boundsFor(allRouteCoords(trip.route)), {
              padding: padding(map, 'whole'),
              duration: 0,
              pitch: 0,
            })
            writeCamera(cameraHost, map)
          }
        }
        map.once('idle', reveal)
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

  // useLayoutEffect so the camera move starts in the same turn as the
  // keyboard/click handler — a 900ms Enter tour must not start one frame late.
  useLayoutEffect(() => {
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

    // Newest *target* always wins. Do not bump the token or cancel an
    // in-flight ease when this effect re-runs for the same stop (a new
    // `trip` identity or a parent render used to drop the jump and then
    // take the only3d path, which does not re-issue the center move).
    const box = camGenRef.current
    const targetChanged = !only3d
    if (targetChanged) {
      box.current += 1
      box.cleanup?.()
      box.cleanup = undefined
    }
    const gen = box.current
    let cancelled = false
    const stillMine = () => !cancelled && gen === box.current

    const frameClimb = async (pitch: number, duration: number) => {
      if (pitch > 0) {
        addTerrainLayers(map)
        if (map.getSource('dem') && !map.getTerrain()) {
          try {
            map.setTerrain({ source: 'dem', exaggeration: 1.3 })
          } catch {
            // Still frame in 2D with pitch; terrain can catch up.
          }
        }
      }
      if (!stillMine()) return
      const ok = easeToBounds(
        map,
        hikeBounds(trip),
        {
          padding: padding(map, 'climb'),
          pitch,
          duration,
          maxZoom: 14,
          bearing: 0,
        },
        box,
        gen,
      )
      if (!ok) return
      await waitIdle(map, 2000)
      if (!stillMine()) return
      refreshMarkers(markersRef.current)
    }

    // Click and keyboard both change activeId and come through this same path.
    if (only3d) {
      if (mode === 'climb') {
        addTerrainLayers(map)
        void frameClimb(wantPitch('climb'), reduced ? 0 : 700)
      } else if (mode === 'whole') {
        if (map.getPitch() > 0.5) {
          box.current += 1
          const pitchGen = box.current
          const c = map.getCenter()
          scheduleEase(
            map,
            box,
            pitchGen,
            reduced ? 0 : 400,
            { pitch: 0, essential: true },
            { lng: c.lng, lat: c.lat, zoom: map.getZoom(), pitch: 0, bearing: map.getBearing() },
          )
        }
      } else {
        const stop = trip.stops.find((s) => s.id === activeId)
        const pitch = wantPitch('stop', stop?.order)
        if (Math.abs(map.getPitch() - pitch) > 1) {
          box.current += 1
          const pitchGen = box.current
          const c = map.getCenter()
          scheduleEase(
            map,
            box,
            pitchGen,
            reduced ? 0 : 500,
            { pitch, essential: true },
            { lng: c.lng, lat: c.lat, zoom: map.getZoom(), pitch, bearing: 0 },
          )
        }
      }
      return () => {
        cancelled = true
        // Do not bump the token: a same-target re-run must not cancel a
        // center ease that is still in flight.
      }
    }

    if (mode === 'whole') {
      easeToBounds(
        map,
        boundsFor(allRouteCoords(trip.route)),
        {
          padding: padding(map, 'whole'),
          duration: reduced ? 0 : 800,
          pitch: 0,
        },
        box,
        gen,
      )
      return () => {
        cancelled = true
        box.cleanup?.()
        box.cleanup = undefined
        box.current++
      }
    }
    if (mode === 'climb') {
      addTerrainLayers(map)
      void frameClimb(wantPitch('climb'), reduced ? 0 : 800)
      return () => {
        cancelled = true
        box.cleanup?.()
        box.cleanup = undefined
        box.current++
      }
    }
    const stop: Stop | undefined = trip.stops.find((s) => s.id === activeId)
    if (!stop) return
    easeToPoint(
      map,
      [stop.lng, stop.lat],
      {
        zoom: 13,
        padding: padding(map, 'stop'),
        pitch: wantPitch('stop', stop.order),
        // 2D: 550ms settles inside a 900ms keyboard interval. 3D jumps
        // immediately — DEM tile work can stall ease frames and moveend
        // past that interval, which dropped the latest target.
        duration: reduced || terrain3d ? 0 : 550,
      },
      box,
      gen,
    )
    return () => {
      cancelled = true
      box.cleanup?.()
      box.cleanup = undefined
      box.current++
    }
    // trip is stable for this page; do not depend on its identity.
  }, [activeId, mode, terrain3d])

  // 3D terrain source: attach or detach DEM. Camera motion is owned by the
  // camera effect (terrain3d is in its deps) so this does not start a competing
  // fitBounds — that race left The climb stuck on the previous stop.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const on = terrain3d && allow3D()
    let cancelled = false
    const apply = async () => {
      try {
        if (on) {
          addTerrainLayers(map)
          if (!map.getSource('dem')) return false
          if (!map.getTerrain()) map.setTerrain({ source: 'dem', exaggeration: 1.3 })
          await waitIdle(map, 2000)
          if (cancelled) return true
          refreshMarkers(markersRef.current)
          return true
        } else if (map.getTerrain()) {
          map.setTerrain(null)
          if (map.getPitch() > 0.5 && modeRef.current === 'whole') {
            map.stop()
            map.easeTo({ pitch: 0, duration: prefersReducedMotion() ? 0 : 400, essential: true })
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
  }, [terrain3d])

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
