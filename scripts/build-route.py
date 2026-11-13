#!/usr/bin/env python3
"""Build-time drive + hike geometry and DEM elevation profile. See build-route.mjs."""
from __future__ import annotations

import heapq
import io
import json
import math
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

from PIL import Image

UA = "hiking-itinerary-build/0.1 (build-time route prep; OSM/OSRM/DEM; no keys)"
FLORA = (19.8145239, 41.3296753)
LEP = (19.7302647, 42.5281258)
SUM = (19.7602032, 42.5160521)
# Official OSM peak node, name:sq=Maja e Vajushës, ele=2057
SUMMIT_NODE = 5157105256

OVERPASS_QUERY = """
[out:json][timeout:90];
(
  way["highway"~"^(path|track|footway|steps|bridleway)$"](42.49,19.70,42.55,19.80);
  relation["route"="hiking"](42.49,19.70,42.55,19.80);
);
out body;
>;
out skel qt;
"""

ROOT = Path(__file__).resolve().parent.parent
TRIP = ROOT / "src/data/trips/lepushe-maja-e-vajushes.json"
GEOJSON = ROOT / "src/data/trips/lepushe-maja-e-vajushes.route.geojson"


def hav(a, b):
    R = 6371000.0
    lon1, lat1, lon2, lat2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlon, dlat = lon2 - lon1, lat2 - lat1
    s = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(s)))


def length(coords):
    return sum(hav(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def fetch(url, data=None, content_type=None):
    headers = {"User-Agent": UA}
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def perp_dist(p, a, b):
    if a == b:
        return hav(p, a)
    lat = math.radians((a[1] + b[1]) / 2)

    def en(q):
        return ((q[0] - a[0]) * 111320 * math.cos(lat), (q[1] - a[1]) * 110540)

    px, py = en(p)
    bx, by = en(b)
    denom = bx * bx + by * by
    t = 0 if denom == 0 else max(0, min(1, (px * bx + py * by) / denom))
    return math.hypot(px - t * bx, py - t * by)


def simplify(coords, tol):
    if len(coords) <= 2:
        return coords
    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    stack = [(0, len(coords) - 1)]
    while stack:
        i, j = stack.pop()
        maxd, maxk = -1, None
        for k in range(i + 1, j):
            d = perp_dist(coords[k], coords[i], coords[j])
            if d > maxd:
                maxd, maxk = d, k
        if maxd > tol and maxk is not None:
            keep[maxk] = True
            stack.append((i, maxk))
            stack.append((maxk, j))
    return [c for c, k in zip(coords, keep) if k]


def osrm_drive():
    url = (
        "https://router.project-osrm.org/route/v1/driving/"
        f"{FLORA[0]},{FLORA[1]};{LEP[0]},{LEP[1]}"
        "?overview=full&geometries=geojson&steps=false"
    )
    print("OSRM driving:", url)
    data = json.loads(fetch(url))
    if data.get("code") != "Ok":
        raise SystemExit(f"OSRM failed: {data}")
    route = data["routes"][0]
    raw = route["geometry"]["coordinates"]
    simp = simplify(raw, 25)
    print(f"  raw {len(raw)} pts {route['distance']/1000:.1f} km → simplified {len(simp)} pts {length(simp)/1000:.1f} km")
    return simp, route["distance"], route["duration"], len(raw)


def overpass():
    endpoints = (
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    )
    body = OVERPASS_QUERY.encode()
    last = None
    for url in endpoints:
        try:
            print("Overpass:", url)
            raw = fetch(url, data=body, content_type="application/x-www-form-urlencoded")
            return json.loads(raw)
        except Exception as e:
            last = e
            print("  failed:", e)
    raise SystemExit(f"Overpass failed: {last}")


def hike_from_overpass(data):
    nodes = {}
    ways = []
    for e in data["elements"]:
        if e["type"] == "node" and "lon" in e:
            nodes[e["id"]] = (e["lon"], e["lat"])
        elif e["type"] == "way":
            ways.append(e)
    graph = defaultdict(list)
    for w in ways:
        hw = (w.get("tags") or {}).get("highway")
        if hw not in ("path", "track", "footway", "steps", "bridleway"):
            continue
        nds = [n for n in w.get("nodes", []) if n in nodes]
        for i in range(len(nds) - 1):
            a, b = nds[i], nds[i + 1]
            d = hav(nodes[a], nodes[b])
            graph[a].append((b, d))
            graph[b].append((a, d))

    def nearest(pt):
        best = None
        for nid in graph:
            d = hav(nodes[nid], pt)
            if best is None or d < best[0]:
                best = (d, nid)
        return best

    sl, start = nearest(LEP)
    # Prefer the official peak node if it is in the graph
    if SUMMIT_NODE in graph:
        end, el = SUMMIT_NODE, hav(nodes[SUMMIT_NODE], SUM)
    else:
        el, end = nearest(SUM)
    print(f"  snap Lëpushë {sl:.1f} m → node {start}; summit {el:.1f} m → node {end}")

    dist = {start: 0.0}
    prev = {}
    pq = [(0.0, start)]
    seen = set()
    while pq:
        d, u = heapq.heappop(pq)
        if u in seen:
            continue
        seen.add(u)
        if u == end:
            break
        for v, w in graph[u]:
            nd = d + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
    if end not in prev and start != end:
        return None  # caller falls back to OSRM foot
    path = [end]
    cur = end
    while cur != start:
        cur = prev[cur]
        path.append(cur)
    path.reverse()
    coords = [nodes[n] for n in path]
    if sl > 15:
        coords = [LEP] + coords
    if el > 15:
        coords = coords + [SUM]
    return coords


def osrm_foot_fallback():
    url = (
        "https://router.project-osrm.org/route/v1/foot/"
        f"{LEP[0]},{LEP[1]};{SUM[0]},{SUM[1]}"
        "?overview=full&geometries=geojson"
    )
    print("OSRM foot fallback:", url)
    data = json.loads(fetch(url))
    if data.get("code") != "Ok":
        raise SystemExit(f"OSRM foot failed: {data}")
    return data["routes"][0]["geometry"]["coordinates"], "OSRM foot (Overpass graph had no path)"


def interpolate_along(coords, n=100):
    dists = [0.0]
    for i in range(len(coords) - 1):
        dists.append(dists[-1] + hav(coords[i], coords[i + 1]))
    total = dists[-1]
    samples = []
    j = 0
    for i in range(n):
        t = 0 if n == 1 else total * i / (n - 1)
        while j < len(dists) - 2 and dists[j + 1] < t:
            j += 1
        seg = dists[j + 1] - dists[j]
        f = 0 if seg == 0 else (t - dists[j]) / seg
        lng = coords[j][0] + f * (coords[j + 1][0] - coords[j][0])
        lat = coords[j][1] + f * (coords[j + 1][1] - coords[j][1])
        samples.append((t, lng, lat))
    return samples, total


def deg2tile(lng, lat, z):
    lat = max(min(lat, 85.0511), -85.0511)
    n = 2**z
    xtile = (lng + 180.0) / 360.0 * n
    lat_rad = math.radians(lat)
    ytile = (1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2.0 * n
    return xtile, ytile


def terrarium(r, g, b):
    return (r * 256 + g + b / 256) - 32768


def sample_dem(samples, z=14):
    tiles = set()
    for _, lng, lat in samples:
        x, y = deg2tile(lng, lat, z)
        tiles.add((int(math.floor(x)), int(math.floor(y))))
    cache = {}
    for x, y in tiles:
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
        print("  DEM", url)
        img = Image.open(io.BytesIO(fetch(url))).convert("RGB")
        cache[(x, y)] = img
        time.sleep(0.05)

    def elev(lng, lat):
        x, y = deg2tile(lng, lat, z)
        tx, ty = int(math.floor(x)), int(math.floor(y))
        img = cache[(tx, ty)]
        w, h = img.size
        px, py = (x - tx) * w, (y - ty) * h
        x0 = min(w - 1, max(0, int(math.floor(px))))
        y0 = min(h - 1, max(0, int(math.floor(py))))
        x1, y1 = min(w - 1, x0 + 1), min(h - 1, y0 + 1)
        fx, fy = px - x0, py - y0

        def e(i, j):
            r, g, b = img.getpixel((i, j))
            return terrarium(r, g, b)

        return (
            e(x0, y0) * (1 - fx) * (1 - fy)
            + e(x1, y0) * fx * (1 - fy)
            + e(x0, y1) * (1 - fx) * fy
            + e(x1, y1) * fx * fy
        )

    profile = []
    for t, lng, lat in samples:
        profile.append([round(t, 1), round(elev(lng, lat), 1)])
    gain = loss = 0.0
    for i in range(1, len(profile)):
        d = profile[i][1] - profile[i - 1][1]
        if d > 0:
            gain += d
        else:
            loss += -d
    return profile, gain, loss


def rnd(coords):
    return [[round(c[0], 6), round(c[1], 6)] for c in coords]


def main():
    drive, osrm_m, osrm_s, n_raw = osrm_drive()

    hike_source = (
        "OSM highway=path/track/footway/steps/bridleway in bbox 42.49–42.55 N, "
        "19.70–19.80 E (Overpass API). Undirected graph of way nodes; Dijkstra "
        f"from the path node nearest Lëpushë to OSM peak node {SUMMIT_NODE} "
        "(Maja e Vajushës). Simplified Douglas-Peucker 8 m. Build-time only; "
        "no runtime Overpass or OSRM calls."
    )
    hike_raw = hike_from_overpass(overpass())
    if hike_raw is None:
        hike_raw, hike_source = osrm_foot_fallback()
    hike = simplify(hike_raw, 8)
    print(f"hike raw {len(hike_raw)} {length(hike_raw):.0f} m → {len(hike)} pts {length(hike):.0f} m")

    samples, hike_len = interpolate_along(hike_raw, 100)
    print(f"DEM sampling {len(samples)} points along {hike_len:.0f} m")
    profile, gain, loss = sample_dem(samples, 14)
    print(f"  start {profile[0][1]} m end {profile[-1][1]} m gain {gain:.0f} m loss {loss:.0f} m")

    trip = json.loads(TRIP.read_text())
    trip["route"] = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "leg": "drive",
                    "mode": "drive",
                    "approximate": True,
                    "distance_m": round(length(drive), 1),
                    "osrm_distance_m": round(osrm_m, 1),
                    "osrm_duration_s": round(osrm_s, 1),
                    "source": (
                        "OSRM driving profile, public demo router.project-osrm.org, "
                        "Kafe Flora (Tirana) to Lëpushë, geometry simplified with "
                        "Douglas-Peucker 25 m. Build-time only; no runtime routing."
                    ),
                },
                "geometry": {"type": "LineString", "coordinates": rnd(drive)},
            },
            {
                "type": "Feature",
                "properties": {
                    "leg": "hike",
                    "mode": "hike",
                    "approximate": True,
                    "distance_m": round(length(hike), 1),
                    "gain_m": round(gain, 0),
                    "source": hike_source,
                },
                "geometry": {"type": "LineString", "coordinates": rnd(hike)},
            },
        ],
    }
    trip["elevationProfile"] = {
        "leg": "hike",
        "points": profile,
        "n": len(profile),
        "gain_m": round(gain, 0),
        "loss_m": round(loss, 0),
        "distance_m": round(hike_len, 1),
        "start_m": profile[0][1],
        "end_m": profile[-1][1],
        "summit_official_m": 2057,
        "dem_zoom": 14,
        "source": (
            "AWS Terrain Tiles (terrarium encoding) "
            "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png, "
            "sampled at z=14 along the hike leg at build time (~100 evenly spaced points)."
        ),
    }
    trip["attribution"] = "© OpenStreetMap contributors · Terrain: Mapzen / AWS Terrain Tiles"
    TRIP.write_text(json.dumps(trip, indent=2, ensure_ascii=False) + "\n")
    GEOJSON.write_text(json.dumps(trip["route"], indent=2, ensure_ascii=False) + "\n")
    print("wrote", TRIP, "and", GEOJSON)


if __name__ == "__main__":
    main()
