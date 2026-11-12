import type { ElevationProfile, RouteCollection, RouteLegFeature, Trip } from '@/types/trip'

const R = 6371000

export function haversine(a: [number, number], b: [number, number]): number {
  const toR = (d: number) => (d * Math.PI) / 180
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const dLat = toR(lat2 - lat1)
  const dLng = toR(lng2 - lng1)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function lineLength(coords: [number, number][]): number {
  let n = 0
  for (let i = 0; i < coords.length - 1; i++) n += haversine(coords[i], coords[i + 1])
  return n
}

/** Point at a distance (metres) along a LineString, plus the bearing leftover. */
export function pointAlong(coords: [number, number][], distanceM: number): [number, number] {
  if (!coords.length) return [0, 0]
  if (distanceM <= 0) return coords[0]
  let acc = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const seg = haversine(coords[i], coords[i + 1])
    if (acc + seg >= distanceM || i === coords.length - 2) {
      const f = seg === 0 ? 0 : Math.min(1, (distanceM - acc) / seg)
      const [lng1, lat1] = coords[i]
      const [lng2, lat2] = coords[i + 1]
      return [lng1 + f * (lng2 - lng1), lat1 + f * (lat2 - lat1)]
    }
    acc += seg
  }
  return coords[coords.length - 1]
}

export function driveLeg(route: RouteCollection): RouteLegFeature | undefined {
  return route.features.find((f) => f.properties.leg === 'drive')
}

export function hikeLeg(route: RouteCollection): RouteLegFeature | undefined {
  return route.features.find((f) => f.properties.leg === 'hike')
}

export function allRouteCoords(route: RouteCollection): [number, number][] {
  return route.features.flatMap((f) => f.geometry.coordinates)
}

/** Steps 1–3 and 5–7 light up the drive leg; step 4 lights the hike. */
export function activeLegForStop(order: number): 'drive' | 'hike' {
  return order === 4 ? 'hike' : 'drive'
}

export function formatKm(m: number): string {
  return `${(m / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`
}

export function formatM(m: number): string {
  return `${Math.round(m).toLocaleString('en-GB')} m`
}

export function profilePointLngLat(
  trip: Trip,
  index: number,
): { lng: number; lat: number; distance_m: number; elevation_m: number } | null {
  const profile: ElevationProfile | undefined = trip.elevationProfile
  const hike = hikeLeg(trip.route)
  if (!profile || !hike) return null
  const pt = profile.points[index]
  if (!pt) return null
  const [lng, lat] = pointAlong(hike.geometry.coordinates, pt[0])
  return { lng, lat, distance_m: pt[0], elevation_m: pt[1] }
}
