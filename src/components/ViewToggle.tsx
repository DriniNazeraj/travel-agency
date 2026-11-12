import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { MapViewMode } from '@/components/map-types'

export function ViewToggle({
  mode,
  onChange,
}: {
  mode: MapViewMode
  onChange: (mode: 'whole' | 'climb') => void
}) {
  return (
    <div
      className="absolute right-3 top-3 z-20 flex rounded-full bg-surface/95 p-0.5 shadow-soft ring-1 ring-line backdrop-blur-sm lg:right-4 lg:top-4"
      role="group"
      aria-label="Map view"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            pressed={mode === 'whole'}
            onPressedChange={() => onChange('whole')}
            data-testid="view-whole" aria-label="Whole day, show the full route"
            className={cn('h-9 min-h-11 px-3 text-xs lg:text-sm', mode === 'whole' && 'pointer-events-none')}
          >
            Whole day
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom">Fit the full Tirana–summit day</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            pressed={mode === 'climb'}
            onPressedChange={() => onChange('climb')}
            data-testid="view-climb" aria-label="The climb, Lëpushë to Maja e Vajushës"
            className={cn('h-9 min-h-11 px-3 text-xs lg:text-sm', mode === 'climb' && 'pointer-events-none')}
          >
            The climb
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom">Zoom to the 5–6 h climb</TooltipContent>
      </Tooltip>
    </div>
  )
}
