#!/usr/bin/env node
/**
 * Build-time route preparation — NEVER called from the browser.
 *
 * Drive leg: public OSRM driving profile
 *   https://router.project-osrm.org/route/v1/driving/{Kafe Flora};{Lëpushë}
 *   ?overview=full&geometries=geojson
 *   Then Douglas-Peucker simplify at 25 m.
 *
 * Hike leg: Overpass API, then a shortest path on OSM ways:
 *   [out:json][timeout:90];
 *   (
 *     way["highway"~"^(path|track|footway|steps|bridleway)$"](42.49,19.70,42.55,19.80);
 *     relation["route"="hiking"](42.49,19.70,42.55,19.80);
 *   );
 *   out body; >; out skel qt;
 *   Dijkstra from the path node nearest Lëpushë (~22 m) to OSM peak node
 *   5157105256 (Maja e Vajushës). Douglas-Peucker 8 m. OSRM foot is the
 *   fallback if the graph has no path (the public foot profile wandered
 *   29 km on roads and is not used when Overpass succeeds).
 *
 * Elevation: AWS Terrain Tiles, terrarium encoding, no key
 *   https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
 *   ~100 samples along the raw hike line at z=14. Gain is the sum of
 *   positive elevation deltas. Never typed in by hand.
 *
 * Writes:
 *   src/data/trips/lepushe-maja-e-vajushes.json        (route + elevationProfile)
 *   src/data/trips/lepushe-maja-e-vajushes.route.geojson
 *
 * Requires: Python 3 + Pillow (build machine only). Network access to
 * OSRM, Overpass and AWS S3. No API keys.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const py = path.join(__dirname, 'build-route.py')
const r = spawnSync('python3', [py], { stdio: 'inherit', cwd: path.join(__dirname, '..') })
if (r.status !== 0) process.exit(r.status ?? 1)
