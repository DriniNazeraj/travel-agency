import { cn } from '@/lib/utils'

export function MapAttribution({ className }: { className?: string }) {
  return (
    <p
      data-testid="map-attribution"
      className={cn(
        'pointer-events-auto max-w-[min(100%,18rem)] rounded-md bg-surface/95 px-2 py-1 text-[9px] font-medium leading-snug text-ink-muted shadow-soft ring-1 ring-line backdrop-blur-sm lg:max-w-none lg:text-[11px]',
        className,
      )}
    >
      ©{' '}
      <a
        className="underline decoration-ink-muted/40 underline-offset-2 hover:text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
      >
        OpenStreetMap
      </a>{' '}
      contributors · Terrain: Mapzen / AWS Terrain Tiles
    </p>
  )
}
