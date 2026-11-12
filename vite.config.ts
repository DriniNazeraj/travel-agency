import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'

/** Preview mimics static hosting: /x -> dist/x/index.html if prerendered, else the SPA shell. */
function prerenderedPreview(): Plugin {
  return {
    name: 'prerendered-preview',
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [p, q = ''] = (req.url ?? '/').split('?')
        if (path.extname(p)) return next()
        const dir = path.resolve('dist', '.' + p)
        const file = path.join(dir, 'index.html')
        if (fs.existsSync(file)) req.url = path.posix.join(p, 'index.html') + (q ? '?' + q : '')
        else req.url = '/200.html' + (q ? '?' + q : '')
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), prerenderedPreview()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  preview: { host: '0.0.0.0', port: 4174 },
  server: { host: '0.0.0.0', port: 5174 },
  build: {
    manifest: true,
    chunkSizeWarningLimit: 900,
    // Do not put maplibre in a manualChunk: that pulled Vite's CJS interop
    // helper into the maplibre file, so the entry statically imported (and
    // modulepreloaded) the 1 MB library. MapLibre + its CSS load only from
    // the lazy MapView chunk.
    modulePreload: {
      resolveDependencies(filename, deps) {
        return deps.filter((d) => !/maplibre/i.test(d))
      },
    },
  },
  ssr: {
    noExternal: ['@fontsource/fraunces', '@fontsource/source-sans-3'],
    external: ['maplibre-gl', 'maplibre-contour'],
  },
})
