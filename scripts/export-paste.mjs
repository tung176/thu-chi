// Tạo file dán vào app (Cài đặt > "Hoặc dán nội dung sao lưu") từ các cột tháng của file Excel.
// Cột tháng M của file cũ được tịnh tiến sang ngày 01 của tháng M+1.
// Dùng: node --experimental-strip-types scripts/export-paste.mjs "<file xlsx>" <từ YYYY-MM> <đến YYYY-MM> <file ra>
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'

const [file, from, to, out] = process.argv.slice(2)
if (!file || !from || !to || !out) throw new Error('Thiếu tham số')
const ROW_TO_CAT = {
  4: 'thu-luong', 5: 'thu-kinhdoanh', 7: 'thu-phong-t2', 8: 'thu-phong-t3', 9: 'thu-phong-t4',
  11: 'thu-dv-t2', 12: 'thu-dv-t3', 13: 'thu-dv-t4',
  15: 'chi-angd', 16: 'chi-ancon', 17: 'chi-dien-tien', 18: 'chi-nuoc-tien', 19: 'chi-internet',
  20: 'chi-truyenhinh', 21: 'chi-gopnha', 22: 'chi-dien-3pha', 23: 'chi-baohiem', 24: 'chi-hoctap',
  25: 'chi-dautu', 26: 'chi-thedao', 27: 'chi-the-tech', 28: 'chi-the-shinhan', 29: 'chi-the-woori',
  30: 'chi-gopbd', 39: 'chi-tiepkhach', 40: 'chi-dulich', 42: 'chi-thue-kd',
}
const BREAKDOWN = [31, 32, 33, 34, 35, 36, 37, 38]
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const ws = wb.getWorksheet('Thu chi hàng tháng')
const raw = (r, c) => { let v = ws.getCell(r, c).value; if (v && typeof v === 'object') v = v.result ?? v.text ?? null; return v }
const num = (r, c) => (typeof raw(r, c) === 'number' ? raw(r, c) : 0)
const label = (r) => [1, 2, 3].map((c) => raw(r, c)).filter(Boolean).join(' / ')
const pad = (n) => String(n).padStart(2, '0')
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n)
const next = (y, m) => (m === 12 ? [y + 1, 1] : [y, m + 1])
const now = Date.now()
const txns = []
const skipped = []
for (let c = 4; c <= 49; c++) {
  const i = c - 4, y = 2023 + Math.floor(i / 12), m = (i % 12) + 1
  const month = `${y}-${pad(m)}`
  if (month < from || month > to) continue
  const [ny, nm] = next(y, m)
  const date = `${ny}-${pad(nm)}-01`
  for (const [rowStr, categoryId] of Object.entries(ROW_TO_CAT)) {
    const r = Number(rowStr), v = raw(r, c)
    if (typeof v === 'string' && v.trim() !== '') { skipped.push(`${month} dòng ${r} (${label(r)}): "${v}"`); continue }
    const amount = num(r, c)
    if (!amount) continue
    let note = `Tổng hợp tháng ${pad(m)}/${y} (file Sheet)`
    if (r === 30) {
      const parts = BREAKDOWN.filter((br) => num(br, c)).map((br) => `${label(br)} ${fmt(num(br, c))}`)
      if (parts.length) note += `. Chi tiết trong file: ${parts.join('; ')}`
    }
    txns.push({ id: `x${y}${pad(m)}-${r}`, date, time: '00:00', amount, categoryId, note, summary: true, updatedAt: now })
  }
}
writeFileSync(out, JSON.stringify({ app: 'thu-chi', version: 1, exportedAt: new Date(now).toISOString(), categories: [], txns }))
console.log(`${txns.length} khoản, ${from} đến ${to}, ngày ghi sau 1 tháng`)
skipped.forEach((s) => console.log('  bỏ qua ô chữ: ' + s))
