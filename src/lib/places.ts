import type { Stop } from '@/types/trip'

export interface PlaceGroup {
  placeId: string
  lat: number
  lng: number
  stops: Stop[]
}

export function groupPlaces(stops: Stop[]): PlaceGroup[] {
  const map = new Map<string, PlaceGroup>()
  for (const s of stops) {
    const existing = map.get(s.placeId)
    if (existing) existing.stops.push(s)
    else map.set(s.placeId, { placeId: s.placeId, lat: s.lat, lng: s.lng, stops: [s] })
  }
  return [...map.values()]
}

/** Number shown on a shared pin: the active step if it belongs here, else the first (outbound) step. */
export function pinNumber(group: PlaceGroup, activeId: string): number {
  const match = group.stops.find((s) => s.id === activeId)
  return (match ?? group.stops[0]).order
}

export function pickStopFromMarker(group: PlaceGroup, activeId: string): Stop {
  const inView = group.stops.find((s) => s.id === activeId)
  return inView ?? group.stops[0]
}

export function climbStops(stops: Stop[]): Stop[] {
  return stops.filter((s) => s.placeId === 'lepushe' || s.placeId === 'maja-e-vajushes')
}
