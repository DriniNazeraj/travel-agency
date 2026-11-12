import { Checkbox } from '@/components/ui/checkbox'
import { GEAR_STORAGE_KEY } from '@/lib/utils'
import type { GearItem } from '@/types/trip'
import { useEffect, useState } from 'react'

export function GearList({ slug, items }: { slug: string; items: GearItem[] }) {
  const key = GEAR_STORAGE_KEY(slug)
  const [packed, setPacked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) setPacked(JSON.parse(raw) as Record<string, boolean>)
    } catch {
      /* ignore */
    }
  }, [key])

  function toggle(id: string, value: boolean) {
    setPacked((prev) => {
      const next = { ...prev, [id]: value }
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <section className="mt-6" aria-labelledby="gear">
      <h2 id="gear" className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        What to bring
      </h2>
      <p className="gear-intro mt-1 text-sm text-ink-muted">Tick what you’ve packed — saved on this device.</p>
      <div className="gear-grid mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {items.map((item) => {
          const id = `gear-${item.id}`
          const checked = !!packed[item.id]
          return (
            <label
              key={item.id}
              htmlFor={id}
              className="gear-item flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2 focus-within:ring-2 focus-within:ring-pine focus-within:ring-offset-2 focus-within:ring-offset-bg"
            >
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(v) => toggle(item.id, v === true)}
                aria-label={item.label}
              />
              <span className="text-sm font-medium text-ink">{item.label}</span>
            </label>
          )
        })}
      </div>
    </section>
  )
}
