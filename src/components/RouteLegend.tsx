import { Car, Footprints } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Ph } from '@/components/Placeholder'

export function RouteLegend({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={
        className ??
        'absolute z-20 flex items-center gap-3 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-medium text-ink shadow-soft ring-1 ring-line backdrop-blur-sm'
      }
      data-testid="route-legend"
      style={style}
    >
      <span className="inline-flex items-center gap-1.5">
        <Car className="h-3.5 w-3.5 text-pine-mid" aria-hidden="true" />
        <span className="inline-block h-0.5 w-4 rounded-full bg-pine-mid" aria-hidden="true" />
        Drive · <Ph>[PH]</Ph>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Footprints className="h-3.5 w-3.5 text-clay" aria-hidden="true" />
        <svg width="16" height="4" aria-hidden="true">
          <line x1="0" y1="2" x2="16" y2="2" stroke="#A8441E" strokeWidth="2.5" strokeDasharray="3.2 2.4" strokeLinecap="round" />
        </svg>
        Hike · 5–6 h
      </span>
    </div>
  )
}
