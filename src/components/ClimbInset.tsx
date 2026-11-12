interface ClimbInsetProps {
  visible: boolean
  onSelect: () => void
}

export function ClimbInset({ visible, onSelect }: ClimbInsetProps) {
  if (!visible) return null
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label="The climb, 5–6 hours, Lëpushë to Maja e Vajushës, 2,057 metres"
      className="absolute bottom-10 left-3 z-20 w-[168px] rounded-2xl bg-surface/95 p-2.5 text-left shadow-soft ring-1 ring-line backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:bottom-14 lg:left-4 lg:w-[220px] lg:p-3"
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-muted lg:text-[11px]">
        The climb · 5–6 h
      </p>
      <svg viewBox="0 0 200 90" className="mt-1 h-16 w-full lg:h-20" aria-hidden="true">
        <rect width="200" height="90" rx="8" fill="#E8E0D2" />
        <path d="M36 68 Q 90 58 154 34" fill="none" stroke="#A8441E" strokeWidth="3.5" strokeLinecap="round" />
        {/* pin 3 Lëpushë */}
        <g transform="translate(36 68)">
          <circle r="11" fill="#F8F4EC" />
          <circle r="9" fill="#1F3D32" />
          <text textAnchor="middle" dy="0.38em" fill="#F8F4EC" fontSize="10" fontWeight="600" fontFamily="'Source Sans 3', system-ui, sans-serif">
            3
          </text>
        </g>
        {/* pin 4 summit */}
        <g transform="translate(154 34)">
          <circle r="11" fill="#F8F4EC" />
          <circle r="9" fill="#1F3D32" />
          <text textAnchor="middle" dy="0.38em" fill="#F8F4EC" fontSize="10" fontWeight="600" fontFamily="'Source Sans 3', system-ui, sans-serif">
            4
          </text>
        </g>
        <text x="36" y="86" textAnchor="middle" fill="#1B1914" fontSize="9" fontWeight="600" fontFamily="'Source Sans 3', system-ui, sans-serif">
          Lëpushë
        </text>
        <text x="154" y="16" textAnchor="middle" fill="#1B1914" fontSize="8" fontWeight="600" fontFamily="'Source Sans 3', system-ui, sans-serif">
          Maja e Vajushës
        </text>
        <text x="154" y="54" textAnchor="middle" fill="#A8441E" fontSize="9" fontWeight="700" fontFamily="'Source Sans 3', system-ui, sans-serif">
          2,057 m
        </text>
      </svg>
    </button>
  )
}
