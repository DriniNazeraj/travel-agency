import data from '@/data/trips/lepushe-maja-e-vajushes.json'
import type { Trip } from '@/types/trip'

const trip = data as Trip

const TRIPS: Record<string, Trip> = {
  [trip.id]: trip,
  [trip.slug]: trip,
}

/**
 * Load a trip by id or slug.
 * Local JSON today. To use the real API later, replace the body with:
 *   return fetch(`/api/trips/${id}`).then((r) => r.json())
 */
export function getTrip(id: string): Trip | undefined {
  return TRIPS[id]
}

export function getDefaultTrip(): Trip {
  return trip
}

export const DEFAULT_TRIP_SLUG = trip.slug
