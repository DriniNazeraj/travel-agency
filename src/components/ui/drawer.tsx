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
// Vaul hard-codes aria-hidden="true" on the Handle, which fights our
// role="button" + aria-label. Strip it (and keep it off if vaul puts it back).
const DrawerHandle = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Handle>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Handle>
>((props, ref) => {
  const localRef = React.useRef<HTMLElement | null>(null)
  const setRef = React.useCallback(
    (node: HTMLElement | null) => {
      localRef.current = node
      if (typeof ref === 'function') ref(node as never)
      else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node
    },
    [ref],
  )
  React.useLayoutEffect(() => {
    const el = localRef.current
    if (!el) return
    const clear = () => {
      if (el.hasAttribute('aria-hidden')) {
        el.removeAttribute('aria-hidden')
        el.removeAttribute('data-aria-hidden')
      }
    }
    clear()
    const mo = new MutationObserver(clear)
    mo.observe(el, { attributes: true, attributeFilter: ['aria-hidden', 'data-aria-hidden'] })
    return () => mo.disconnect()
  }, [])
  return <VaulDrawer.Handle ref={setRef} {...props} />
})
DrawerHandle.displayName = 'DrawerHandle'

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
