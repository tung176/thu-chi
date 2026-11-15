// Tạo biểu tượng app (PNG) không cần thư viện ngoài: node scripts/make-icons.mjs
// LƯU Ý: biểu tượng hiện dùng là ảnh bàn tay cầm tiền do người dùng cung cấp (public/*.png). Chạy script này sẽ ghi đè bằng biểu tượng túi tiền.
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
// Túi tiền màu trắng trên nền xanh, chữ $ xanh nằm trên thân túi.
const ring = (u, v, cx, cy, r, w) => Math.abs(Math.hypot(u - cx, v - cy) - r) <= w / 2
const rrect = (u, v, x0, y0, x1, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1
function trap(u, v, y0, y1, h0, h1) {
  if (v < y0 || v > y1) return false
  const h = h0 + ((h1 - h0) * (v - y0)) / (y1 - y0)
  return Math.abs(u - 0.5) <= h
}
function inBag(u, v) {
  if (Math.hypot(u - 0.5, v - 0.66) <= 0.26) return true // thân túi
  if (trap(u, v, 0.4, 0.55, 0.085, 0.2)) return true // cổ túi
  if (trap(u, v, 0.25, 0.37, 0.15, 0.1)) return true // miệng xòe
  if (rrect(u, v, 0.38, 0.35, 0.62, 0.42)) return true
  return false
}
function inTie(u, v) {
  return rrect(u, v, 0.4, 0.405, 0.6, 0.44) // dây buộc (khe xanh)
}
function inDollar(u, v) {
  const cx = 0.5
  const w = 0.04
  if (rrect(u, v, cx - 0.013, 0.535, cx + 0.013, 0.795)) return true
  if (ring(u, v, cx, 0.605, 0.07, w) && !(u > cx && v > 0.605)) return true
  if (ring(u, v, cx, 0.725, 0.07, w) && !(u < cx && v < 0.725)) return true
  return false
}
const inFg = (u, v) => inBag(u, v) && !inTie(u, v) && !inDollar(u, v)

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
          if (inFg(u, v)) hit++
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
