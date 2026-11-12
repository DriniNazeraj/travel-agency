import { Button } from '@/components/ui/button'
import { Ph } from '@/components/Placeholder'
import type { Trip } from '@/types/trip'

export function BookCta({ trip }: { trip: Trip }) {
  const prefill = encodeURIComponent(trip.booking.whatsappPrefill)
  const wa = `${trip.booking.whatsappHref}?text=${prefill}`

  return (
    <footer className="cta z-20 border-t border-line bg-surface/95 backdrop-blur-sm ring-1 ring-line max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 lg:sticky lg:bottom-0 lg:mt-auto">
      <div className="flex flex-col gap-1.5 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
        <div className="cta-row flex min-h-[56px] items-center gap-2">
          <Button asChild className="flex-1">
            <a href={trip.booking.telHref}>{trip.booking.ctaLabel}</a>
          </Button>
          <Button asChild variant="outline">
            <a href={wa} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          </Button>
        </div>
        <p className="cta-cap pb-1 text-center text-[11px] text-ink-muted">
          Book by phone · number <Ph>{trip.booking.phoneDisplay}</Ph> · WhatsApp <Ph>{trip.booking.whatsapp}</Ph>
        </p>
      </div>
    </footer>
  )
}
