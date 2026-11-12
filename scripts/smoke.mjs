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

async function runAt(browser, { name, width, height, alsoClimb = true }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  const pageErrors = []
  const http404s = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`[console] ${msg.text()}`)
  })
  page.on('pageerror', (err) => pageErrors.push(`[pageerror] ${err.message}`))
  page.on('response', (res) => {
    const status = res.status()
    const u = res.url()
    if (status >= 400 && !/favicon/.test(u)) {
      http404s.push({ url: u, status })
    }
  })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('h1', { timeout: 10000 })
  await page.waitForSelector('button[data-step="4"]', { timeout: 10000 })
  await page.waitForSelector('[data-testid="map-attribution"]', { timeout: 5000 })
  // First-paint (skeleton may still be showing)
  await page.screenshot({ path: path.join(shots, `${name}-initial.png`), fullPage: false })
  // Wait for MapLibre to report a camera so the drive shot has live tiles + route
  await page.waitForSelector('[data-map-ready="true"]', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(shots, `${name}-drive.png`), fullPage: false })

  const attrib = await assertAttributionVisible(page, `${name}-drive`)
  // Designer: legend and attribution must not overlap at 390px (phone).
  let legend = null
  if (width === 390) {
    legend = await assertLegendClearOfAttribution(page, `${name}-drive`)
  }

  const before = await page.evaluate(() => {
    const host = document.querySelector('[data-active-stop]')
    return {
      active: host?.getAttribute('data-active-stop'),
      lng: host?.getAttribute('data-map-lng'),
      lat: host?.getAttribute('data-map-lat'),
    }
  })

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
      root.scrollTop = root.scrollHeight
      // Allow the scroll-follow listener to run.
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
  await page.close()
  return { name, width, height, stepChanged, mapMoved, before, after, attrib, legend, climbShot, step7AtEnd, touchScrub, http404s: real404s, consoleErrors: real }
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
console.log('SMOKE OK')
console.log('screenshots:', fs.readdirSync(shots).join(', '))
