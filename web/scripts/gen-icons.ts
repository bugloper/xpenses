// Generates the PWA icons (PNG) without any image library: draws the ledger
// mark (ink square, paper X, saffron corner tick) into an RGBA buffer and encodes it as PNG
// using node:zlib. Run with `bun run scripts/gen-icons.ts`.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(import.meta.dir, '..', 'public', 'icons')
mkdirSync(OUT, { recursive: true })

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, data.length)
  const typeBytes = new TextEncoder().encode(type)
  const crcInput = new Uint8Array(typeBytes.length + data.length)
  crcInput.set(typeBytes)
  crcInput.set(data, typeBytes.length)
  const crc = new Uint8Array(4)
  new DataView(crc.buffer).setUint32(0, crc32(crcInput))
  const out = new Uint8Array(4 + crcInput.length + 4)
  out.set(len)
  out.set(crcInput, 4)
  out.set(crc, 4 + crcInput.length)
  return out
}
function encodePNG(size: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1)
  }
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, size)
  dv.setUint32(4, size)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const parts = [
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array()),
  ]
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

// The ledger mark: an ink square, a paper X, and a saffron tick in the corner.
const INK = [30, 41, 37] // #1e2925
const PAPER = [244, 240, 232] // #f4f0e8
const SAFFRON = [242, 169, 59] // #f2a93b

function draw(size: number, maskable: boolean): Uint8Array {
  const px = new Uint8Array(size * size * 4)
  // Maskable icons fill the canvas and keep the glyph inside the safe zone.
  const pad = maskable ? 0 : Math.round(size * 0.06)
  const radius = maskable ? 0 : Math.round(size * 0.2)
  const inner = size - pad * 2
  const cx = size / 2
  const cy = size / 2
  const k = maskable ? 0.78 : 1 // glyph scale
  const stroke = Math.max(2, Math.round(size * 0.075 * k))
  const half = size * 0.2 * k
  const tick = Math.max(2, Math.round(size * 0.065 * k))
  const t0 = size * 0.2 * k // where the tick's arms start, from the centre
  const t1 = size * 0.32 * k // the tick's corner
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      let color = maskable ? INK : [0, 0, 0]
      let alpha = maskable ? 255 : 0
      const lx = x - pad
      const ly = y - pad
      if (!maskable && lx >= 0 && ly >= 0 && lx < inner && ly < inner) {
        const dx = Math.max(radius - lx, 0, lx - (inner - 1 - radius))
        const dy = Math.max(radius - ly, 0, ly - (inner - 1 - radius))
        if (dx * dx + dy * dy <= radius * radius) {
          color = INK
          alpha = 255
        }
      }
      if (alpha === 255) {
        const rx = x - cx + 0.5
        const ry = y - cy + 0.5
        const onDiag1 = Math.abs(rx - ry) <= stroke / 1.414 && Math.abs(rx) <= half && Math.abs(ry) <= half
        const onDiag2 = Math.abs(rx + ry) <= stroke / 1.414 && Math.abs(rx) <= half && Math.abs(ry) <= half
        if (onDiag1 || onDiag2) color = PAPER
        const horiz = Math.abs(ry - t1) <= tick / 2 && rx >= t0 && rx <= t1 + tick / 2
        const vert = Math.abs(rx - t1) <= tick / 2 && ry >= t0 && ry <= t1 + tick / 2
        if (horiz || vert) color = SAFFRON
      }
      px[i] = color[0]!
      px[i + 1] = color[1]!
      px[i + 2] = color[2]!
      px[i + 3] = alpha
    }
  }
  return px
}

for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), encodePNG(size, draw(size, false)))
  writeFileSync(join(OUT, `icon-maskable-${size}.png`), encodePNG(size, draw(size, true)))
}
writeFileSync(join(OUT, '..', 'apple-touch-icon.png'), encodePNG(180, draw(180, true)))
console.log('icons written to', OUT)
