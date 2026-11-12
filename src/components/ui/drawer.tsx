import * as React from 'react'
import { Drawer as VaulDrawer } from 'vaul'
import { cn } from '@/lib/utils'

const Drawer = ({
  shouldScaleBackground = false,
  ...props
}: React.ComponentProps<typeof VaulDrawer.Root>) => (
  <VaulDrawer.Root shouldScaleBackground={shouldScaleBackground} {...props} />
)
Drawer.displayName = 'Drawer'

const DrawerTrigger = VaulDrawer.Trigger
const DrawerPortal = VaulDrawer.Portal
const DrawerClose = VaulDrawer.Close
const DrawerHandle = VaulDrawer.Handle

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Overlay ref={ref} className={cn('fixed inset-0 z-20 bg-ink/10 lg:hidden', className)} {...props} />
))
DrawerOverlay.displayName = VaulDrawer.Overlay.displayName

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Content>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Content>
>(({ className, children, ...props }, ref) => (
  <VaulDrawer.Content
    ref={ref}
    className={cn(
      'fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl bg-bg shadow-sheet outline-none lg:static lg:z-auto lg:h-full lg:rounded-none lg:shadow-none',
      className,
    )}
    {...props}
  >
    {children}
  </VaulDrawer.Content>
))
DrawerContent.displayName = 'DrawerContent'

export { Drawer, DrawerTrigger, DrawerPortal, DrawerClose, DrawerHandle, DrawerOverlay, DrawerContent }
