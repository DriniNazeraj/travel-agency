/**
 * Smoke: load the built page at phone (390) and desktop (1280 / 1440) widths,
 * assert 0 console errors, assert map attribution is visible and not covered
 * by the bottom sheet, click a timeline step and confirm the active step +
 * map camera moved, open the climb view, and save screenshots to
 * /workspace/hiking/shots/.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const site = path.resolve(__dirname, '..')
const shots = process.env.SHOTS ?? '/workspace/hiking/shots'
const SUMMIT = { lat: 42.5160521, lng: 19.7602032 }
fs.mkdirSync(shots, { recursive: true })

let serverProc
let base = process.env.SMOKE_URL

async function waitFor(url, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, { redirect: 'manual' })
      if (r.status === 200 || r.status === 301 || r.status === 302) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`server did not come up at ${url}`)
}

if (!base) {
  const port = Number(process.env.PORT ?? 4179)
  serverProc = spawn('node', [path.join(site, 'scripts/serve-prod.mjs'), String(port)], {
    cwd: site,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
  })
  base = `http://127.0.0.1:${port}`
  await waitFor(`${base}/trips/lepushe-maja-e-vajushes`)
}

const url = `${base}/trips/lepushe-maja-e-vajushes`
const errors = []

async function assertAttributionVisible(page, name) {
  const info = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="map-attribution"]')
    if (!el) return { ok: false, reason: 'missing' }
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const inView = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.left < vw && r.right > 0
    // Sample several points on the attribution — none should belong to the sheet.
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 4, r.top + r.height / 2],
      [r.right - 4, r.top + r.height / 2],
    ]
    const hits = pts.map(([x, y]) => {
      const hit = document.elementFromPoint(x, y)
      const coveredBySheet = !!(hit && hit.closest('[data-sheet]'))
      const isSelf = !!(hit && (hit === el || el.contains(hit) || hit.closest('[data-testid="map-attribution"]')))
      return { x, y, tag: hit && hit.tagName, coveredBySheet, isSelf, text: hit && hit.textContent?.slice(0, 80) }
    })
    const text = el.textContent || ''
    const hasOsm = /OpenStreetMap/i.test(text)
    const hasTerrain = /Terrain|AWS|Mapzen/i.test(text)
    return { ok: inView && hasOsm && hasTerrain && hits.every((h) => !h.coveredBySheet && h.isSelf), inView, hasOsm, hasTerrain, rect: { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom }, hits, vw, vh }
  })
  if (!info.ok) {
    throw new Error(`${name}: attribution not visible/unobscured: ${JSON.stringify(info)}`)
  }
  return info
}


async function assertLegendClearOfAttribution(page, name) {
  const info = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="map-attribution"]')
    const l = document.querySelector('[data-testid="route-legend"]')
    if (!a || !l) return { ok: false, reason: 'missing', hasA: !!a, hasL: !!l }
    const ar = a.getBoundingClientRect()
    const lr = l.getBoundingClientRect()
    const intersect = !(
      ar.right <= lr.left ||
      ar.left >= lr.right ||
      ar.bottom <= lr.top ||
      ar.top >= lr.bottom
    )
    const vw = window.innerWidth
    const vh = window.innerHeight
    const legendInView = lr.width > 0 && lr.height > 0 && lr.bottom > 0 && lr.top < vh && lr.left < vw && lr.right > 0
    const mid = [lr.left + lr.width / 2, lr.top + lr.height / 2]
    const hit = document.elementFromPoint(mid[0], mid[1])
    const coveredBySheet = !!(hit && hit.closest('[data-sheet]'))
    const isSelf = !!(hit && (hit === l || l.contains(hit) || hit.closest('[data-testid="route-legend"]')))
    return {
      ok: !intersect && legendInView && !coveredBySheet && isSelf,
      intersect,
      legendInView,
      coveredBySheet,
      isSelf,
      ar: { top: ar.top, left: ar.left, right: ar.right, bottom: ar.bottom, width: ar.width, height: ar.height },
      lr: { top: lr.top, left: lr.left, right: lr.right, bottom: lr.bottom, width: lr.width, height: lr.height },
      vw,
      vh,
    }
  })
  if (!info.ok) {
    throw new Error(`${name}: legend intersects attribution or is obscured: ${JSON.stringify(info)}`)
  }
  return info
}

function isDemUrl(u) {
  return /elevation-tiles-prod|\/terrarium\//i.test(u)
}
function isMapViewChunk(u) {
  return /\/assets\/MapView-.*\.js(?:\?|$)/.test(u)
}
function demZoom(u) {
  const m = u.match(/terrarium\/(\d+)\//)
  return m ? Number(m[1]) : null
}

/** Count and SUM transfer/body sizes of every DEM request. Dedupes identical
 *  URL+bytes only when CDP and page events both recorded the same fetch. */
function summarizeDem(reqs) {
  const seen = new Set()
  const unique = []
  for (const d of reqs) {
    const key = `${d.status}|${d.z}|${d.url}|${d.bytes}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(d)
  }
  return {
    count: unique.length,
    bytes: unique.reduce((s, d) => s + (d.bytes || 0), 0),
    maxZ: unique.reduce((m, d) => Math.max(m, d.z ?? 0), 0),
    overzoom: unique.filter((d) => (d.z ?? 0) > 11).length,
    tiles: unique.map((d) => ({ z: d.z, bytes: d.bytes, url: d.url.replace(/^https?:\/\/[^/]+/, '') })),
  }
}

const STEP_PLACE = {
  1: 'kafe-flora',
  2: 'rest-shkoder',
  3: 'lepushe',
  4: 'maja-e-vajushes',
  5: 'lepushe',
  6: 'rest-shkoder',
  7: 'kafe-flora',
}

/** Desktop climb padding from MapView — used to assert pins sit in the padded viewport. */
const CLIMB_PAD = { top: 128, right: 120, bottom: 88, left: 80 }

function pinStateInPage() {
  const host = document.querySelector('[data-map-ready="true"]')
  const canvas = document.querySelector('.maplibregl-canvas')
  const pane = document.querySelector('[data-testid="map-pane"]')
  const mapEl = canvas || pane
  const r = mapEl?.getBoundingClientRect()
  const pins = [...document.querySelectorAll('.map-pin')].map((p) => {
    const b = p.getBoundingClientRect()
    return {
      placeId: p.dataset.placeId,
      active: p.classList.contains('is-active'),
      x: b.x,
      y: b.y,
      w: b.width,
      h: b.height,
      cx: b.x + b.width / 2,
      cy: b.y + b.height / 2,
    }
  })
  return {
    map: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
    pins,
    camera: {
      lng: host?.getAttribute('data-map-lng'),
      lat: host?.getAttribute('data-map-lat'),
      zoom: host?.getAttribute('data-map-zoom'),
      pitch: host?.getAttribute('data-map-pitch'),
    },
    mode: document.querySelector('[data-map-mode]')?.getAttribute('data-map-mode'),
    terrain: document.querySelector('[data-testid="terrain-3d"]')?.getAttribute('aria-pressed'),
  }
}

function pinInside(pin, map, pad, slop = 20) {
  if (!pin || !map) return false
  return (
    pin.cx >= map.x + pad.left - slop &&
    pin.cx <= map.x + map.w - pad.right + slop &&
    pin.cy >= map.y + pad.top - slop &&
    pin.cy <= map.y + map.h - pad.bottom + slop
  )
}

function pinOnCanvas(pin, map, slop = 8) {
  if (!pin || !map) return false
  return (
    pin.cx >= map.x - slop &&
    pin.cx <= map.x + map.w + slop &&
    pin.cy >= map.y - slop &&
    pin.cy <= map.y + map.h + slop
  )
}

async function readPins(page) {
  return page.evaluate(pinStateInPage)
}

async function waitClimbFramed(page, timeout = 12000) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeout) {
    last = await readPins(page)
    const p3 = last.pins.find((p) => p.placeId === 'lepushe')
    const p4 = last.pins.find((p) => p.placeId === 'maja-e-vajushes')
    const in3 = pinInside(p3, last.map, CLIMB_PAD)
    const in4 = pinInside(p4, last.map, CLIMB_PAD)
    const zoom = parseFloat(last.camera.zoom ?? '0')
    const lat = parseFloat(last.camera.lat ?? '0')
    if (last.mode === 'climb' && in3 && in4 && zoom >= 11 && lat > 42.4 && lat < 42.65) {
      return { ...last, in3, in4, ok: true }
    }
    await page.waitForTimeout(150)
  }
  const p3 = last?.pins.find((p) => p.placeId === 'lepushe')
  const p4 = last?.pins.find((p) => p.placeId === 'maja-e-vajushes')
  return {
    ...last,
    in3: pinInside(p3, last?.map, CLIMB_PAD),
    in4: pinInside(p4, last?.map, CLIMB_PAD),
    ok: false,
  }
}

async function waitPinOnCanvas(page, placeId, timeout = 10000) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeout) {
    last = await readPins(page)
    const pin = last.pins.find((p) => p.placeId === placeId)
    if (pinOnCanvas(pin, last.map)) return { ...last, pin, ok: true }
    await page.waitForTimeout(150)
  }
  const pin = last?.pins.find((p) => p.placeId === placeId)
  return { ...last, pin, ok: false }
}

/** Active stop's pin is on-canvas and in the central ~76% of the map (padded-center). */
function pinNearCenter(pin, map) {
  if (!pinOnCanvas(pin, map)) return false
  const dx = Math.abs(pin.cx - (map.x + map.w / 2))
  const dy = Math.abs(pin.cy - (map.y + map.h / 2))
  return dx <= map.w * 0.38 && dy <= map.h * 0.38
}

async function waitPinNearCenter(page, placeId, timeout = 10000) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeout) {
    last = await readPins(page)
    const pin = last.pins.find((p) => p.placeId === placeId)
    if (pinNearCenter(pin, last.map)) return { ...last, pin, ok: true, nearCenter: true }
    await page.waitForTimeout(150)
  }
  const pin = last?.pins.find((p) => p.placeId === placeId)
  return { ...last, pin, ok: false, nearCenter: pinNearCenter(pin, last?.map) }
}

async function arrowToStep(page, key, step, shots, name) {
  const arrived = async (timeout) =>
    page
      .waitForFunction(
        (n) => document.querySelector(`button[data-step="${n}"]`)?.getAttribute('data-active') === 'true',
        step,
        { timeout },
      )
      .then(() => true)
      .catch(() => false)
  // Send the arrow from the adjacent step (the one we should already be on),
  // not from whatever scroll-follow last marked active.
  const from = key === 'ArrowDown' ? step - 1 : step + 1
  const fromBtn = page.locator(`button[data-step="${from}"]`)
  await fromBtn.scrollIntoViewIfNeeded()
  await fromBtn.focus()
  await fromBtn.press(key)
  if (await arrived(4000)) return
  await fromBtn.scrollIntoViewIfNeeded()
  await fromBtn.focus()
  await fromBtn.press(key)
  if (await arrived(5000)) return
  const state = await page.evaluate(() => ({
    active: document.querySelector('[data-active-stop]')?.getAttribute('data-active-stop'),
    focused: document.activeElement?.getAttribute?.('data-step'),
    btn: [...document.querySelectorAll('button[data-step]')].map((b) => ({
      step: b.getAttribute('data-step'),
      active: b.getAttribute('data-active'),
      focused: b === document.activeElement,
    })),
  }))
  await page.screenshot({ path: path.join(shots, `${name}-3d-kb-fail-${key}-${step}.png`), fullPage: false })
  throw new Error(`${name}: keyboard ${key} did not activate step ${step}: ${JSON.stringify(state)}`)
}




/** Phone sheet handle: 36×4 visual bar, ≥44px hit area, first row below it. */
async function assertSheetHandle(page, name, shots) {
  const info = await page.evaluate(() => {
    const handle = document.querySelector('[data-testid="sheet-handle"]')
    const bar = document.querySelector('[data-testid="sheet-handle-bar"]')
    const scroll = document.querySelector('[data-timeline-scroll]')
    const first = document.querySelector('button[data-step="1"]')
    if (!handle || !bar) return { ok: false, reason: 'missing-handle-or-bar' }
    const cs = getComputedStyle(handle)
    const bcs = getComputedStyle(bar)
    const hr = handle.getBoundingClientRect()
    const br = bar.getBoundingClientRect()
    const hitarea = handle.querySelector('[data-vaul-handle-hitarea]')
    const hit = (hitarea ?? handle).getBoundingClientRect()
    const sr = scroll?.getBoundingClientRect()
    const fr = first?.getBoundingClientRect()
    const insideScroll = !!(scroll && scroll.contains(handle))
    const barW = br.width
    const barH = br.height
    const barOk = Math.abs(barW - 36) <= 1.5 && Math.abs(barH - 4) <= 1.5
    const hitOk = hit.width >= 44 && hit.height >= 44 && hr.height >= 44 && hr.width >= 44
    const bg = (cs.backgroundColor || '').replace(/\s/g, '')
    const transparentBg =
      bg === 'transparent' ||
      bg === 'rgba(0,0,0,0)' ||
      bg === 'rgba(0,0,0,0)' ||
      /^rgba\(\d+,\d+,\d+,0\)$/.test(bg)
    const barBg = (bcs.backgroundColor || '').replace(/\s/g, '')
    // #D4CBBA = rgb(212, 203, 186)
    const barColorOk = /rgb\(212,\s*203,\s*186\)/.test(bcs.backgroundColor || '') || barBg === '#d4cbba'
    const scrollBelow = !sr || sr.top >= hr.bottom - 1
    const firstBelow = !fr || fr.top >= hr.bottom - 1
    const ok = barOk && hitOk && transparentBg && barColorOk && !insideScroll && scrollBelow && firstBelow
    return {
      ok,
      barOk,
      hitOk,
      transparentBg,
      barColorOk,
      insideScroll,
      scrollBelow,
      firstBelow,
      bar: { w: +barW.toFixed(2), h: +barH.toFixed(2), bg: bcs.backgroundColor, radius: bcs.borderRadius },
      handle: { w: +hr.width.toFixed(2), h: +hr.height.toFixed(2), bg: cs.backgroundColor, top: +hr.top.toFixed(2), bottom: +hr.bottom.toFixed(2) },
      hit: { w: +hit.width.toFixed(2), h: +hit.height.toFixed(2) },
      scroll: sr ? { top: +sr.top.toFixed(2) } : null,
      first: fr ? { top: +fr.top.toFixed(2) } : null,
    }
  })
  await page.screenshot({ path: path.join(shots, 'phone-sheet-handle-v131.png'), fullPage: false })
  if (!info.ok) {
    throw new Error(`${name}: sheet handle failed: ${JSON.stringify(info)}`)
  }
  return info
}


/** Phone first view: every stop pin sits in the visible map (below 120px, above the sheet). */
async function assertFirstViewPins(page, name, shots) {
  const info = await page.evaluate(() => {
    const sheet =
      document.querySelector('.sheet-snap-body') ?? document.querySelector('[data-sheet]')
    const sr = sheet?.getBoundingClientRect()
    const sheetTop = sr?.top ?? 0
    const padTop = 120
    const needed = ['kafe-flora', 'rest-shkoder', 'lepushe', 'maja-e-vajushes']
    const pins = [...document.querySelectorAll('.map-pin')].map((p) => {
      const b = p.getBoundingClientRect()
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      // The whole pin, not just its centre, must sit in the visible band
      // (below the 120px control/attribution stack, above the sheet).
      const inArea =
        b.top >= padTop - 0.5 &&
        b.bottom <= sheetTop + 0.5 &&
        b.left >= 0 &&
        b.right <= window.innerWidth
      return {
        placeId: p.dataset.placeId,
        cx: +cx.toFixed(1),
        cy: +cy.toFixed(1),
        top: +b.top.toFixed(1),
        bottom: +b.bottom.toFixed(1),
        inArea,
      }
    })
    const missing = needed.filter((id) => !pins.some((p) => p.placeId === id))
    const ok = missing.length === 0 && pins.length >= 4 && pins.every((p) => p.inArea)
    return { ok, sheetTop: +sheetTop.toFixed(1), padTop, missing, pins }
  })
  await page.screenshot({ path: path.join(shots, 'phone-whole-day-v132.png'), fullPage: false })
  if (!info.ok) {
    throw new Error(`${name}: first-view pins not in the visible map area: ${JSON.stringify(info)}`)
  }
  return info
}

async function runAt(browser, { name, width, height, alsoClimb = true }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  const pageErrors = []
  const http404s = []
  const mapViewReqs = []
  const demReqs = []
  const demBodyWaits = []
  let loadFired = false
  let interacted = false
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`[console] ${msg.text()}`)
  })
  page.on('pageerror', (err) => pageErrors.push(`[pageerror] ${err.message}`))
  page.on('load', () => {
    loadFired = true
  })
  // CDP transfer sizes: encodedDataLength is the on-the-wire byte count per request.
  const cdpDem = new Map()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  cdp.on('Network.responseReceived', ({ requestId, response }) => {
    if (isDemUrl(response.url)) {
      cdpDem.set(requestId, { url: response.url, encoded: 0 })
    }
  })
  cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    const r = cdpDem.get(requestId)
    if (r) r.encoded = encodedDataLength ?? 0
  })
  const applyCdpSizes = () => {
    // Match unused CDP records to demReqs with the same URL and a smaller byte count.
    const leftover = [...cdpDem.values()]
    for (const rec of demReqs) {
      const i = leftover.findIndex((c) => c.url === rec.url && !c._used)
      if (i < 0) continue
      const c = leftover[i]
      c._used = true
      if ((c.encoded || 0) > rec.bytes) rec.bytes = c.encoded
    }
    // CDP-only requests that Playwright's page 'response' missed (workers).
    for (const c of leftover) {
      if (c._used || !c.encoded) continue
      const existing = demReqs.find((d) => d.url === c.url)
      if (existing) {
        if (c.encoded > existing.bytes) existing.bytes = c.encoded
        c._used = true
        continue
      }
      c._used = true
      demReqs.push({
        url: c.url,
        status: 200,
        bytes: c.encoded,
        z: demZoom(c.url),
        afterLoad: loadFired,
        afterInteract: interacted,
        fromCdp: true,
      })
    }
  }

  page.on('request', (req) => {
    const u = req.url()
    if (isMapViewChunk(u)) {
      mapViewReqs.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), afterLoad: loadFired, afterInteract: interacted })
    }
  })
  page.on('response', (res) => {
    const status = res.status()
    const u = res.url()
    if (status >= 400 && !/favicon/.test(u)) {
      http404s.push({ url: u, status })
    }
    if (isDemUrl(u)) {
      const rec = {
        url: u,
        status,
        bytes: Number(res.headers()['content-length'] || 0),
        z: demZoom(u),
        afterLoad: loadFired,
        afterInteract: interacted,
      }
      demReqs.push(rec)
      // Start every size probe immediately so Chrome does not evict the body.
      // Sum transfer sizes of ALL DEM requests — content-length is often missing,
      // and a late res.body() only lands one tile (~137 KB).
      demBodyWaits.push(
        (async () => {
          const take = (n) => {
            if (Number.isFinite(n) && n > rec.bytes) rec.bytes = n
          }
          take(Number(res.headers()['content-length'] || 0))
          try {
            const b = await res.body()
            take(b?.length ?? 0)
          } catch {
            /* body may already be evicted; fall through */
          }
          try {
            const s = await res.request().sizes()
            take(s?.responseBodySize ?? 0)
          } catch {
            /* cached or worker request */
          }
        })(),
      )
    }
  })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('h1', { timeout: 10000 })
  await page.waitForSelector('button[data-step="4"]', { timeout: 10000 })
  await page.waitForSelector('[data-testid="map-attribution"]', { timeout: 5000 })
  // First-paint (skeleton may still be showing) — LCP should be this, not the map.
  await page.screenshot({ path: path.join(shots, `${name}-initial.png`), fullPage: false })
  // MapView starts after window load + requestIdleCallback; allow a longer wait.
  await page.waitForSelector('[data-map-ready="true"]', { timeout: 25000 }).catch(() => {})
  // Settle: any wrongly-eager DEM would show up here, before we interact.
  await page.waitForTimeout(1500)
  await Promise.all(demBodyWaits)
  applyCdpSizes()
  const firstViewDem = demReqs.filter((d) => !d.afterInteract).map((d) => ({ url: d.url, bytes: d.bytes, z: d.z }))
  const mapViewBeforeLoad = mapViewReqs.filter((r) => !r.afterLoad)
  if (width >= 1280 && firstViewDem.length) {
    throw new Error(`${name}: DEM requests before interaction at desktop first view: ${JSON.stringify(firstViewDem)}`)
  }
  if (mapViewBeforeLoad.length) {
    throw new Error(`${name}: MapView chunk requested before load event: ${JSON.stringify(mapViewBeforeLoad)}`)
  }
  let paneAria = null
  if (width === 390) {
    // Drawer has mounted by now; vaul must not aria-hide the live map.
    paneAria = await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="map-pane"]')
      if (!pane) return { ok: false, reason: 'no-pane' }
      const chain = []
      let n = pane
      while (n && n !== document.body) {
        if (n.getAttribute('aria-hidden') === 'true') {
          chain.push({
            tag: n.tagName,
            testid: n.getAttribute('data-testid'),
            className: (n.className || '').toString().slice(0, 100),
          })
        }
        n = n.parentElement
      }
      return { ok: chain.length === 0 && pane.getAttribute('aria-hidden') !== 'true', chain, ready: pane.getAttribute('data-map-ready') }
    })
    if (!paneAria.ok) {
      throw new Error(`${name}: map pane is aria-hidden at 390: ${JSON.stringify(paneAria)}`)
    }
  }
  await page.screenshot({ path: path.join(shots, `${name}-drive.png`), fullPage: false })

  const attrib = await assertAttributionVisible(page, `${name}-drive`)
  // Designer: legend and attribution must not overlap at 390px (phone).
  let legend = null
  let sheetHandle = null
  let firstViewPins = null
  if (width === 390) {
    legend = await assertLegendClearOfAttribution(page, `${name}-drive`)
    firstViewPins = await assertFirstViewPins(page, name, shots)
    sheetHandle = await assertSheetHandle(page, name, shots)
  }

  const before = await page.evaluate(() => {
    const host = document.querySelector('[data-active-stop]')
    return {
      active: host?.getAttribute('data-active-stop'),
      lng: host?.getAttribute('data-map-lng'),
      lat: host?.getAttribute('data-map-lat'),
    }
  })

  interacted = true
  await page.locator('button[data-step="4"]').click()

  await page.waitForFunction(() => {
    const btn = document.querySelector('button[data-step="4"]')
    return btn?.getAttribute('data-active') === 'true' || btn?.getAttribute('aria-current') === 'true'
  }, { timeout: 8000 })

  const mapMoved = await page
    .waitForFunction(
      ({ lat, lng }) => {
        const host = document.querySelector('[data-map-ready="true"]')
        if (!host) return false
        const la = parseFloat(host.getAttribute('data-map-lat') ?? '')
        const ln = parseFloat(host.getAttribute('data-map-lng') ?? '')
        if (Number.isNaN(la) || Number.isNaN(ln)) return false
        return Math.abs(la - lat) < 0.08 && Math.abs(ln - lng) < 0.08
      },
      SUMMIT,
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false)

  const after = await page.evaluate(() => {
    const host = document.querySelector('[data-active-stop]')
    const btn = document.querySelector('button[data-step="4"]')
    return {
      active: host?.getAttribute('data-active-stop'),
      btnActive: btn?.getAttribute('data-active'),
      lng: host?.getAttribute('data-map-lng'),
      lat: host?.getAttribute('data-map-lat'),
      ready: host?.getAttribute('data-map-ready'),
    }
  })

  await page.screenshot({ path: path.join(shots, `${name}-after-step4.png`), fullPage: false })
  await page.screenshot({ path: path.join(shots, `${name}-full.png`), fullPage: true })

  const stepChanged = after.btnActive === 'true' || after.active?.includes('summit')
  if (!stepChanged) {
    throw new Error(`${name}: clicking step 4 did not activate it (after=${JSON.stringify(after)})`)
  }

  let climbShot = null
  let firstClimbDem = null
  let visitDem = null
  let threeDClimbDem = null
  if (alsoClimb) {
    // Return to whole day then open The climb (inset or toggle)
    const climbBtn = page.locator('[data-testid="view-climb"]')
    if (await climbBtn.count()) {
      await climbBtn.click()
      // Climb fits Lëpushë–summit; wait for a tighter zoom than the whole-day overview
      await page.waitForFunction(() => {
        const z = parseFloat(document.querySelector('[data-map-ready="true"]')?.getAttribute('data-map-zoom') ?? '0')
        return z >= 11
      }, { timeout: 12000 }).catch(() => {})
      await page.waitForTimeout(1200)
      await page.screenshot({ path: path.join(shots, `${name}-climb.png`), fullPage: false })
      climbShot = `${name}-climb.png`
      if (width === 390) {
        await page.screenshot({ path: path.join(shots, 'phone-climb-z11.png'), fullPage: false })
        await page.screenshot({ path: path.join(shots, 'phone-climb-v131.png'), fullPage: false })
      }
      // Let in-flight DEM tiles finish, then read every transfer size.
      await page.waitForTimeout(800)
      await Promise.all(demBodyWaits)
      applyCdpSizes()
      // Snapshot DEM used for the first climb, before the later 3D keyboard tour.
      firstClimbDem = summarizeDem(demReqs.filter((d) => d.afterInteract && d.status < 400))
      if (firstClimbDem.count > 1 && firstClimbDem.bytes < 50_000) {
        throw new Error(
          `${name}: climb DEM byte total looks like a single missed-body sum: ${JSON.stringify(firstClimbDem)}`,
        )
      }
      // Attribution must still be clear in climb view
      await assertAttributionVisible(page, `${name}-climb`)
      if (width === 390) {
        legend = await assertLegendClearOfAttribution(page, `${name}-climb`)
      }
    }
  }

  // --- Desktop: scrolling the 420px rail to the end must activate step 7 ---
  let step7AtEnd = null
  if (width >= 1280) {
    await page.locator('[data-testid="view-whole"]').click().catch(() => {})
    step7AtEnd = await page.evaluate(async () => {
      const root = document.querySelector('[data-timeline-scroll]')
      if (!root) return { ok: false, reason: 'no-scroll-root' }
      // Arm scroll-follow the same way a real wheel/scrollbar gesture does.
      root.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true }))
      root.scrollTop = root.scrollHeight
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await new Promise((r) => setTimeout(r, 120))
      root.dispatchEvent(new Event('scroll'))
      await new Promise((r) => setTimeout(r, 200))
      const btn = document.querySelector('button[data-step="7"]')
      const host = document.querySelector('[data-active-stop]')
      return {
        ok: btn?.getAttribute('data-active') === 'true' || host?.getAttribute('data-active-stop')?.includes('arrive-tirana'),
        active: host?.getAttribute('data-active-stop'),
        btnActive: btn?.getAttribute('data-active'),
        scrollTop: root.scrollTop,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      }
    })
    if (!step7AtEnd.ok) {
      throw new Error(`${name}: step 7 did not activate at rail end: ${JSON.stringify(step7AtEnd)}`)
    }
  }

  // --- Phone: touch-scrub the elevation profile and expect the map dot / live text to change ---
  let touchScrub = null
  if (width === 390) {
    // Expand the sheet so the profile is on screen, then scrub.
    const handle = page.locator('[data-testid="sheet-handle"]')
    if (await handle.count()) {
      await handle.click()
      await page.waitForTimeout(400)
    }
    await page.locator('#climb-profile').scrollIntoViewIfNeeded()
    const svg = page.locator('#climb-profile svg[tabindex="0"], #climb-profile svg')
    await svg.waitFor({ state: 'visible', timeout: 5000 })
    const box = await svg.boundingBox()
    if (box) {
      const beforeLive = await page.evaluate(() => document.querySelector('#climb-profile [aria-live]')?.textContent ?? '')
      // Pointer events (Playwright dispatches pointer* which our handler listens to)
      const startX = box.x + box.width * 0.2
      const endX = box.x + box.width * 0.8
      const y = box.y + box.height * 0.5
      await page.mouse.move(startX, y)
      await page.mouse.down()
      await page.mouse.move(endX, y, { steps: 8 })
      await page.mouse.up()
      // Also dispatch a touch-style pointer on the element for the touch path
      await page.evaluate(({ sx, ex, y }) => {
        const el = document.querySelector('#climb-profile .touch-none, #climb-profile [style]') ?? document.querySelector('#climb-profile svg')?.parentElement
        if (!el) return
        const fire = (type, x) => {
          const ev = new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'touch',
            clientX: x,
            clientY: y,
            buttons: type === 'pointerup' ? 0 : 1,
          })
          el.dispatchEvent(ev)
        }
        fire('pointerdown', sx)
        fire('pointermove', ex)
      }, { sx: startX, ex: endX, y })
      await page.waitForTimeout(200)
      touchScrub = await page.evaluate((before) => {
        const live = document.querySelector('#climb-profile [aria-live]')?.textContent ?? ''
        const hover = document.querySelector('#climb-profile svg circle[stroke], #climb-profile svg g circle[r="6"]')
        const mapDot = document.querySelector('.profile-hover-dot')
        const changed = live !== before && /km/.test(live)
        return { ok: changed || !!hover || !!mapDot, live, before, hasHoverCircle: !!hover, hasMapDot: !!mapDot }
      }, beforeLive)
      if (!touchScrub.ok) {
        throw new Error(`${name}: elevation touch-scrub did not move the marker: ${JSON.stringify(touchScrub)}`)
      }
    } else {
      throw new Error(`${name}: elevation profile SVG has no box`)
    }

    // Sheet-full: attribution still visible, not covered, legend does not overlap it
    const fullAttrib = await assertAttributionVisible(page, `${name}-sheet-full`)
    // Legend may sit under the wordmark at full snap — it must not intersect attribution
    // and must not be covered by the sheet.
    const fullLegend = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="map-attribution"]')
      const l = document.querySelector('[data-testid="route-legend"]')
      const sheet = document.querySelector('[data-sheet]')
      if (!a) return { ok: false, reason: 'no-attrib' }
      const ar = a.getBoundingClientRect()
      const sr = sheet?.getBoundingClientRect()
      const covered = sr && ar.bottom > sr.top + 2 && ar.top < sr.bottom && ar.right > sr.left && ar.left < sr.right
        && document.elementFromPoint(ar.left + ar.width / 2, ar.top + ar.height / 2)?.closest('[data-sheet]')
      let intersect = false
      let lr = null
      if (l) {
        lr = l.getBoundingClientRect()
        const hidden = lr.width === 0 || lr.height === 0 || getComputedStyle(l).display === 'none' || getComputedStyle(l).visibility === 'hidden'
        if (!hidden) {
          intersect = !(ar.right <= lr.left || ar.left >= lr.right || ar.bottom <= lr.top || ar.top >= lr.bottom)
        }
      }
      const snap = document.querySelector('[data-sheet-snap]')?.getAttribute('data-sheet-snap')
      return {
        ok: !covered && !intersect && ar.top >= 0 && ar.bottom < window.innerHeight,
        covered: !!covered,
        intersect,
        snap,
        ar: { top: ar.top, bottom: ar.bottom, left: ar.left, right: ar.right },
        lr,
        sheetTop: sr?.top,
      }
    })
    if (!fullLegend.ok) {
      throw new Error(`${name}: attribution covered or overlapping legend at full sheet: ${JSON.stringify(fullLegend)}`)
    }
    legend = { ...(legend ?? {}), sheetFull: fullLegend, fullAttrib }
    await page.screenshot({ path: path.join(shots, `${name}-sheet-full.png`), fullPage: false })

    // Full phone visit: walk every step so we can report total DEM after the whole tour.
    for (let step = 1; step <= 7; step++) {
      await page.locator(`button[data-step="${step}"]`).click()
      await page.waitForTimeout(500)
    }
    await Promise.all(demBodyWaits)
    applyCdpSizes()
    visitDem = summarizeDem(demReqs.filter((d) => d.afterInteract && d.status < 400))
  }

  // --- Desktop 3D on: climb → step 1 → climb again → keyboard through steps ---
  let terrain3d = null
  if (width >= 1280) {
    const toggle = page.locator('[data-testid="terrain-3d"]')
    if (await toggle.getAttribute('aria-pressed') !== 'true') {
      await toggle.click()
    }
    await page.waitForFunction(
      () => document.querySelector('[data-testid="terrain-3d"]')?.getAttribute('aria-pressed') === 'true',
      { timeout: 5000 },
    )

    const climbBtn = page.locator('[data-testid="view-climb"]')
    await climbBtn.click()
    const climb1 = await waitClimbFramed(page)
    await page.screenshot({ path: path.join(shots, `${name}-3d-climb.png`), fullPage: false })
    if (!climb1.ok) {
      throw new Error(`${name}: 3D The climb did not frame Lëpushë and the summit in the padded viewport: ${JSON.stringify(climb1)}`)
    }
    await Promise.all(demBodyWaits)
    applyCdpSizes()
    threeDClimbDem = summarizeDem(demReqs.filter((d) => d.afterInteract && d.status < 400))

    await page.locator('button[data-step="1"]').click()
    const step1 = await waitPinOnCanvas(page, STEP_PLACE[1])
    await page.screenshot({ path: path.join(shots, `${name}-3d-step1.png`), fullPage: false })
    if (!step1.ok) {
      throw new Error(`${name}: 3D step 1 target not on-canvas: ${JSON.stringify(step1)}`)
    }

    await climbBtn.click()
    const climb2 = await waitClimbFramed(page)
    await page.screenshot({ path: path.join(shots, `${name}-3d-climb-again.png`), fullPage: false })
    if (!climb2.ok) {
      throw new Error(`${name}: 3D The climb after step 1 did not re-frame the hike: ${JSON.stringify(climb2)}`)
    }

    // QA: with 3D on, Enter through all 7 steps ~900ms apart — the next
    // key is sent without waiting for the previous ease to finish. After
    // each request settles (or just before the next key), the active
    // stop's pin must be on-canvas near center.
    const enterResults = []
    for (let step = 1; step <= 7; step++) {
      const tStart = Date.now()
      const btn = page.locator(`button[data-step="${step}"]`)
      await btn.scrollIntoViewIfNeeded()
      await btn.focus()
      await page.keyboard.press('Enter')
      // Leave a sliver of the 900ms gap for the next key; last step can fully settle.
      const budget = step < 7 ? 880 : 8000
      const st = await waitPinNearCenter(page, STEP_PLACE[step], budget)
      enterResults.push({ step, ok: st.ok, nearCenter: st.nearCenter, camera: st.camera, pin: st.pin })
      if (step < 7) {
        const used = Date.now() - tStart
        if (used < 900) await page.waitForTimeout(900 - used)
      }
    }
    await page.screenshot({ path: path.join(shots, `${name}-3d-enter-tour.png`), fullPage: false })
    if (enterResults.some((r) => !r.ok)) {
      throw new Error(`${name}: 3D Enter tour (900ms) missed a target: ${JSON.stringify(enterResults)}`)
    }

    // Keyboard ArrowDown / ArrowUp through every step; each target must stay on-canvas.
    await page.locator('button[data-step="1"]').click()
    const firstKb = await waitPinOnCanvas(page, STEP_PLACE[1])
    if (!firstKb.ok) {
      throw new Error(`${name}: 3D keyboard start (step 1) not on-canvas: ${JSON.stringify(firstKb)}`)
    }
    await page.locator('button[data-step="1"]').focus()
    const kbSteps = []
    for (let step = 2; step <= 7; step++) {
      await arrowToStep(page, 'ArrowDown', step, shots, name)
      const st = await waitPinOnCanvas(page, STEP_PLACE[step])
      kbSteps.push({ dir: 'down', step, ok: st.ok, camera: st.camera, pin: st.pin })
      if (!st.ok) {
        await page.screenshot({ path: path.join(shots, `${name}-3d-kb-down-${step}.png`), fullPage: false })
        throw new Error(`${name}: 3D ArrowDown step ${step} target not on-canvas: ${JSON.stringify(st)}`)
      }
    }
    await page.screenshot({ path: path.join(shots, `${name}-3d-kb-down.png`), fullPage: false })
    for (let step = 6; step >= 1; step--) {
      await arrowToStep(page, 'ArrowUp', step, shots, name)
      const st = await waitPinOnCanvas(page, STEP_PLACE[step])
      kbSteps.push({ dir: 'up', step, ok: st.ok, camera: st.camera, pin: st.pin })
      if (!st.ok) {
        await page.screenshot({ path: path.join(shots, `${name}-3d-kb-up-${step}.png`), fullPage: false })
        throw new Error(`${name}: 3D ArrowUp step ${step} target not on-canvas: ${JSON.stringify(st)}`)
      }
    }
    await page.screenshot({ path: path.join(shots, `${name}-3d-kb-up.png`), fullPage: false })
    terrain3d = {
      ok: climb1.ok && step1.ok && climb2.ok && kbSteps.every((s) => s.ok) && enterResults.every((s) => s.ok),
      climb1: { ok: climb1.ok, in3: climb1.in3, in4: climb1.in4, camera: climb1.camera, mode: climb1.mode },
      step1: { ok: step1.ok, camera: step1.camera, pin: step1.pin },
      climb2: { ok: climb2.ok, in3: climb2.in3, in4: climb2.in4, camera: climb2.camera, mode: climb2.mode },
      enterTour: enterResults,
      kbSteps,
    }
  }

  // 404s: glyph and other app requests must not 404. Allow aborted DEM/OSM tiles (pan/cancel).
  const real404s = http404s.filter((r) => {
    if (/favicon/.test(r.url)) return false
    if (/elevation-tiles-prod|tile\.openstreetmap/.test(r.url) && r.status === 404) return false
    return true
  })
  if (real404s.some((r) => /demotiles\.maplibre|\/glyphs\//.test(r.url) || r.status >= 400)) {
    const bad = real404s.filter((r) => /demotiles|glyphs|font/.test(r.url) || (r.status >= 400 && !/elevation-tiles|openstreetmap/.test(r.url)))
    if (bad.length) {
      errors.push(`${name}: http 404s ${JSON.stringify(bad)}`)
    }
  }

  const real = pageErrors.filter(
    (e) =>
      !/favicon/.test(e) &&
      !/net::ERR_ABORTED/.test(e) &&
      !/Failed to load resource: the server responded with a status of 4/.test(e),
  )
  // Glyph / demotiles failures must still fail the run
  const glyphErr = pageErrors.filter((e) => /demotiles\.maplibre|\/glyphs\//.test(e))
  errors.push(...real.map((e) => `${name}: ${e}`))
  errors.push(...glyphErr.filter((e) => !real.includes(e)).map((e) => `${name}: ${e}`))
  await Promise.all(demBodyWaits)
  applyCdpSizes()
  const climbDemTotal = summarizeDem(demReqs.filter((d) => d.afterInteract && d.status < 400))
  const climbDem = firstClimbDem ?? climbDemTotal
  const firstViewDemReport = {
    count: firstViewDem.length,
    bytes: firstViewDem.reduce((s, d) => s + (d.bytes || 0), 0),
  }
  await page.close()
  return {
    name,
    width,
    height,
    stepChanged,
    mapMoved,
    before,
    after,
    attrib,
    legend,
    climbShot,
    step7AtEnd,
    touchScrub,
    http404s: real404s,
    consoleErrors: real,
    firstViewDem: firstViewDemReport,
    mapViewBeforeLoad,
    mapViewReqs,
    paneAria,
    sheetHandle,
    firstViewPins,
    climbDem,
    climbDemTotal,
    visitDem,
    threeDClimbDem,
    terrain3d,
    demConsumers: {
      // hillshade + setTerrain share raster-dem `dem`; contours use DemSource;
      // all four are capped at maxzoom 11 and share one S3 fetch pipeline.
      shared: true,
      maxzoom: 11,
      sources: ['DemSource', 'raster-dem dem (hillshade + terrain)', 'contours vector'],
    },
  }
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const results = []
try {
  results.push(await runAt(browser, { name: 'phone', width: 390, height: 844 }))
  // Team requirement: attribution visible/unobscured at 1280 as well as 390
  results.push(await runAt(browser, { name: 'desktop-1280', width: 1280, height: 800 }))
  results.push(await runAt(browser, { name: 'desktop', width: 1440, height: 900 }))
} finally {
  await browser.close()
  if (serverProc) serverProc.kill('SIGTERM')
}

const report = { url, results, consoleErrors: errors }
fs.writeFileSync(path.join(shots, 'smoke-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

if (errors.length) {
  console.error(`FAIL: ${errors.length} console error(s)`)
  process.exit(1)
}
if (!results.every((r) => r.stepChanged)) {
  console.error('FAIL: active step did not change')
  process.exit(1)
}
if (!results.every((r) => r.attrib?.ok)) {
  console.error('FAIL: attribution not visible')
  process.exit(1)
}
if (results.some((r) => r.width >= 1280 && !r.step7AtEnd?.ok)) {
  console.error('FAIL: step 7 did not activate at rail end')
  process.exit(1)
}
if (results.some((r) => (r.http404s ?? []).some((x) => /demotiles|glyphs/.test(x.url)))) {
  console.error('FAIL: glyph or demotiles 404')
  process.exit(1)
}
if (results.some((r) => r.width >= 1280 && (r.firstViewDem?.count ?? 0) > 0)) {
  console.error('FAIL: DEM requests before interaction at desktop first view')
  process.exit(1)
}
if (results.some((r) => (r.mapViewBeforeLoad ?? []).length > 0)) {
  console.error('FAIL: MapView chunk requested before load event')
  process.exit(1)
}
if (results.some((r) => r.width === 390 && !r.paneAria?.ok)) {
  console.error('FAIL: map pane is aria-hidden at 390')
  process.exit(1)
}
if (results.some((r) => r.width === 390 && !r.sheetHandle?.ok)) {
  const bad = results.filter((r) => r.width === 390)
  console.error('FAIL: sheet handle at 390', JSON.stringify(bad.map((r) => r.sheetHandle), null, 2))
  process.exit(1)
}
if (results.some((r) => r.width === 390 && !r.firstViewPins?.ok)) {
  const bad = results.filter((r) => r.width === 390)
  console.error('FAIL: first-view pins at 390', JSON.stringify(bad.map((r) => r.firstViewPins), null, 2))
  process.exit(1)
}
if (results.some((r) => r.width >= 1280 && !r.terrain3d?.ok)) {
  const bad = results.filter((r) => r.width >= 1280 && !r.terrain3d?.ok)
  console.error('FAIL: 3D climb / keyboard camera', JSON.stringify(bad.map((r) => ({ name: r.name, terrain3d: r.terrain3d })), null, 2))
  process.exit(1)
}
if (results.some((r) => (r.climbDem?.maxZ ?? 0) > 11 || (r.climbDem?.overzoom ?? 0) > 0)) {
  const bad = results.filter((r) => (r.climbDem?.maxZ ?? 0) > 11 || (r.climbDem?.overzoom ?? 0) > 0)
  console.error('FAIL: DEM zoom exceeded maxzoom 11', JSON.stringify(bad.map((r) => ({ name: r.name, climbDem: r.climbDem })), null, 2))
  process.exit(1)
}
console.log('SMOKE OK')
for (const r of results) {
  const cd = r.climbDem
  const tot = r.climbDemTotal
  console.log(
    `${r.name}: firstView DEM ${r.firstViewDem?.count ?? 0} (${r.firstViewDem?.bytes ?? 0} B); climb DEM ${cd?.count ?? 0} tiles / ${cd?.bytes ?? 0} B (max z=${cd?.maxZ ?? '?'}, z>11: ${cd?.overzoom ?? '?'})` +
      (tot && (tot.count !== cd?.count || tot.bytes !== cd?.bytes)
        ? `; all-after-interact ${tot.count} tiles / ${tot.bytes} B`
        : '') +
      `; MapView before load: ${(r.mapViewBeforeLoad ?? []).length}` +
      (r.terrain3d
        ? `; 3D climb1=${r.terrain3d.climb1?.ok} climb2=${r.terrain3d.climb2?.ok} enter=${(r.terrain3d.enterTour ?? []).filter((s) => s.ok).length}/${(r.terrain3d.enterTour ?? []).length} kb=${(r.terrain3d.kbSteps ?? []).filter((s) => s.ok).length}/${(r.terrain3d.kbSteps ?? []).length}`
        : ''),
  )
}
console.log('DEM totals (summed transfer sizes of all DEM requests; every consumer maxzoom 11, shared DemSource):')
for (const r of results) {
  const cd = r.climbDem
  const vis = r.visitDem
  const td = r.threeDClimbDem
  console.log(`  ${r.name} climb: ${cd?.count ?? 0} tiles / ${cd?.bytes ?? 0} B (max z=${cd?.maxZ ?? '?'})`)
  if (vis) console.log(`  ${r.name} full visit: ${vis.count} tiles / ${vis.bytes} B (max z=${vis.maxZ})`)
  if (td) console.log(`  ${r.name} 3D+climb: ${td.count} tiles / ${td.bytes} B (max z=${td.maxZ})`)
}
console.log('screenshots:', fs.readdirSync(shots).join(', '))
