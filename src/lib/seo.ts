import type { Trip } from '@/types/trip'

const CANONICAL = 'https://[PH-domain]/trips/lepushe-maja-e-vajushes'

export const PAGE_TITLE =
  'Lëpushë to Maja e Vajushës — Sun 15 Nov 2026 · 3000 L | [PH]'

export const PAGE_DESCRIPTION =
  'Day hike from Tirana to Lëpushë and Maja e Vajushës (2,057 m). Sunday 15 Nov 2026, 3000 L. Medium, 5–6 h climb. Meet 06:00 at Kafe Flora. Book by phone.'

export function touristTripJsonLd(trip: Trip): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: trip.title,
    description: PAGE_DESCRIPTION.replace(/\.$/, ''),
    touristType: 'Active hikers',
    itinerary: {
      '@type': 'ItemList',
      numberOfItems: 7,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Leave Tirana — Kafe Flora', description: 'Meet at 06:00.' },
        { '@type': 'ListItem', position: 2, name: 'Rest stop' },
        { '@type': 'ListItem', position: 3, name: 'Arrive Lëpushë' },
        { '@type': 'ListItem', position: 4, name: 'Maja e Vajushës', description: 'Summit at 2,057 m. Panorama and packed lunch.' },
        { '@type': 'ListItem', position: 5, name: 'Back down to Lëpushë' },
        { '@type': 'ListItem', position: 6, name: 'Rest stop on the return' },
        { '@type': 'ListItem', position: 7, name: 'Arrive Tirana', description: 'Around 21:30.' },
      ],
    },
    offers: {
      '@type': 'Offer',
      price: '3000',
      priceCurrency: 'ALL',
      availability: 'https://schema.org/InStock',
      validFrom: trip.date,
    },
    departureTime: '2026-11-15T06:00:00+01:00',
  }
}

export function headTags(trip: Trip): string {
  const title = PAGE_TITLE
  const desc = PAGE_DESCRIPTION
  const jsonLd = JSON.stringify(touristTripJsonLd(trip)).replace(/</g, '\\u003c')
  const ogImage = 'https://[PH-domain]/og-image.png'
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${CANONICAL}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="en_GB" />`,
    `<meta property="og:url" content="${CANONICAL}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(trip.title + ' — Sunday 15 Nov 2026 · 3000 L · [PH]')}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join('\n    ')
}

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export { CANONICAL }
