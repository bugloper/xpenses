// Generates the PWA icons (PNG) without any image library: draws a rounded
// green square with a white "X" glyph into an RGBA buffer and encodes it as PNG
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

const BG = [11, 15, 14] // #0b0f0e
const GREEN = [34, 197, 94] // #22c55e
const WHITE = [255, 255, 255]

function draw(size: number, maskable: boolean): Uint8Array {
  const px = new Uint8Array(size * size * 4)
  // Maskable icons need the safe zone: fill the whole canvas with the brand green.
  const pad = maskable ? 0 : Math.round(size * 0.08)
  const radius = maskable ? 0 : Math.round(size * 0.22)
  const inner = size - pad * 2
  const cx = size / 2
  const cy = size / 2
  const stroke = Math.max(2, Math.round(size * 0.085))
  const half = size * (maskable ? 0.2 : 0.24)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      let color = maskable ? GREEN : [0, 0, 0]
      let alpha = maskable ? 255 : 0
      // rounded square
      const lx = x - pad
      const ly = y - pad
      if (!maskable && lx >= 0 && ly >= 0 && lx < inner && ly < inner) {
        const dx = Math.max(radius - lx, 0, lx - (inner - 1 - radius))
        const dy = Math.max(radius - ly, 0, ly - (inner - 1 - radius))
        if (dx * dx + dy * dy <= radius * radius) {
          color = GREEN
          alpha = 255
        }
      }
      // "X" glyph: two diagonal bars, plus a small dark dot at the centre-right (a hint of "expense")
      if (alpha === 255) {
        const rx = x - cx
        const ry = y - cy
        const onDiag1 = Math.abs(rx - ry) <= stroke / 2 && Math.abs(rx) <= half && Math.abs(ry) <= half
        const onDiag2 = Math.abs(rx + ry) <= stroke / 2 && Math.abs(rx) <= half && Math.abs(ry) <= half
        if (onDiag1 || onDiag2) color = WHITE
        const dotR = size * 0.045
        const ddx = rx - half * 1.15
        const ddy = ry - half * 1.15
        if (ddx * ddx + ddy * ddy <= dotR * dotR) color = BG
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
