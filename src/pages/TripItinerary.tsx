import { BookCta } from '@/components/BookCta'
import { ElevationProfile } from '@/components/ElevationProfile'
import { GearList } from '@/components/GearList'
import { MapPane } from '@/components/MapPane'
import { SummaryCard } from '@/components/SummaryCard'
import { Timeline } from '@/components/Timeline'
import { Wordmark } from '@/components/Wordmark'
import { Drawer, DrawerContent, DrawerHandle } from '@/components/ui/drawer'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getTrip, DEFAULT_TRIP_SLUG } from '@/lib/getTrip'
import { profilePointLngLat } from '@/lib/route'
import type { MapViewMode } from '@/components/map-types'
import { prefersReducedMotion } from '@/lib/utils'
import { SHEET_FULL, SHEET_PEEK, SHEET_SNAPS } from '@/lib/sheet'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MutableRefObject, type ReactNode, type RefObject } from 'react'
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

function SheetBody({
  trip: t,
  scrollRef,
  activeId,
  selectStop,
  observeLockRef,
  hoverIndex,
  setHoverIndex,
  handle,
  snap,
}: {
  trip: Trip
  scrollRef: RefObject<HTMLDivElement>
  activeId: string
  selectStop: (id: string, source: 'click' | 'scroll' | 'keyboard' | 'marker') => void
  observeLockRef: MutableRefObject<boolean>
  hoverIndex: number | null
  setHoverIndex: (i: number | null) => void
  handle?: ReactNode
  snap: number
}) {
  return (
    <div
      className="sheet-snap-body"
      style={{ ['--sheet-snap' as string]: String(snap) }}
    >
      {handle}
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
    </div>
  )
}

function TripScreen({ trip: t }: { trip: Trip }) {
  const [activeId, setActiveId] = useState(t.stops[0].id)
  const [mode, setMode] = useState<MapViewMode>('whole')
  const [snap, setSnap] = useState<number>(SHEET_PEEK)
  const [terrain3d, setTerrain3d] = useState(false)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const observeLockRef = useRef(false)
  const lockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Vaul reads `document` at render, so it cannot run during prerender.
  // SSR and the first client paint use a static sheet (same markup, one h1);
  // after mount on the phone we wrap it in the drawer for drag/snaps.
  const [phoneDrawer, setPhoneDrawer] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => setPhoneDrawer(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])


  // 3D is off at every width until the user opts in with the toggle.
  const onTerrain3d = useCallback((on: boolean) => {
    setTerrain3d(on)
  }, [])

  const selectStop = useCallback(
    (id: string, source: 'click' | 'scroll' | 'keyboard' | 'marker') => {
      setActiveId(id)
      setMode('stop')
      if (source === 'click' || source === 'keyboard' || source === 'marker') {
        observeLockRef.current = true
        if (lockTimer.current) clearTimeout(lockTimer.current)
        const root = scrollRef.current
        const el = root?.querySelector<HTMLElement>(`[data-step-id="${id}"]`)
        // Keyboard (and reduced-motion) jump instantly so a 900ms tour is
        // not fighting a smooth-scroll that outlives the lock. Click can
        // stay smooth; the lock lasts until scrollend (min 1200ms).
        const instant = source === 'keyboard' || prefersReducedMotion()
        el?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'center' })
        const lockedAt = Date.now()
        const unlock = () => {
          observeLockRef.current = false
          root?.removeEventListener('scrollend', onScrollEnd)
        }
        const onScrollEnd = () => {
          // Never release before 1200ms — a 900ms Enter tour must hold
          // the latest step even when instant scroll fires scrollend immediately.
          const leftover = Math.max(120, 1200 - (Date.now() - lockedAt))
          if (lockTimer.current) clearTimeout(lockTimer.current)
          lockTimer.current = setTimeout(unlock, leftover)
        }
        root?.addEventListener('scrollend', onScrollEnd, { once: true })
        lockTimer.current = setTimeout(unlock, 2000)
      }
    },
    [],
  )

  const onModeChange = useCallback((next: 'whole' | 'climb') => {
    setMode(next)
  }, [])

  const onOpenClimb = useCallback(() => {
    setMode('climb')
    setSnap(SHEET_FULL)
    requestAnimationFrame(() => {
      const el = document.getElementById('climb-profile')
      el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    })
  }, [])

  function toggleSnap() {
    setSnap((s) => (s >= (SHEET_PEEK + SHEET_FULL) / 2 ? SHEET_PEEK : SHEET_FULL))
  }

  function onHandleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleSnap()
    }
  }

  const setActiveSnapPoint = useCallback((v: number | string | null) => {
    const n = typeof v === 'number' ? v : Number(v)
    if (n === SHEET_PEEK || n === SHEET_FULL) setSnap(n)
    else if (Number.isFinite(n)) setSnap(n >= (SHEET_PEEK + SHEET_FULL) / 2 ? SHEET_FULL : SHEET_PEEK)
  }, [])

  const hover = hoverIndex != null ? profilePointLngLat(t, hoverIndex) : null
  const hoverLngLat: [number, number] | null = hover ? [hover.lng, hover.lat] : null

  const handle = (
    <DrawerHandle
      data-testid="sheet-handle"
      aria-label={snap >= (SHEET_PEEK + SHEET_FULL) / 2 ? 'Collapse itinerary sheet' : 'Expand itinerary sheet'}
      role="button"
      tabIndex={0}
      onKeyDown={onHandleKey}
      className="sheet-handle lg:hidden"
    >
      <span className="sheet-handle-bar" data-testid="sheet-handle-bar" aria-hidden="true" />
    </DrawerHandle>
  )

  const bodyProps = {
    trip: t,
    scrollRef,
    activeId,
    selectStop,
    observeLockRef,
    hoverIndex,
    setHoverIndex,
    snap,
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className="min-h-dvh bg-bg text-ink lg:flex lg:h-dvh lg:overflow-hidden"
        style={{ ['--sheet-snap' as string]: snap }}
        data-sheet-snap={snap}
      >
        <MapPane
          trip={t}
          activeId={activeId}
          mode={mode}
          snap={snap}
          terrain3d={terrain3d}
          onTerrain3d={onTerrain3d}
          hoverLngLat={hoverLngLat}
          onModeChange={onModeChange}
          onMarkerSelect={(id) => selectStop(id, 'marker')}
          onOpenClimb={onOpenClimb}
        />

        {phoneDrawer ? (
          <Drawer
            open
            defaultOpen
            dismissible={false}
            modal={false}
            handleOnly
            snapPoints={[...SHEET_SNAPS]}
            activeSnapPoint={snap}
            setActiveSnapPoint={setActiveSnapPoint}
            shouldScaleBackground={false}
            noBodyStyles
            disablePreventScroll
            snapToSequentialPoint
            repositionInputs={false}
          >
            <DrawerContent
              data-sheet
              data-testid="itinerary-sheet"
              aria-label="Trip itinerary"
              style={{ ['--sheet-snap' as string]: String(snap) }}
              className="sheet-mobile relative z-20 flex flex-col rounded-t-3xl bg-bg shadow-sheet outline-none max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 lg:static lg:z-auto lg:order-1 lg:mt-0 lg:h-screen lg:max-h-none lg:w-[420px] lg:shrink-0 lg:translate-y-0 lg:rounded-none lg:border-r lg:border-line lg:shadow-none lg:[transform:none!important] lg:[height:100vh!important]"
            >
              <SheetBody {...bodyProps} handle={handle} />
            </DrawerContent>
          </Drawer>
        ) : (
          <aside
            data-sheet
            data-testid="itinerary-sheet"
            className="sheet-mobile relative z-20 flex max-h-[88dvh] flex-col rounded-t-3xl bg-bg shadow-sheet max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 lg:order-1 lg:mt-0 lg:h-screen lg:max-h-none lg:w-[420px] lg:shrink-0 lg:rounded-none lg:border-r lg:border-line lg:shadow-none"
          >
            <SheetBody
              {...bodyProps}
              handle={
                <button
                  type="button"
                  data-testid="sheet-handle"
                  aria-label={snap >= (SHEET_PEEK + SHEET_FULL) / 2 ? 'Collapse itinerary sheet' : 'Expand itinerary sheet'}
                  onClick={toggleSnap}
                  className="sheet-handle lg:hidden"
                >
                  <span className="sheet-handle-bar" data-testid="sheet-handle-bar" aria-hidden="true" />
                </button>
              }
            />
          </aside>
        )}
      </div>
    </TooltipProvider>
  )
}
