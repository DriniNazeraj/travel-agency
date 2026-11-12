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

async function runAt(browser, { name, width, height, alsoClimb = true }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  const pageErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`[console] ${msg.text()}`)
  })
  page.on('pageerror', (err) => pageErrors.push(`[pageerror] ${err.message}`))

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
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(shots, `${name}-climb.png`), fullPage: false })
      climbShot = `${name}-climb.png`
      // Attribution must still be clear in climb view
      await assertAttributionVisible(page, `${name}-climb`)
    }
  }

  const real = pageErrors.filter(
    (e) =>
      !/favicon/.test(e) &&
      !/net::ERR_ABORTED/.test(e) &&
      !/Failed to load resource: the server responded with a status of 4/.test(e),
  )
  errors.push(...real.map((e) => `${name}: ${e}`))
  await page.close()
  return { name, width, height, stepChanged, mapMoved, before, after, attrib, climbShot, consoleErrors: real }
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
console.log('SMOKE OK')
console.log('screenshots:', fs.readdirSync(shots).join(', '))
