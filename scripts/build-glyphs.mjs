/**
 * Generate MapLibre SDF glyph PBFs for Source Sans 3 (latin + latin-ext)
 * from the @fontsource files, using fontnik's build-glyphs.
 *
 * Usage (from repo root, fontnik available — e.g. npm install -g fontnik,
 * or npm install fontnik in a scratch dir):
 *   FONTNIK_BIN=/path/to/build-glyphs node scripts/build-glyphs.mjs
 *
 * Output: public/glyphs/Source Sans 3 SemiBold/{range}.pbf
 * These files are committed so `npm run build` does not need fontnik.
 */
import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'public/glyphs/Source Sans 3 SemiBold')
const tmp = path.join(root, '.glyphs-tmp')

const bin =
  process.env.FONTNIK_BIN ||
  execSync('command -v build-glyphs || true', { encoding: 'utf8' }).trim()
if (!bin) {
  console.error('build-glyphs not found. Install fontnik and re-run, or set FONTNIK_BIN.')
  process.exit(1)
}

fs.rmSync(tmp, { recursive: true, force: true })
fs.mkdirSync(tmp, { recursive: true })
fs.mkdirSync(outDir, { recursive: true })

const py = `
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.merge import Merger

src = Path(${JSON.stringify(path.join(root, 'node_modules/@fontsource/source-sans-3/files'))})
tmp = Path(${JSON.stringify(tmp)})
a = tmp / 'lat.ttf'
b = tmp / 'ext.ttf'
for subset, dest in [('latin', a), ('latin-ext', b)]:
    f = TTFont(str(src / f'source-sans-3-{subset}-600-normal.woff2'))
    f.flavor = None
    f.save(str(dest))
merged = Merger().merge([str(a), str(b)])
name = merged['name']
def write(nid, s):
    name.setName(s, nid, 3, 1, 0x409)
    name.setName(s, nid, 1, 0, 0)
write(1, 'Source Sans 3')
write(2, 'SemiBold')
write(4, 'Source Sans 3 SemiBold')
write(6, 'SourceSans3-SemiBold')
write(16, 'Source Sans 3')
write(17, 'SemiBold')
dest = tmp / 'SourceSans3-SemiBold.ttf'
merged.save(str(dest))
print(dest)
`
const ttf = execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim()
execFileSync(bin, [ttf, outDir], { stdio: 'inherit' })
fs.rmSync(tmp, { recursive: true, force: true })
const n = fs.readdirSync(outDir).filter((f) => f.endsWith('.pbf')).length
console.log(`wrote ${n} ranges to ${outDir}`)
