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

const MapView = lazy(() => import('@/components/MapView'))

export function MapPane({
  trip,
  activeId,
  mode,
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

  useEffect(() => {
    const start = () => setLoadMap(true)
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(start, { timeout: 1500 })
      return () => cancelIdleCallback(id)
    }
    const t = window.setTimeout(start, 1)
    return () => window.clearTimeout(t)
  }, [])

  const reduced = typeof window !== 'undefined' && prefersReducedMotion()

  return (
    <div
      ref={(el) => {
        cameraHostRef.current = el
        if (el && el !== hostEl) setHostEl(el)
      }}
      className={cn(
        'relative z-10 h-[45dvh] min-h-[320px] max-h-[420px] w-full sticky top-0',
        'lg:order-2 lg:h-screen lg:max-h-none lg:min-h-0 lg:flex-1 lg:sticky lg:top-0',
      )}
      data-active-stop={activeId}
      data-map-mode={mode}
    >
      <p className="sr-only">Interactive map — the day’s stops are also listed in the timeline.</p>
      <div className="absolute inset-0 overflow-hidden bg-[#E4EDE4]" aria-hidden="true" role="presentation">
        <div className="hidden h-full w-full lg:block">
          <MapSkeleton trip={trip} activeId={activeId} variant="desktop" />
        </div>
        <div className="h-full w-full lg:hidden">
          <MapSkeleton trip={trip} activeId={activeId} variant="phone" />
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
      <ViewToggle mode={mode} onChange={onModeChange} />
      {/* 3D is desktop/tablet only (≥768px), off by default, never under reduced motion */}
      <div className="absolute right-3 top-[3.35rem] z-20 hidden md:block lg:right-4 lg:top-[3.6rem]">
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              pressed={terrain3d && !reduced}
              onPressedChange={(v) => onTerrain3d(!!v)}
              disabled={reduced}
              aria-label="3D terrain, desktop only"
              className="h-11 min-h-11 rounded-full bg-surface/95 px-3.5 text-xs shadow-soft ring-1 ring-line lg:text-sm"
            >
              3D
            </Toggle>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {reduced ? '3D is off because you prefer reduced motion' : 'Tilt the climb with 3D terrain (off by default)'}
          </TooltipContent>
        </Tooltip>
      </div>
      {/* Attribution: top-right under the controls so the bottom sheet never covers it */}
      <MapAttribution className="absolute right-3 top-[4.5rem] z-20 md:top-[6.5rem] lg:right-4" />
      <RouteLegend className="absolute left-3 top-12 z-20 flex items-center gap-3 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-medium text-ink shadow-soft ring-1 ring-line backdrop-blur-sm lg:left-4 lg:top-auto lg:bottom-4" />
      <ClimbInset visible={mode === 'whole' && !failed} onSelect={onOpenClimb} />
    </div>
  )
}
