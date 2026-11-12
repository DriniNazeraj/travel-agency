import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide',
  {
    variants: {
      variant: {
        moss: 'border border-moss text-moss bg-surface',
        clay: 'text-clay',
        ph: 'border border-dashed border-clay-deep/50 bg-sand/40 text-clay-deep',
      },
    },
    defaultVariants: { variant: 'moss' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
