import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { MapSkeleton } from '@/components/MapSkeleton'
import { ClimbInset } from '@/components/ClimbInset'
import { ViewToggle } from '@/components/ViewToggle'
import { Wordmark } from '@/components/Wordmark'
import { MapAttribution } from '@/components/MapAttribution'
import { RouteLegend } from '@/components/RouteLegend'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Trip } from '@/types/trip'
import type { MapViewMode } from '@/components/map-types'
import { cn, prefersReducedMotion } from '@/lib/utils'
import { SHEET_FULL, SHEET_PEEK } from '@/lib/sheet'

const MapView = lazy(() => import('@/components/MapView'))

export function MapPane({
  trip,
  activeId,
  mode,
  snap = SHEET_PEEK,
  terrain3d,
  onTerrain3d,
  hoverLngLat,
  onModeChange,
  onMarkerSelect,
  onOpenClimb,
}: {
  trip: Trip
  activeId: string
  mode: MapViewMode
  snap?: number
  terrain3d: boolean
  onTerrain3d: (on: boolean) => void
  hoverLngLat: [number, number] | null
  onModeChange: (mode: 'whole' | 'climb') => void
  onMarkerSelect: (id: string) => void
  onOpenClimb: () => void
}) {
  const cameraHostRef = useRef<HTMLDivElement | null>(null)
  const [loadMap, setLoadMap] = useState(false)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null)

  // Start the MapView import only after `window` load, then a requestIdleCallback
  // with no short timeout (so the 1.1 MB chunk is less likely to land in TBT).
  // The map is the first screen and must appear without a tap. Interaction
  // (pointer, key, rail scroll) may start the import early, still after first paint.
  useEffect(() => {
    let started = false
    let cancelled = false
    let idleId: number | undefined
    let io: IntersectionObserver | undefined

    const start = () => {
      if (started || cancelled) return
      started = true
      setLoadMap(true)
    }

    const armIdle = () => {
      if (cancelled || started) return
      if (typeof requestIdleCallback === 'function') {
        idleId = requestIdleCallback(() => start())
      } else {
        idleId = window.setTimeout(start, 0)
      }
    }

    const afterLoadAndVisible = () => {
      if (cancelled || started) return
      if (document.readyState !== 'complete') return
      const el = cameraHostRef.current
      if (!el) {
        armIdle()
        return
      }
      const r = el.getBoundingClientRect()
      const inView = r.height > 0 && r.bottom > 0 && r.top < window.innerHeight
      if (inView) {
        armIdle()
        return
      }
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io?.disconnect()
          armIdle()
        }
      })
      io.observe(el)
    }

    if (document.readyState === 'complete') afterLoadAndVisible()
    else window.addEventListener('load', afterLoadAndVisible)

    const onInteract = () => start()
    const evOpts: AddEventListenerOptions = { capture: true, passive: true }
    window.addEventListener('pointerdown', onInteract, evOpts)
    window.addEventListener('keydown', onInteract, evOpts)
    window.addEventListener('touchstart', onInteract, evOpts)
    const onScroll = (e: Event) => {
      const t = e.target
      if (t instanceof Element && t.closest('[data-timeline-scroll]')) start()
    }
    document.addEventListener('scroll', onScroll, evOpts)

    return () => {
      cancelled = true
      window.removeEventListener('load', afterLoadAndVisible)
      window.removeEventListener('pointerdown', onInteract, evOpts)
      window.removeEventListener('keydown', onInteract, evOpts)
      window.removeEventListener('touchstart', onInteract, evOpts)
      document.removeEventListener('scroll', onScroll, evOpts)
      io?.disconnect()
      if (idleId != null) {
        if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId)
        else window.clearTimeout(idleId)
      }
    }
  }, [])

  // Vaul 1.1.2 does not forward `modal={false}` to Radix Dialog.Root, so
  // hideOthers() aria-hides the map pane (a sibling of the portaled drawer).
  // Strip that from the pane and its ancestors; leave our own child aria-hidden
  // (skeleton) alone.
  useEffect(() => {
    const pane = cameraHostRef.current
    if (!pane) return
    const clear = () => {
      let n: HTMLElement | null = pane
      while (n && n !== document.body) {
        if (n.getAttribute('aria-hidden') === 'true') {
          n.removeAttribute('aria-hidden')
          n.removeAttribute('data-aria-hidden')
        }
        n = n.parentElement
      }
    }
    clear()
    const mo = new MutationObserver(clear)
    mo.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-hidden', 'data-aria-hidden'],
    })
    return () => mo.disconnect()
  }, [hostEl])

  const reduced = typeof window !== 'undefined' && prefersReducedMotion()
  const sheetFull = snap >= (SHEET_PEEK + SHEET_FULL) / 2

  return (
    <div
      ref={(el) => {
        cameraHostRef.current = el
        if (el && el !== hostEl) setHostEl(el)
      }}
      className={cn(
        // Phone: full-viewport map; the sheet overlays it (40% / 88% snaps).
        'relative z-10 h-dvh min-h-[320px] w-full sticky top-0',
        'lg:order-2 lg:h-screen lg:max-h-none lg:min-h-0 lg:flex-1 lg:sticky lg:top-0',
      )}
      data-testid="map-pane"
      data-active-stop={activeId}
      data-map-mode={mode}
    >
      <p className="sr-only">Interactive map — the day’s stops are also listed in the timeline.</p>
      <div className="absolute inset-0 overflow-hidden bg-[#E4EDE4]" aria-hidden={ready ? undefined : true} role={ready ? undefined : "presentation"}>
        {/* Skeleton is the first paint / LCP. Cross-fade out over 200ms once the
            live map has its first idle; no fade when the user prefers reduced motion.
            Always out of the a11y tree. */}
        <div
          className={cn(
            'absolute inset-0 z-0 h-full w-full',
            ready ? 'pointer-events-none opacity-0' : 'opacity-100',
            !reduced && 'transition-opacity duration-200',
          )}
          aria-hidden="true"
          data-testid="map-skeleton"
        >
          <div className="hidden h-full w-full lg:block">
            <MapSkeleton trip={trip} activeId={activeId} variant="desktop" />
          </div>
          <div className="h-full w-full lg:hidden">
            <MapSkeleton trip={trip} activeId={activeId} variant="phone" />
          </div>
        </div>
        {loadMap && !failed && (
          <Suspense fallback={null}>
            <MapView
              trip={trip}
              activeId={activeId}
              mode={mode}
              terrain3d={terrain3d}
              hoverLngLat={hoverLngLat}
              onMarkerSelect={onMarkerSelect}
              onReady={() => setReady(true)}
              onFail={() => setFailed(true)}
              cameraHost={hostEl}
            />
          </Suspense>
        )}
      </div>
      {failed && (
        <p className="absolute inset-x-3 top-14 z-20 rounded-xl bg-surface/95 px-3 py-2 text-sm text-ink shadow-soft ring-1 ring-line">
          Map couldn’t load — the day is listed below.
        </p>
      )}
      <Wordmark pill className="absolute left-3 top-3 z-20 lg:hidden" />

      {/* Top-right: view toggle + 3D on one row, attribution under them, all inside the 12% map strip at full sheet. */}
      <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-1 lg:right-4 lg:top-4">
        <div className="flex items-center gap-1">
          <ViewToggle mode={mode} onChange={onModeChange} />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Toggle
                  pressed={terrain3d && !reduced}
                  onPressedChange={(v) => onTerrain3d(!!v)}
                  disabled={reduced}
                  data-testid="terrain-3d"
                  aria-label="3D terrain"
                  className="h-11 min-h-11 min-w-11 rounded-full px-3.5 text-xs shadow-soft ring-1 ring-line lg:text-sm bg-surface/95 aria-pressed:bg-pine aria-pressed:text-surface aria-[pressed=false]:bg-surface/95 aria-[pressed=false]:text-ink"
                >
                  3D
                </Toggle>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {reduced
                ? '3D is off because you prefer reduced motion'
                : 'Tilt the mountains with 3D terrain'}
            </TooltipContent>
          </Tooltip>
        </div>
        <MapAttribution className="max-w-[11.5rem] lg:max-w-none" />
      </div>

      {/* Legend: just above the sheet on the phone; at full snap sits under the wordmark so it never covers attribution. */}
      <RouteLegend
        className={cn(
          'absolute z-20 flex items-center gap-3 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-medium text-ink shadow-soft ring-1 ring-line backdrop-blur-sm',
          // 10.75rem leaves a gap before the 11.5rem attribution at 390px
          // (11.5rem + 11.5rem + 24px of insets is 2px wider than the viewport).
          'max-lg:max-w-[10.75rem] max-lg:flex-wrap max-lg:gap-x-2 max-lg:gap-y-0.5',
          sheetFull
            ? 'left-3 top-12 py-1 lg:left-4 lg:top-auto lg:bottom-4 lg:py-1.5'
            : 'left-3 lg:left-4 lg:bottom-4',
        )}
        style={sheetFull ? undefined : { bottom: 'calc(var(--sheet-snap, 0.4) * 100dvh + 12px)' }}
      />
      <ClimbInset
        visible={mode === 'whole' && !failed && !sheetFull}
        onSelect={onOpenClimb}
      />
    </div>
  )
}
