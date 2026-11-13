import type { Trip } from '@/types/trip'
import { pinNumber, groupPlaces } from '@/lib/places'
import { driveLeg, hikeLeg } from '@/lib/route'

/** Geographic schematic of northern Albania, used as the first-paint / offline skeleton. */
const MIN_LAT = 41.16
const MAX_LAT = 42.7
const MIN_LNG = 19.18
const MAX_LNG = 20.05
const MEAN_LAT = (MIN_LAT + MAX_LAT) / 2
const COS = Math.cos((MEAN_LAT * Math.PI) / 180)
const EXAG = 2.35

function projector(W: number, H: number, pad: number) {
  const spanX = (MAX_LNG - MIN_LNG) * COS * EXAG
  const spanY = MAX_LAT - MIN_LAT
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY)
  const ox = (W - spanX * scale) / 2
  const oy = (H - spanY * scale) / 2
  return (lat: number, lng: number) => {
    const x = ox + (lng - MIN_LNG) * COS * EXAG * scale
    const y = oy + (MAX_LAT - lat) * scale
    return [x, y] as const
  }
}

function f(n: number) {
  return n.toFixed(1)
}

function pathFrom(xy: (lat: number, lng: number) => readonly [number, number], coords: [number, number][]) {
  if (!coords.length) return ''
  // coords are [lng, lat]; downsample for a light SVG
  const step = Math.max(1, Math.floor(coords.length / 180))
  const pts: (readonly [number, number])[] = []
  for (let i = 0; i < coords.length; i += step) pts.push(xy(coords[i][1], coords[i][0]))
  const last = coords[coords.length - 1]
  const lastPt = xy(last[1], last[0])
  if (pts[pts.length - 1] !== lastPt) pts.push(lastPt)
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${f(p[0])},${f(p[1])}`).join(' ')
}

export function MapSkeleton({
  trip,
  activeId,
  variant = 'phone',
}: {
  trip: Trip
  activeId: string
  variant?: 'phone' | 'desktop'
}) {
  const W = variant === 'desktop' ? 1020 : 390
  const H = variant === 'desktop' ? 900 : 380
  const xy = projector(W, H, variant === 'desktop' ? 36 : 26)
  const drive = driveLeg(trip.route)
  const hike = hikeLeg(trip.route)
  const drivePath = drive ? pathFrom(xy, drive.geometry.coordinates) : ''
  const hikePath = hike ? pathFrom(xy, hike.geometry.coordinates) : ''
  const groups = groupPlaces(trip.stops)
  const shkoder = xy(42.0681371, 19.5121437)
  const lake = xy(42.12, 19.35)
  const lepushe = xy(42.5281258, 19.7302647)
  const summit = xy(42.5160521, 19.7602032)
  const tirana = xy(41.3296753, 19.8145239)
  const driveW = variant === 'desktop' ? 4.5 : 3.5
  const hikeW = variant === 'desktop' ? 5 : 4

  return (
    <svg
      className="map-svg h-full w-full"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`ground-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E4EDE4" />
          <stop offset="55%" stopColor="#EDE6D9" />
          <stop offset="100%" stopColor="#E6DCC8" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#ground-${variant})`} />
      <ellipse cx={W * 0.62} cy={H * 0.18} rx={W * 0.38} ry={H * 0.16} fill="#D5DFD2" opacity="0.85" />
      <ellipse cx={W * 0.7} cy={H * 0.12} rx={W * 0.22} ry={H * 0.1} fill="#C9D6C6" opacity="0.8" />
      <ellipse
        cx={lake[0]}
        cy={lake[1]}
        rx={variant === 'desktop' ? 70 : 36}
        ry={variant === 'desktop' ? 48 : 26}
        fill="#B9C9C0"
        opacity="0.9"
      />
      <text
        x={lake[0]}
        y={lake[1] + 4}
        textAnchor="middle"
        fill="#3F534C"
        fontSize={variant === 'desktop' ? 12 : 10}
        fontStyle="italic"
        fontFamily="'Source Sans 3', system-ui, sans-serif"
        opacity="0.85"
      >
        Lake Shkodër
      </text>
      {variant === 'desktop' && (
        <text
          x={W * 0.5}
          y={H * 0.1}
          fill="#5E574C"
          fontSize="12"
          fontWeight="600"
          letterSpacing="0.16em"
          fontFamily="'Source Sans 3', system-ui, sans-serif"
          opacity="0.7"
        >
          BJESHKËT E NEMUNA
        </text>
      )}
      {/* cream casing then drive (solid pine) and hike (dashed clay) */}
      {drivePath && (
        <path d={drivePath} fill="none" stroke="#F8F4EC" strokeWidth={driveW + 2.5} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {hikePath && (
        <path d={hikePath} fill="none" stroke="#F8F4EC" strokeWidth={hikeW + 2.5} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {drivePath && (
        <path d={drivePath} fill="none" stroke="#2F5A48" strokeWidth={driveW} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {hikePath && (
        <path
          d={hikePath}
          fill="none"
          stroke="#A8441E"
          strokeWidth={hikeW}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${(hikeW * 1.6).toFixed(1)} ${(hikeW * 1.2).toFixed(1)}`}
        />
      )}
      <text
        x={tirana[0] + 16}
        y={tirana[1] + 4}
        fill="#1B1914"
        fontSize={variant === 'desktop' ? 13 : 11}
        fontWeight="600"
        fontFamily="'Source Sans 3', system-ui, sans-serif"
      >
        Tirana
      </text>
      <text
        x={shkoder[0] + 16}
        y={shkoder[1] + 4}
        fill="#1B1914"
        fontSize={variant === 'desktop' ? 13 : 11}
        fontWeight="600"
        fontFamily="'Source Sans 3', system-ui, sans-serif"
      >
        Shkodër
      </text>
      <text
        x={lepushe[0] - 16}
        y={lepushe[1] - 14}
        textAnchor="end"
        fill="#1B1914"
        fontSize={variant === 'desktop' ? 13 : 11}
        fontWeight="600"
        fontFamily="'Source Sans 3', system-ui, sans-serif"
      >
        Lëpushë
      </text>
      {variant === 'desktop' && (
        <text
          x={summit[0] + 16}
          y={summit[1] + 5}
          fill="#1B1914"
          fontSize="12"
          fontWeight="600"
          fontFamily="'Source Sans 3', system-ui, sans-serif"
        >
          Maja e Vajushës
        </text>
      )}
      {groups.map((g) => {
        const [x, y] = xy(g.lat, g.lng)
        const num = pinNumber(g, activeId)
        const active = g.stops.some((s) => s.id === activeId)
        const r = variant === 'desktop' ? 15 : 13
        const isSummit = g.placeId === 'maja-e-vajushes'
        return (
          <g key={g.placeId} className={active ? 'pin ring-active' : 'pin'} transform={`translate(${f(x)} ${f(y)})`} data-n={num}>
            <circle r={r + 4} fill="none" stroke="#A8441E" strokeWidth="2.5" opacity={active ? 1 : 0} />
            <circle r={r} fill="#F8F4EC" />
            <circle r={r - 2} fill={active ? '#A8441E' : '#1F3D32'} />
            {isSummit ? (
              <>
                <path d={`M0,${-r + 8} L${r - 7},${r - 9} L${-r + 7},${r - 9} Z`} fill="#F8F4EC" opacity="0.95" />
                <text
                  textAnchor="middle"
                  dy="0.55em"
                  fill="#F8F4EC"
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif"
                >
                  {num}
                </text>
              </>
            ) : (
              <text
                textAnchor="middle"
                dy="0.38em"
                fill="#F8F4EC"
                fontSize="11.5"
                fontWeight="600"
                fontFamily="'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif"
              >
                {num}
              </text>
            )}
          </g>
        )
      })}
      <g transform={`translate(${W - 28} 28)`} opacity="0.8">
        <polygon points="0,-10 4,6 -4,6" fill="#1B1914" />
        <text y="-16" textAnchor="middle" fill="#1B1914" fontSize="8" fontWeight="700" fontFamily="'Source Sans 3', system-ui, sans-serif">
          N
        </text>
      </g>
    </svg>
  )
}
