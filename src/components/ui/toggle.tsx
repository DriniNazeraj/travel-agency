import * as React from 'react'
import * as TogglePrimitive from '@radix-ui/react-toggle'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const toggleVariants = cva(
  'inline-flex items-center justify-center rounded-full text-sm font-semibold min-h-11 px-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-pine data-[state=on]:text-surface data-[state=off]:bg-transparent data-[state=off]:text-ink hover:bg-surface-2 data-[state=on]:hover:bg-pine-mid',
)

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>
>(({ className, ...props }, ref) => (
  <TogglePrimitive.Root ref={ref} className={cn(toggleVariants(), className)} {...props} />
))
Toggle.displayName = TogglePrimitive.Root.displayName

export { Toggle, toggleVariants }
