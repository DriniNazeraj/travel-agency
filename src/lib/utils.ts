import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const GEAR_STORAGE_KEY = (slug: string) => `trip:${slug}:gear`

export function stopAriaLabel(stop: { order: number; title: string; time: string | null; elevationM?: number }): string {
  const timePart = stop.time ? stop.time : 'time to be confirmed'
  if (stop.elevationM) {
    const metres = stop.elevationM.toLocaleString('en-GB')
    // e.g. "Stop 4, Maja e Vajushës, 2,057 metres, time to be confirmed"
    const title = stop.title.replace(/\s*·\s*2,057 m/, '')
    return `Stop ${stop.order}, ${title}, ${metres} metres, ${timePart}`
  }
  return `Stop ${stop.order}, ${stop.title}, ${timePart}`
}
