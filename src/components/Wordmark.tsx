import { Ph } from '@/components/Placeholder'
import { cn } from '@/lib/utils'

export function Wordmark({ className, pill = false }: { className?: string; pill?: boolean }) {
  return (
    <div
      className={cn(
        'font-sans text-sm font-semibold tracking-wide text-ink',
        pill && 'flex h-8 items-center gap-1.5 rounded-full bg-surface/90 px-3 backdrop-blur-sm',
        className,
      )}
    >
      <Ph>[PH]</Ph>
      <span className="text-ink-muted">company</span>
    </div>
  )
}
