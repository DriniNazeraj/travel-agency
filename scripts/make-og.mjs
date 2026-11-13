/**
 * 1200×630 OG card: cream ground, clay route, trip title, date, 3000 L, [PH] company.
 * No photos of people. Uses Chromium to paint Fraunces / Source Sans if they are installed,
 * otherwise system fonts.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const site = path.resolve(__dirname, '..')
const out = path.join(site, 'public', 'og-image.png')

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<style>
  @font-face { font-family: Fraunces; src: url(${JSON.stringify(
    path.join(site, 'node_modules/@fontsource/fraunces/files/fraunces-latin-600-normal.woff2'),
  )}) format('woff2'); font-weight: 600; font-style: normal; font-display: block; }
  @font-face { font-family: 'Source Sans 3'; src: url(${JSON.stringify(
    path.join(site, 'node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-600-normal.woff2'),
  )}) format('woff2'); font-weight: 600; font-style: normal; font-display: block; }
  @font-face { font-family: 'Source Sans 3'; src: url(${JSON.stringify(
    path.join(site, 'node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff2'),
  )}) format('woff2'); font-weight: 400; font-style: normal; font-display: block; }
  html, body { margin: 0; width: 1200px; height: 630px; background: #F8F4EC; }
  body { font-family: 'Source Sans 3', system-ui, sans-serif; color: #1B1914; }
  .wrap { position: relative; width: 1200px; height: 630px; overflow: hidden; background: #F8F4EC; }
  .ground { position: absolute; inset: 0; background:
    radial-gradient(1200px 500px at 70% -10%, #E4EDE4, transparent 60%),
    linear-gradient(180deg, #F8F4EC 0%, #EDE6D9 100%); }
  svg.route { position: absolute; right: 40px; top: 60px; }
  .brand { position: absolute; top: 48px; left: 72px; font-weight: 600; letter-spacing: 0.08em; font-size: 18px; color: #5E574C; text-transform: uppercase; }
  .ph { display: inline-block; border: 1px dashed #A8441E; color: #A8441E; border-radius: 999px; padding: 2px 10px; letter-spacing: 0.08em; }
  h1 { position: absolute; left: 72px; top: 160px; margin: 0; font-family: Fraunces, Georgia, serif; font-weight: 600; font-size: 72px; line-height: 1.05; letter-spacing: -0.02em; max-width: 680px; }
  .meta { position: absolute; left: 72px; bottom: 72px; display: flex; gap: 18px; align-items: center; font-size: 26px; font-weight: 600; }
  .price { color: #A8441E; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #C9B896; }
</style>
<body>
  <div class="wrap">
    <div class="ground"></div>
    <svg class="route" width="420" height="500" viewBox="0 0 200 280" fill="none">
      <path d="M110 250 C 90 200, 70 160, 80 120 C 90 80, 130 55, 150 40" stroke="#A8441E" stroke-width="6" stroke-linecap="round"/>
      <circle cx="110" cy="250" r="11" fill="#1F3D32" stroke="#F8F4EC" stroke-width="3"/>
      <circle cx="80" cy="120" r="11" fill="#1F3D32" stroke="#F8F4EC" stroke-width="3"/>
      <circle cx="150" cy="40" r="13" fill="#A8441E" stroke="#F8F4EC" stroke-width="3"/>
    </svg>
    <div class="brand"><span class="ph">[PH]</span> company</div>
    <h1>Lëpushë to<br/>Maja e Vajushës</h1>
    <div class="meta">
      <span>Sunday 15 Nov 2026</span>
      <span class="dot"></span>
      <span class="price">3000 L</span>
      <span class="dot"></span>
      <span>5–6 h · Medium</span>
    </div>
  </div>
</body>
</html>`

const tmp = path.join(site, '.og.html')
fs.writeFileSync(tmp, html)
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.goto('file://' + tmp, { waitUntil: 'networkidle' })
await page.waitForTimeout(200)
await page.screenshot({ path: out, type: 'png' })
await browser.close()
fs.unlinkSync(tmp)
console.log('wrote', out, fs.statSync(out).size, 'bytes')
