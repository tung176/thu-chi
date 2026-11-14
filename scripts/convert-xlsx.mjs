// Chuyển tab "Thu chi hàng tháng" trong file Excel thành data/history.json.
// Dùng: node scripts/convert-xlsx.mjs "data/<tên file>.xlsx" [YYYY-MM bắt đầu]
// Kết quả nằm trong data/ (đã .gitignore), không đưa lên GitHub.
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { CATEGORIES } from '../src/data/categories.ts'

const file = process.argv[2]
const startMonth = process.argv[3] ?? '2024-01'
if (!file) {
  console.error('Thiếu đường dẫn file xlsx')
  process.exit(1)
}

const SHEET = 'Thu chi hàng tháng'
// Dòng trong sheet -> id danh mục. Dòng 6 và 10 là tổng các tầng nên bỏ qua.
const ROW_TO_CAT = {
  4: 'thu-luong', 5: 'thu-kinhdoanh',
  7: 'thu-phong-t2', 8: 'thu-phong-t3', 9: 'thu-phong-t4',
  11: 'thu-dv-t2', 12: 'thu-dv-t3', 13: 'thu-dv-t4',
  15: 'chi-angd', 16: 'chi-ancon', 17: 'chi-dien-tien', 18: 'chi-nuoc-tien',
  19: 'chi-internet', 20: 'chi-truyenhinh', 21: 'chi-gopnha', 22: 'chi-dien-3pha',
  23: 'chi-baohiem', 24: 'chi-hoctap', 25: 'chi-dautu', 26: 'chi-thedao',
  27: 'chi-the-tech', 28: 'chi-the-shinhan', 29: 'chi-the-woori',
  30: 'chi-gopbd', 39: 'chi-tiepkhach', 40: 'chi-dulich', 42: 'chi-thue-kd',
}
// Dòng 31-38: chi tiết của dòng 30 (đã ẩn). Không nhập thành danh mục để khỏi tính trùng,
// chỉ ghi vào ghi chú của giao dịch dòng 30.
const BREAKDOWN_ROWS = [31, 32, 33, 34, 35, 36, 37, 38]

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const ws = wb.getWorksheet(SHEET)
if (!ws) throw new Error(`Không thấy tab "${SHEET}"`)

const raw = (r, c) => {
  let v = ws.getCell(r, c).value
  if (v && typeof v === 'object') v = v.result ?? v.text ?? null
  return v
}
const num = (r, c) => (typeof raw(r, c) === 'number' ? raw(r, c) : 0)
const label = (r) => [1, 2, 3].map((c) => raw(r, c)).filter(Boolean).join(' / ')
const pad = (n) => String(n).padStart(2, '0')
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n)

const txns = []
const skipped = []
const mismatches = { thu: [], chi: [] }
let n = 0

// Cột D (4) = tháng 1/2023 ... cột AW (49) = tháng 10/2026.
for (let c = 4; c <= 49; c++) {
  const i = c - 4
  const y = 2023 + Math.floor(i / 12)
  const m = (i % 12) + 1
  const month = `${y}-${pad(m)}`
  if (month < startMonth) continue
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const date = `${month}-${pad(lastDay)}`

  for (const [rowStr, categoryId] of Object.entries(ROW_TO_CAT)) {
    const r = Number(rowStr)
    const v = raw(r, c)
    if (typeof v === 'string' && v.trim() !== '') {
      skipped.push({ month, row: r, label: label(r), text: v })
      continue
    }
    const amount = num(r, c)
    if (!amount) continue
    let note = 'Tổng hợp tháng từ file Sheet'
    if (r === 30) {
      const parts = BREAKDOWN_ROWS.filter((br) => num(br, c)).map(
        (br) => `${label(br)} ${fmt(num(br, c))}`,
      )
      if (parts.length) note += `. Chi tiết trong file: ${parts.join('; ')}`
    }
    txns.push({ id: `h${++n}`, date, time: '23:59', amount, categoryId, note, summary: true })
  }

  // Đối chiếu với tổng trong file
  const fileThu = num(3, c)
  const fileChi = num(14, c)
  const ourThu = Object.entries(ROW_TO_CAT)
    .filter(([, id]) => id.startsWith('thu-'))
    .reduce((s, [r]) => s + num(Number(r), c), 0)
  const ourChi = Object.entries(ROW_TO_CAT)
    .filter(([, id]) => id.startsWith('chi-'))
    .reduce((s, [r]) => s + num(Number(r), c), 0)
  const kd = num(5, c)
  const tiep = num(39, c)
  if (ourThu - kd !== fileThu) mismatches.thu.push(`${month}: file ${fmt(fileThu)} / tính ${fmt(ourThu - kd)}`)
  if (ourChi - tiep !== fileChi)
    mismatches.chi.push(`${month}: file ${fmt(fileChi)} / tính ${fmt(ourChi - tiep)} (lệch ${fmt(ourChi - tiep - fileChi)})`)
}

const out = { source: file.split(/[\\/]/).pop(), categories: CATEGORIES, txns, skipped }
writeFileSync(new URL('../data/history.json', import.meta.url), JSON.stringify(out))

console.log(`Từ ${startMonth}: ${txns.length} giao dịch tổng hợp`)
console.log(`Thu lệch so với file (sau khi trừ tiền kinh doanh): ${mismatches.thu.length}`)
console.log(`Chi lệch so với file (sau khi trừ tiếp chính quyền): ${mismatches.chi.length}`)
mismatches.chi.forEach((x) => console.log('  ' + x))
console.log(`Ô chữ không có số tiền, đã bỏ qua: ${skipped.length}`)
skipped.forEach((s) => console.log(`  ${s.month} dòng ${s.row} (${s.label}): "${s.text}"`))
