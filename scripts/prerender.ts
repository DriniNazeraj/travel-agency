import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const dist = path.resolve('dist')
const ssrPath = path.resolve('dist-ssr/entry-server.js')
const mod = (await import(pathToFileURL(ssrPath).href)) as {
  render: (url: string) => Promise<{ html: string; head: string }>
}

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')

function frauncesPreload(): string {
  const assets = path.join(dist, 'assets')
  if (!fs.existsSync(assets)) throw new Error('dist/assets missing')
  const files = fs.readdirSync(assets)
  const cssFiles = files.filter((f) => f.endsWith('.css'))
  for (const c of cssFiles) {
    const css = fs.readFileSync(path.join(assets, c), 'utf8')
    // Only the Fraunces 600 latin file — not latin-ext, not Source Sans.
    const m = css.match(/url\(([^)]*fraunces-latin-600-normal[^)]*\.woff2)\)/)
    if (m) {
      let href = m[1].replace(/['"]/g, '')
      if (href.startsWith('./')) href = '/assets/' + href.slice(2)
      else if (!href.startsWith('/') && !href.startsWith('http')) href = '/assets/' + path.basename(href)
      return `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin />`
    }
  }
  const font = files.find((f) => /fraunces-latin-600-normal.*\.woff2$/.test(f))
  if (font) {
    return `<link rel="preload" href="/assets/${font}" as="font" type="font/woff2" crossorigin />`
  }
  throw new Error('Fraunces 600 latin woff2 not found in dist — cannot inject preload')
}

const fontPreload = frauncesPreload()
console.log('font preload:', fontPreload)

const routes = ['/', '/trips/lepushe-maja-e-vajushes']

for (const r of routes) {
  const { html, head } = await mod.render(r)
  const out = template
    .replace('<!--font-preload-->', fontPreload)
    .replace(/<title>.*?<\/title>/, '')
    .replace('<!--head-->', head)
    .replace('<!--app-->', html)
  const file = path.join(dist, r === '/' ? 'index.html' : `${r.slice(1)}/index.html`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, out)
  console.log('prerendered', r, '→', path.relative(process.cwd(), file))
}

// SPA shell for unknown routes (keeps the font preload so a client nav still has the display face)
const shell = template.replace('<!--font-preload-->', fontPreload).replace('<!--head-->', '').replace('<!--app-->', '')
fs.writeFileSync(path.join(dist, '200.html'), shell)

fs.writeFileSync(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://[PH-domain]/trips/lepushe-maja-e-vajushes</loc></url>
</urlset>
`,
)

const robots = path.join(dist, 'robots.txt')
if (fs.existsSync(robots)) {
  const cur = fs.readFileSync(robots, 'utf8')
  if (!cur.includes('Sitemap:')) {
    fs.appendFileSync(robots, 'Sitemap: https://[PH-domain]/sitemap.xml\n')
  }
}

// Manifest is only needed at build time
fs.rmSync(path.join(dist, '.vite'), { recursive: true, force: true })
fs.rmSync('dist-ssr', { recursive: true, force: true })
console.log('prerender done')
