import { cn } from '@/lib/utils'
import * as React from 'react'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line', className)}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export { Card }
