// Tiny production-like static server for dist/ (no dependencies).
// Gzips text assets like a real host/CDN would.
// /route -> dist/route/index.html if prerendered, else dist/200.html (SPA shell).
// Usage: node scripts/serve-prod.mjs [port]   (default 4174, binds 0.0.0.0)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const root = path.resolve(process.cwd(), process.env.DIST ?? 'dist')
const port = Number(process.argv[2] ?? process.env.PORT ?? 4174)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.pbf': 'application/x-protobuf',
}

function resolve(urlPath) {
  let p
  try {
    p = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const f = path.join(root, path.normalize(p))
  if (!f.startsWith(root)) return null
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return f
  const idx = path.join(f, 'index.html')
  if (fs.existsSync(idx)) return idx
  if (path.extname(p)) return null
  const spa = path.join(root, '200.html')
  if (fs.existsSync(spa)) return spa
  return path.join(root, 'index.html')
}

const server = http.createServer((req, res) => {
  const file = resolve((req.url ?? '/').split('?')[0])
  if (!file || !fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    return res.end('Not found')
  }
  const ext = path.extname(file)
  const gzip = /\.(html|js|css|svg|xml|txt|json)$/.test(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
  res.writeHead(200, {
    ...(gzip ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}),
    'content-type': types[ext] ?? 'application/octet-stream',
    'cache-control': file.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  })
  const stream = fs.createReadStream(file)
  ;(gzip ? stream.pipe(zlib.createGzip()) : stream).pipe(res)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`serve:prod http://0.0.0.0:${port} (root ${root})`)
})
