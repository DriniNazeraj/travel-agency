import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Ph({ children = '[PH]', className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-dashed border-clay/55 bg-sand/40 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-clay',
        className,
      )}
    >
      {children}
    </span>
  )
}
