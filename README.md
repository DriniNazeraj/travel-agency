# Lëpushë to Maja e Vajushës — itinerary on a map

A one-trip itinerary page for an Albanian hiking and travel company: a real terrain map locked to a numbered Sunday timeline (Lëpushë to Maja e Vajushës, 2,057 m), with a phone bottom sheet, an elevation profile, and a call-to-book CTA.

**`[PH]` marks client information that is still to come** — phone and WhatsApp numbers, brand name, rest-stop names, some times, drive duration, domain, and similar. Do not invent values for those placeholders. The summit name and elevation (2,057 m) are confirmed.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later (developed on Node 22). npm ships with Node.
- For the optional Playwright smoke test, a Chromium-based browser. If Chrome is not already installed: `npx playwright install chrome`.

## Setup

```
npm install
```

## Development

```
npm run dev
```

Then open http://localhost:5174/trips/lepushe-maja-e-vajushes (the same trip is also served at `/`). The Vite dev server listens on port 5174.

## Production build and preview

```
npm run build
npm run preview
```

`npm run build` typechecks, generates the Open Graph image, builds the client and SSR bundles, and prerenders the trip page into `dist`. `npm run preview` serves that build at http://localhost:4174 — open `/trips/lepushe-maja-e-vajushes`.

Optional checks: `npm run typecheck`, and `npm run smoke` for the Playwright suite (it builds nothing itself; run `npm run build` first, or point it at an existing `dist` with the `DIST` and `PORT` environment variables).

## Where the data lives

- **Trip content** (copy, stops, times, elevation profile, booking placeholders): `src/data/trips/lepushe-maja-e-vajushes.json`.
- **Route geometry**: `src/data/trips/lepushe-maja-e-vajushes.route.geojson`, also embedded as the `route` field on the trip JSON. This is a GeoJSON `FeatureCollection` with one LineString per leg. Each feature is tagged `properties.leg`: `"drive"` (Kafe Flora in Tirana to Lëpushë) or `"hike"` (Lëpushë to the summit). The browser does not call a routing API at runtime.
- **Map contour-label glyphs**: `public/glyphs/Source Sans 3 SemiBold/` — self-hosted MapLibre PBF ranges, requested as `/glyphs/{fontstack}/{range}.pbf`. UI fonts (Fraunces 600 and Source Sans 3) come from the `@fontsource/fraunces` and `@fontsource/source-sans-3` packages and are bundled with the app.

Trip data is loaded through `src/lib/getTrip.ts`.
