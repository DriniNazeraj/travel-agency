import { Navigate, Route, Routes } from 'react-router-dom'
import { TripItinerary } from '@/pages/TripItinerary'
import { DEFAULT_TRIP_SLUG } from '@/lib/getTrip'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TripItinerary slug={DEFAULT_TRIP_SLUG} />} />
      <Route path="/trips/:slug" element={<TripItinerary />} />
      <Route path="*" element={<Navigate to={`/trips/${DEFAULT_TRIP_SLUG}`} replace />} />
    </Routes>
  )
}
