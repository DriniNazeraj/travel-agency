import { BookCta } from '@/components/BookCta'
import { ElevationProfile } from '@/components/ElevationProfile'
import { GearList } from '@/components/GearList'
import { MapPane } from '@/components/MapPane'
import { SummaryCard } from '@/components/SummaryCard'
import { Timeline } from '@/components/Timeline'
import { Wordmark } from '@/components/Wordmark'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getTrip, DEFAULT_TRIP_SLUG } from '@/lib/getTrip'
import { profilePointLngLat } from '@/lib/route'
import type { MapViewMode } from '@/components/map-types'
import { prefersReducedMotion } from '@/lib/utils'
import { useCallback, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Trip } from '@/types/trip'

export function TripItinerary({ slug: slugProp }: { slug?: string }) {
  const params = useParams()
  const slug = slugProp ?? params.slug ?? DEFAULT_TRIP_SLUG
  const trip = getTrip(slug)

  if (!trip) {
    return (
      <main className="mx-auto max-w-lg p-8 text-ink">
        <h1 className="font-display text-3xl font-semibold">Trip not found</h1>
        <p className="mt-2 text-ink-muted">There is no itinerary for “{slug}”.</p>
      </main>
    )
  }

  return <TripScreen trip={trip} />
}

function TripScreen({ trip: t }: { trip: Trip }) {
  const [activeId, setActiveId] = useState(t.stops[0].id)
  const [mode, setMode] = useState<MapViewMode>('whole')
  const [snap, setSnap] = useState(0.55)
  const [terrain3d, setTerrain3d] = useState(false)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const observeLockRef = useRef(false)
  const lockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const selectStop = useCallback(
    (id: string, source: 'click' | 'scroll' | 'keyboard' | 'marker') => {
      setActiveId(id)
      setMode('stop')
      if (source === 'click' || source === 'keyboard' || source === 'marker') {
        observeLockRef.current = true
        if (lockTimer.current) clearTimeout(lockTimer.current)
        lockTimer.current = setTimeout(() => {
          observeLockRef.current = false
        }, 900)
        const root = scrollRef.current
        const el = root?.querySelector<HTMLElement>(`[data-step-id="${id}"]`)
        el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
      }
    },
    [],
  )

  const onModeChange = useCallback((next: 'whole' | 'climb') => {
    setMode(next)
  }, [])

  const onOpenClimb = useCallback(() => {
    setMode('climb')
    setSnap(0.92)
    // Next frame so the expanded sheet is laid out before we scroll to the profile.
    requestAnimationFrame(() => {
      const el = document.getElementById('climb-profile')
      el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    })
  }, [])

  function toggleSnap() {
    setSnap((s) => (s < 0.7 ? 0.92 : 0.55))
  }

  const hover = hoverIndex != null ? profilePointLngLat(t, hoverIndex) : null
  const hoverLngLat: [number, number] | null = hover ? [hover.lng, hover.lat] : null

  return (
    <TooltipProvider delayDuration={400}>
      <div className="min-h-dvh bg-bg text-ink lg:flex lg:h-dvh lg:overflow-hidden">
        <MapPane
          trip={t}
          activeId={activeId}
          mode={mode}
          terrain3d={terrain3d}
          onTerrain3d={setTerrain3d}
          hoverLngLat={hoverLngLat}
          onModeChange={onModeChange}
          onMarkerSelect={(id) => selectStop(id, 'marker')}
          onOpenClimb={onOpenClimb}
        />

        <aside
          data-sheet
          style={{ ['--sheet-snap' as string]: snap }}
          className="sheet-mobile relative z-20 -mt-3 flex flex-col rounded-t-3xl bg-bg shadow-sheet max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 lg:order-1 lg:mt-0 lg:flex lg:h-screen lg:w-[420px] lg:shrink-0 lg:rounded-none lg:border-r lg:border-line lg:shadow-none"
        >
          <button
            type="button"
            aria-label={snap > 0.7 ? 'Collapse itinerary sheet' : 'Expand itinerary sheet'}
            onClick={toggleSnap}
            className="flex w-full shrink-0 items-center justify-center pb-1 pt-2 lg:hidden"
          >
            <span className="h-1 w-10 rounded-full bg-sand" aria-hidden="true" />
          </button>

          <div className="hidden shrink-0 px-6 pb-2 pt-6 lg:block">
            <Wordmark />
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 lg:px-6"
            data-timeline-scroll
          >
            <main>
              <p className="kicker text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
                {t.dateLabel} · Kelmend
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold leading-snug tracking-tight text-ink lg:text-4xl">
                Lëpushë to <span className="h1-rest lg:block">Maja e Vajushës</span>
              </h1>
              <p className="deck mt-2 text-sm leading-relaxed text-ink-muted">{t.deck}</p>
              <SummaryCard trip={t} />
              <ElevationProfile profile={t.elevationProfile} hoverIndex={hoverIndex} onHover={setHoverIndex} />
              <Timeline
                stops={t.stops}
                activeId={activeId}
                onSelect={selectStop}
                scrollRootRef={scrollRef}
                observeLockRef={observeLockRef}
              />
              <Separator className="mt-6" />
              <GearList slug={t.slug} items={t.gear} />
            </main>
          </div>

          <BookCta trip={t} />
        </aside>
      </div>
    </TooltipProvider>
  )
}
