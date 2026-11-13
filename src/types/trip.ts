export interface TripPrice {
  amount: number
  currency: string
  display: string
}

export interface TripDifficulty {
  level: string
  label: string
  note: string
}

export interface TripDuration {
  hikeHours: string
  hikeLabel: string
  dayStart: string
  dayEnd: string
  dayLabel: string
}

export interface MeetingPoint {
  name: string
  city: string
  time: string
  lat: number
  lng: number
  approximate: boolean
  source?: string
}

export interface Booking {
  method: string
  phone: string
  phoneDisplay: string
  telHref: string
  whatsapp: string
  whatsappHref: string
  whatsappPrefill: string
  ctaLabel: string
}

export interface Company {
  name: string
  domain: string
}

export interface GearItem {
  id: string
  label: string
}

export interface Stop {
  id: string
  order: number
  time: string | null
  timeDisplay: string
  title: string
  description: string
  lat: number
  lng: number
  approximate: boolean
  source?: string
  kind?: string
  placeId: string
  elevationM?: number
  placeholder?: boolean
}

export interface RouteLegProperties {
  leg: 'drive' | 'hike'
  mode: 'drive' | 'hike'
  approximate: boolean
  source?: string
  distance_m?: number
  gain_m?: number
  osrm_distance_m?: number
  osrm_duration_s?: number
  note?: string
}

export interface RouteLegFeature {
  type: 'Feature'
  properties: RouteLegProperties
  geometry: {
    type: 'LineString'
    coordinates: [number, number][]
  }
}

export interface RouteCollection {
  type: 'FeatureCollection'
  features: RouteLegFeature[]
}

/** Evenly spaced DEM samples along the hike leg: [distance_m, elevation_m]. */
export interface ElevationProfile {
  leg: 'hike'
  points: [number, number][]
  n: number
  gain_m: number
  loss_m: number
  distance_m: number
  start_m: number
  end_m: number
  summit_official_m: number
  dem_zoom: number
  source: string
}

export interface Trip {
  id: string
  slug: string
  title: string
  subtitle: string
  deck: string
  locale: string
  date: string
  dateLabel: string
  dateShort: string
  price: TripPrice
  difficulty: TripDifficulty
  duration: TripDuration
  meetingPoint: MeetingPoint
  booking: Booking
  company: Company
  copy: {
    language: string
    placeNames: string
    languageToggle: string
  }
  gear: GearItem[]
  stops: Stop[]
  route: RouteCollection
  elevationProfile: ElevationProfile
  attribution: string
  placeholders: string[]
}
