# Lëpushë to Maja e Vajushës — itinerary on a map

Front end for a one-trip itinerary page: a sticky terrain map locked to a numbered Sunday timeline, so a guest can see the whole day, pack the right gear, and book by phone.

**Stack:** Vite, React, TypeScript, Tailwind, shadcn/Radix, MapLibre GL JS. Basemap is free OSM raster (toned down) plus our own hillshade and contours from free AWS Terrain Tiles (terrarium encoding, no API key). Route data is local GeoJSON in the shape of a future `GET /api/trips/:id`, loaded through [`src/lib/getTrip.ts`](src/lib/getTrip.ts) — swapping that function body for a real `fetch` is one line.

**Route:** `/trips/lepushe-maja-e-vajushes` (and `/` for the same trip).

## Route geometry (precomputed, never at runtime)

The browser makes **zero** OSRM or Overpass calls. Both legs are baked into the committed FeatureCollection at [`src/data/trips/lepushe-maja-e-vajushes.json`](src/data/trips/lepushe-maja-e-vajushes.json) (`route` is a GeoJSON `FeatureCollection` with one LineString Feature per leg, `properties.leg: "drive" | "hike"`). A standalone copy lives at [`src/data/trips/lepushe-maja-e-vajushes.route.geojson`](src/data/trips/lepushe-maja-e-vajushes.route.geojson).

Regenerate with `npm run build-route` (`scripts/build-route.mjs` → `scripts/build-route.py`). Requires Python 3 + Pillow and network access; no API keys.

| Leg | Source | Distance | Notes |
|---|---|---|---|
| **Drive** — Kafe Flora, Tirana → Lëpushë | Public OSRM driving profile (`router.project-osrm.org`), then Douglas-Peucker simplify at 25 m. Return retraces this line and is **not drawn twice**. | **182 km** (OSRM raw 183.3 km, ~4.3 h of driving — the client’s road time is still `[PH]`) | Solid pine-mid `#2F5A48` 3.5 px, cream casing. |
| **Hike** — Lëpushë → Maja e Vajushës | Overpass query for `highway=path\|track\|footway\|steps\|bridleway` in bbox `42.49–42.55 N, 19.70–19.80 E`, stitched with Dijkstra from the path node nearest Lëpushë (~22 m) to OSM peak node [5157105256](https://www.openstreetmap.org/node/5157105256). Douglas-Peucker 8 m. OSRM foot was tried as a fallback and **not used** (it wandered 29 km on roads). | **7.5 km** (raw path 7,471 m; simplified line 7,321 m) | Dashed clay `#A8441E` `[1.6, 1.2]`, 4 px. This is the hero line. |

The Overpass query is in `scripts/build-route.py` (`OVERPASS_QUERY`).

## Elevation (the climb)

~100 points were sampled at **build time** from AWS Terrain Tiles (terrarium, z=14) along the raw hike line, stored as `[distance_m, elevation_m]` in `elevationProfile`. The chart is a plain SVG — no chart library.

| | From the DEM |
|---|---|
| Start (Lëpushë) | 1,287 m |
| End (summit sample) | 2,005 m (official OSM elevation, shown on the label, is **2,057 m**) |
| **Gain** | **918 m** |
| Loss | 200 m |
| Distance | **7.5 km** |

Under the chart: “Gain 918 m · distance 7.5 km”. Hover, tap and arrow keys move a pine marker along the hike line on the map; an `aria-live` line reads the value.

## Map, terrain, attribution

1. First paint is a fixed-height box with a two-stroke skeleton (solid pine drive + dashed clay hike). Summary, timeline, elevation profile and CTA do not wait on MapLibre.
2. After idle, MapLibre mounts the **flat** OSM basemap + route (saturation/contrast pulled back so the lines pop).
3. Then, on `requestIdleCallback` / map `idle`, the **DEM** source, hillshade and `maplibre-contour` contours are added. No DEM tiles are requested before the map mounts.
4. **Phone (&lt;768 px):** 2D hillshade + contours, pitch 0, no 3D terrain.
5. **Desktop:** a 44 px “3D” toggle is available and **off by default**. When on (and on the climb view), gentle exaggeration 1.3 and a modest pitch. `prefers-reduced-motion` forces 2D.

Attribution is a real, compact control **top-right of the map**, under the view toggles, so the mobile bottom sheet never covers it. It is checked by the smoke test at **390 px and 1280 px**:

> © OpenStreetMap contributors · Terrain: Mapzen / AWS Terrain Tiles

### OSM tiles are preview-only

The OSM raster tiles (`tile.openstreetmap.org`) — and OpenTopoMap, if it were used — are **preview-only**. They are fine for this low-traffic look at the page, but they are not a production tile host. A production deploy needs a tile-host decision from **devops and Drini** (self-hosted, a commercial OSM-based provider, or similar) before going live. Hillshade and contours already come from free AWS Terrain Tiles and can stay.

## Fonts

Self-hosted via `@fontsource`, woff2, `font-display: swap`:

- **Fraunces 600** — `latin` + `latin-ext` (ë / ç)
- **Source Sans 3** — 400, 500, 600, `latin` + `latin-ext`

The prerendered HTML preloads **only** the Fraunces 600 latin woff2 (`<link rel="preload" as="font" type="font/woff2" crossorigin>`). No Google Fonts.

## Scripts

```bash
npm install
npm run typecheck
npm run build-route # regenerate GeoJSON + DEM profile (network; Python + Pillow)
npm run og          # 1200×630 Open Graph card into public/og-image.png
npm run build       # typecheck + OG + client build + SSR prerender
npm run serve:prod  # production static server on 0.0.0.0:4174
npm run smoke       # Playwright against the built dist (phone 390, 1280, desktop 1440)
```

The first HTML paint already contains the real `<title>`, meta description, one `h1`, Open Graph tags, canonical (`https://[PH-domain]/trips/lepushe-maja-e-vajushes`), and `TouristTrip` JSON-LD. MapLibre is lazy-loaded after first paint (`requestIdleCallback` then a dynamic import) into a fixed-height map box (no CLS).

## `[PH]` placeholders still in the UI

Until the client fills these in, they stay visible as dashed clay pills — nothing is invented:

- Company / brand name (wordmark, document title, OG)
- Domain for canonical and OG URLs (`[PH-domain]`)
- Phone number (`tel:[PH]`) and WhatsApp (`wa.me/[PH]`)
- Rest-stop names and times (steps 2 and 6; Shkodër is a suggestion)
- Times for Lëpushë arrival, the summit, and the descent (steps 3, 4, 5)
- Drive duration in the map legend (`Drive · [PH]`) — OSRM’s ~4.3 h is only a routing estimate, not a client figure
- Return drop-off if it is not Kafe Flora (step 7 copy notes the assumption)
- Meeting instructions at Kafe Flora beyond “Meet 06:00 · Kafe Flora, Tirana”

The summit name **Maja e Vajushës** and elevation **2,057 m** are confirmed and are not placeholders.

## Design

Build follows [`/workspace/hiking/DESIGN.md`](../DESIGN.md) including the v1.1 terrain section, with two team overrides: the elevation profile is a **plain SVG** (no Recharts), and 3D terrain is **off by default** on desktop (opt-in toggle) and **never** used on the phone. Mobile: map on top, bottom sheet with summary, elevation profile, 7-step timeline and gear, sticky “Call to book · 3000 L” bar. Desktop: 420px timeline rail on the left, map on the right. “The climb · 5–6 h” inset opens the elevation profile (and the climb map view).
