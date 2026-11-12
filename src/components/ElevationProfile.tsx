import { formatKm, formatM } from '@/lib/route'
import type { ElevationProfile as ElevationProfileData } from '@/types/trip'
import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react'

export function ElevationProfile({
  profile,
  hoverIndex,
  onHover,
}: {
  profile: ElevationProfileData
  hoverIndex: number | null
  onHover: (index: number | null) => void
}) {
  const liveId = useId()
  const svgRef = useRef<HTMLDivElement>(null)
  const pts = profile.points
  const n = pts.length
  if (n < 2) return null

  const distances = pts.map((p) => p[0])
  const elevs = pts.map((p) => p[1])
  const maxD = distances[n - 1] || 1
  const minE = Math.min(...elevs)
  const maxE = Math.max(...elevs, profile.summit_official_m)
  const padL = 40
  const padR = 12
  const padT = 22
  const padB = 22
  const W = 600
  const H = 140

  const xOf = (d: number) => padL + ((W - padL - padR) * d) / maxD
  const yOf = (e: number) => {
    const lo = minE - 40
    const hi = maxE + 40
    return padT + (H - padT - padB) * (1 - (e - lo) / (hi - lo))
  }

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p[0]).toFixed(1)},${yOf(p[1]).toFixed(1)}`).join(' ')
  const area = `${line} L${xOf(maxD).toFixed(1)},${(H - padB).toFixed(1)} L${xOf(0).toFixed(1)},${(H - padB).toFixed(1)} Z`

  const hover = hoverIndex != null ? pts[hoverIndex] : null
  const live =
    hover != null
      ? `km ${(hover[0] / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} · ${formatM(hover[1])}`
      : `Gain ${formatM(profile.gain_m)} · distance ${formatKm(profile.distance_m)}`

  function indexFromClientX(clientX: number) {
    const el = svgRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const x = clientX - r.left
    const inner = r.width * ((W - padL - padR) / W)
    const left = r.width * (padL / W)
    const t = Math.max(0, Math.min(1, (x - left) / inner))
    return Math.round(t * (n - 1))
  }

  function onPointer(e: PointerEvent) {
    onHover(indexFromClientX(e.clientX))
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const cur = hoverIndex ?? (e.key === 'ArrowRight' ? -1 : n)
      const next = e.key === 'ArrowRight' ? Math.min(n - 1, cur + 1) : Math.max(0, cur - 1)
      onHover(next)
    }
    if (e.key === 'Escape' || e.key === 'Home') {
      e.preventDefault()
      onHover(e.key === 'Home' ? 0 : null)
    }
    if (e.key === 'End') {
      e.preventDefault()
      onHover(n - 1)
    }
  }

  const yTicks = [Math.round(minE / 50) * 50, Math.round(((minE + maxE) / 2) / 50) * 50, Math.round(maxE / 50) * 50]
  const uniqY = [...new Set(yTicks)]
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxD)

  const last = pts[n - 1]

  return (
    <section id="climb-profile" className="mt-6" aria-labelledby="the-climb">
      <h2 id="the-climb" className="font-display text-[18px] font-semibold tracking-tight text-ink">
        The climb
      </h2>
      <div
        ref={svgRef}
        className="mt-2 h-[112px] w-full lg:h-[140px]"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => onHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-full w-full rounded-2xl bg-surface ring-1 ring-line"
          role="img"
          tabIndex={0}
          aria-label="Elevation profile of the climb from Lëpushë to Maja e Vajushës. Use arrow keys to move along the path."
          aria-describedby={liveId}
          onKeyDown={onKey}
        >
          <title>Elevation profile of the climb</title>
          <path d={area} fill="#A8441E" fillOpacity="0.12" />
          <path d={line} fill="none" stroke="#A8441E" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {uniqY.map((y) => (
            <text
              key={y}
              x={padL - 6}
              y={yOf(y) + 3}
              textAnchor="end"
              className="fill-ink-muted"
              fontSize="10"
              fontFamily="'Source Sans 3', system-ui, sans-serif"
            >
              {Math.round(y)}
            </text>
          ))}
          {xTicks.map((d) => (
            <text
              key={d}
              x={xOf(d)}
              y={H - 6}
              textAnchor="middle"
              className="fill-ink-muted"
              fontSize="10"
              fontFamily="'Source Sans 3', system-ui, sans-serif"
            >
              {(d / 1000).toFixed(d === 0 ? 0 : 1)}
              {d === 0 ? ' km' : ''}
            </text>
          ))}
          {/* summit marker */}
          <g transform={`translate(${xOf(last[0])} ${yOf(last[1])})`}>
            <circle r="3.5" fill="#A8441E" />
            <text
              y="-8"
              textAnchor="end"
              fill="#A8441E"
              fontSize="10"
              fontWeight="600"
              fontFamily="'Source Sans 3', system-ui, sans-serif"
            >
              Maja e Vajushës · 2,057 m
            </text>
          </g>
          {hover && (
            <g transform={`translate(${xOf(hover[0])} ${yOf(hover[1])})`}>
              <circle r="6" fill="#F8F4EC" stroke="#1F3D32" strokeWidth="2.5" />
            </g>
          )}
        </svg>
      </div>
      <p id={liveId} aria-live="polite" className="mt-1.5 text-xs text-ink-muted">
        {hover
          ? live
          : `Gain ${formatM(profile.gain_m)} · distance ${formatKm(profile.distance_m)}`}
      </p>
    </section>
  )
}
