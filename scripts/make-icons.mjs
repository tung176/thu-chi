// Tạo biểu tượng app (PNG) không cần thư viện ngoài: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const BG = [10, 132, 255]
const FG = [255, 255, 255]
// Ba cột tăng dần, như biểu đồ thu chi.
const BARS = [
  { x0: 0.22, x1: 0.36, y0: 0.55, y1: 0.74 },
  { x0: 0.43, x1: 0.57, y0: 0.4, y1: 0.74 },
  { x0: 0.64, x1: 0.78, y0: 0.26, y1: 0.74 },
]
const R = 0.035

function inBar(u, v, b) {
  // Hình chữ nhật bo góc
  const cx = Math.min(Math.max(u, b.x0 + R), b.x1 - R)
  const cy = Math.min(Math.max(v, b.y0 + R), b.y1 - R)
  return (u - cx) ** 2 + (v - cy) ** 2 <= R * R
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  const SS = 3
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let hit = 0
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size
          const v = (y + (sy + 0.5) / SS) / size
          if (BARS.some((b) => inBar(u, v, b))) hit++
        }
      const t = hit / (SS * SS)
      const o = y * (size * 3 + 1) + 1 + x * 3
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] * (1 - t) + FG[c] * t)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size))
  console.log('đã tạo public/' + name)
}
