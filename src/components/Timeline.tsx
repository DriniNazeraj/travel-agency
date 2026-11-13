import { Ph } from '@/components/Placeholder'
import { stopAriaLabel, cn } from '@/lib/utils'
import type { Stop } from '@/types/trip'
import { useEffect, useRef, type KeyboardEvent, type MutableRefObject, type RefObject } from 'react'

interface TimelineProps {
  stops: Stop[]
  activeId: string
  onSelect: (id: string, source: 'click' | 'scroll' | 'keyboard') => void
  scrollRootRef: RefObject<HTMLElement | null>
  observeLockRef: MutableRefObject<boolean>
}

export function Timeline({ stops, activeId, onSelect, scrollRootRef, observeLockRef }: TimelineProps) {
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  useEffect(() => {
    const root = scrollRootRef.current
    if (!root) return

    // Arm only on a real user gesture, and stay armed until this effect
    // re-runs (an explicit select changes activeId). A short 400ms window
    // expired while observeLock was still held, so a later wheel/touch
    // never re-armed and the active stop stayed on the keyboard target.
    // Programmatic scrollIntoView and IntersectionObserver callbacks after
    // a keyboard select must not steal the step the user just asked for.
    let userArmed = false
    const armUser = () => {
      userArmed = true
    }
    const update = () => {
      if (observeLockRef.current) return
      if (!userArmed) return
      const buttons = stops
        .map((s) => itemRefs.current.get(s.id))
        .filter((el): el is HTMLButtonElement => !!el)
      if (!buttons.length) return
      // At the bottom of the rail the last step can't reach the 28% sentinel,
      // so pin step 7 when the scroll root is fully (or almost) scrolled.
      const atBottom = root.scrollHeight - root.scrollTop - root.clientHeight <= 16
      if (atBottom) {
        const last = stops[stops.length - 1]
        if (last && last.id !== activeId) onSelect(last.id, 'scroll')
        return
      }
      const rootRect = root.getBoundingClientRect()
      const sentinel = rootRect.top + root.clientHeight * 0.28
      let best: { id: string; dist: number } | null = null
      for (const el of buttons) {
        const r = el.getBoundingClientRect()
        const mid = r.top + r.height / 2
        const dist = Math.abs(mid - sentinel)
        const id = el.dataset.stepId
        if (!id) continue
        if (!best || dist < best.dist) best = { id, dist }
      }
      if (best && best.id !== activeId) onSelect(best.id, 'scroll')
    }

    const io = new IntersectionObserver(update, {
      root,
      rootMargin: '-20% 0px -60% 0px',
      threshold: [0, 0.25, 0.5, 0.75, 1],
    })
    for (const s of stops) {
      const el = itemRefs.current.get(s.id)
      if (el) io.observe(el)
    }
    const onKeyArm = (e: Event) => {
      const key = 'key' in e ? String((e as unknown as { key: string }).key) : ''
      if (
        key === 'PageDown' ||
        key === 'PageUp' ||
        key === 'ArrowDown' ||
        key === 'ArrowUp' ||
        key === 'Home' ||
        key === 'End' ||
        key === ' '
      ) {
        armUser()
      }
    }
    root.addEventListener('scroll', update, { passive: true })
    root.addEventListener('wheel', armUser, { passive: true })
    root.addEventListener('touchmove', armUser, { passive: true })
    root.addEventListener('pointerdown', armUser)
    root.addEventListener('keydown', onKeyArm)
    return () => {
      io.disconnect()
      root.removeEventListener('scroll', update)
      root.removeEventListener('wheel', armUser)
      root.removeEventListener('touchmove', armUser)
      root.removeEventListener('pointerdown', armUser)
      root.removeEventListener('keydown', onKeyArm)
    }
  }, [stops, activeId, onSelect, scrollRootRef, observeLockRef])

  function onKey(e: KeyboardEvent, index: number) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowDown' ? Math.min(stops.length - 1, index + 1) : Math.max(0, index - 1)
      const id = stops[next].id
      itemRefs.current.get(id)?.focus()
      onSelect(id, 'keyboard')
      return
    }
    // Enter / Space go through the same onSelect path as click (which drives
    // the same MapView camera function). preventDefault so the native click
    // does not fire a second select.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(stops[index].id, 'keyboard')
    }
  }

  return (
    <section className="mt-6" aria-labelledby="the-day">
      <h2 id="the-day" className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        The day
      </h2>
      <div className="timeline mt-2 flex flex-col" role="list" aria-labelledby="the-day">
        {stops.map((stop, i) => {
          const active = stop.id === activeId
          return (
            <button
              key={stop.id}
              type="button"
              role="listitem"
              data-step={stop.order}
              data-step-id={stop.id}
              data-active={active ? 'true' : 'false'}
              aria-current={active ? 'true' : undefined}
              aria-label={stopAriaLabel(stop)}
              onClick={() => onSelect(stop.id, 'click')}
              onKeyDown={(e) => onKey(e, i)}
              ref={(el) => {
                if (el) itemRefs.current.set(stop.id, el)
                else itemRefs.current.delete(stop.id)
              }}
              className={cn(
                'step relative flex min-h-11 w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                'hover:bg-surface-2',
                active && 'bg-clay/10',
              )}
            >
              <span className="flex w-12 shrink-0 items-start justify-start pt-0.5 font-sans text-sm font-semibold tabular-nums text-ink">
                {stop.time ? (
                  <span className="time-val">{stop.timeDisplay}</span>
                ) : (
                  <Ph>{stop.timeDisplay}</Ph>
                )}
              </span>
              <span className="relative flex w-7 shrink-0 flex-col items-center self-stretch" aria-hidden="true">
                {i < stops.length - 1 && (
                  <span className="absolute left-1/2 top-7 bottom-[-12px] w-px -translate-x-1/2 bg-line" />
                )}
                <span
                  className={cn(
                    'disc relative z-10 flex h-7 w-7 items-center justify-center rounded-full font-sans text-xs font-semibold tabular-nums text-surface',
                    active ? 'bg-clay ring-2 ring-clay/40' : 'bg-pine',
                  )}
                >
                  {stop.order}
                </span>
              </span>
              <span className="step-body min-w-0 flex-1">
                <span className="step-title block text-sm font-semibold text-ink">
                  {stop.title.includes('[PH]') ? (
                    <>
                      {stop.title.split('[PH]')[0]}
                      <Ph>[PH]</Ph>
                      {stop.title.split('[PH]')[1]}
                    </>
                  ) : (
                    stop.title
                  )}
                </span>
                <span className="step-desc mt-0.5 block text-sm leading-relaxed text-ink-muted">
                  {stop.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {/* Lets the last step reach the scroll-follow sentinel on a short rail. */}
      <div className="pointer-events-none hidden h-32 shrink-0 lg:block" aria-hidden="true" />
    </section>
  )
}
