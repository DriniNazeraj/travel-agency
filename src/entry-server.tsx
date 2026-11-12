import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App'
import { getDefaultTrip, getTrip, DEFAULT_TRIP_SLUG } from '@/lib/getTrip'
import { headTags } from '@/lib/seo'

export async function render(url: string) {
  const slugMatch = url.match(/^\/trips\/([^/?#]+)/)
  const slug = slugMatch?.[1] ?? DEFAULT_TRIP_SLUG
  const trip = getTrip(slug) ?? getDefaultTrip()
  const html = renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  )
  return { html, head: headTags(trip) }
}
