import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin } from 'lucide-react'
import type { Trip } from '@/types/trip'

export function SummaryCard({ trip }: { trip: Trip }) {
  return (
    <Card className="mt-4" aria-label="Trip summary">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Date</span>
          <span className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{trip.dateShort}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Price</span>
          <span className="mt-0.5 text-sm font-semibold tabular-nums text-clay">{trip.price.display}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Difficulty</span>
          <span className="mt-0.5 flex flex-col items-start gap-0.5">
            <Badge variant="moss">{trip.difficulty.label}</Badge>
            <span className="text-[11px] text-ink-muted">{trip.difficulty.note}</span>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Hike</span>
          <span className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{trip.duration.hikeLabel}</span>
          <span className="text-[11px] tabular-nums text-ink-muted">{trip.duration.dayLabel}</span>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-sm text-ink">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-clay" aria-hidden="true" />
        <p>
          <span className="font-semibold">Meet {trip.meetingPoint.time}</span>
          <span className="text-ink-muted"> · {trip.meetingPoint.name}, {trip.meetingPoint.city}</span>
        </p>
      </div>
    </Card>
  )
}
