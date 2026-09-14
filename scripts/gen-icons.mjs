/**
 * Rasterize the app icon into the PNG sizes the PWA manifest and iOS need.
 * Run: node scripts/gen-icons.mjs
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, 'icon-source.svg')
const outDir = resolve(here, '..', 'public')
mkdirSync(outDir, { recursive: true })

const green = { r: 30, g: 90, b: 67, alpha: 1 } // #1E5A43

const targets = [
  { name: 'pwa-192x192.png', size: 192, bg: green },
  { name: 'pwa-512x512.png', size: 512, bg: green },
  // Maskable: same art, extra padding so nothing important is clipped inside
  // the platform's safe zone. Background bleeds to the edges.
  { name: 'maskable-512x512.png', size: 512, bg: green, pad: 0.14 },
  // iOS home screen (opaque, iOS rounds the corners itself).
  { name: 'apple-touch-icon.png', size: 180, bg: green },
  { name: 'favicon-32x32.png', size: 32, bg: green },
]

for (const t of targets) {
  const inner = t.pad ? Math.round(t.size * (1 - t.pad * 2)) : t.size
  const art = await sharp(src).resize(inner, inner).png().toBuffer()
  let img = sharp({
    create: { width: t.size, height: t.size, channels: 4, background: t.bg },
  }).composite([{ input: art, gravity: 'center' }])
  await img.png().toFile(resolve(outDir, t.name))
  console.log('wrote', t.name)
}
console.log('done')
