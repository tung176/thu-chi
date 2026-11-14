// Đọc một câu gõ nhanh như "đổ xăng 70k, cà phê 30k hôm qua" thành các khoản.
// Số tiền và ngày được đọc bằng quy tắc trong máy, không để AI đoán, nên không sai số.
import { timeStr, todayStr } from './entry'

export interface QuickItem {
  amount: number
  /** Nội dung đã bỏ số tiền và chữ chỉ ngày. */
  note: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm */
  time: string
}

export interface QuickResult {
  items: QuickItem[]
  error: string | null
}

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n)

// ---------- Số tiền ----------
const RE_ABBR = /(\d+(?:[.,]\d+)?)\s?(tr|k)(\d+)?(?![\p{L}])/iu
const RE_TRIEU = /(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|củ)(?![\p{L}])/iu
const RE_TRIEU_TAIL = /^\s+(\d{1,3})(?![\p{L}\d])/u
const RE_NGHIN = /(\d+(?:[.,]\d+)?)\s*(nghìn|nghin|ngàn|ngan)(?![\p{L}])/iu
const RE_PLAIN = /(\d{1,3}(?:[.,]\d{3})+|\d{4,})\s*(?:đồng|dong|vnđ|vnd|đ|d)?(?![\p{L}\d])/iu
const RE_SMALL = /(?<![\d.,])(\d{1,3})(?![\d.,])/u

const num = (s: string) => Number(s.replace(',', '.'))

type Amt = { amount: number; rest: string } | { error: string } | null

function cut(s: string, index: number, length: number): string {
  return (s.slice(0, index) + ' ' + s.slice(index + length)).replace(/\s+/g, ' ').trim()
}

function extractAmount(seg: string): Amt {
  const frac = (digits: string) => Number('0.' + digits)

  let m = RE_ABBR.exec(seg)
  if (m) {
    const unit = m[2].toLowerCase() === 'k' ? 1_000 : 1_000_000
    const base = m[3] ? Number(m[1].replace(/[.,]\d+$/, '')) + frac(m[3]) : num(m[1])
    return { amount: Math.round(base * unit), rest: cut(seg, m.index, m[0].length) }
  }

  m = RE_TRIEU.exec(seg)
  if (m) {
    let base = num(m[1])
    let length = m[0].length
    const tail = RE_TRIEU_TAIL.exec(seg.slice(m.index + length))
    if (tail) {
      // "2 triệu 5" = 2,5 triệu; "2 triệu 500" = 2,5 triệu. Không tính khi chữ số đó thuộc
      // một từ khác đứng sau, ví dụ "2 triệu 5 người".
      const after = seg.slice(m.index + length + tail[0].length)
      if (tail[1].length === 3 || !/^\s*\p{L}/u.test(after)) {
        base += frac(tail[1])
        length += tail[0].length
      }
    }
    return { amount: Math.round(base * 1_000_000), rest: cut(seg, m.index, length) }
  }

  m = RE_NGHIN.exec(seg)
  if (m) return { amount: Math.round(num(m[1]) * 1_000), rest: cut(seg, m.index, m[0].length) }

  m = RE_PLAIN.exec(seg)
  if (m) return { amount: Number(m[1].replace(/[.,]/g, '')), rest: cut(seg, m.index, m[0].length) }

  m = RE_SMALL.exec(seg)
  if (m) return { error: `"${m[1]}" là bao nhiêu? Gõ ${m[1]}k hoặc ${m[1]}.000 nhé.` }

  return null
}

// ---------- Ngày ----------
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const RE_KIA = /hôm kia|hom kia/iu
const RE_QUA = /hôm qua|hom qua|tối qua|toi qua|đêm qua|dem qua|chiều qua|chieu qua|sáng qua|sang qua|trưa qua|trua qua/iu
const RE_NAY = /hôm nay|hom nay|sáng nay|sang nay|chiều nay|chieu nay|tối nay|toi nay|trưa nay|trua nay/iu
const RE_DATE = /(?<!\d)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?!\d)/u

type Dt = { date: string; rest: string; leading: boolean } | { error: string } | null

function extractDate(seg: string, now: Date): Dt {
  const shift = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - days)
    return ymd(d)
  }
  for (const [re, days] of [[RE_KIA, 2], [RE_QUA, 1], [RE_NAY, 0]] as const) {
    const m = re.exec(seg)
    if (m) return { date: shift(days), rest: cut(seg, m.index, m[0].length), leading: m.index === 0 }
  }
  const m = RE_DATE.exec(seg)
  if (m) {
    const day = Number(m[1])
    const mon = Number(m[2])
    let year = m[3] ? Number(m[3]) : now.getFullYear()
    if (year < 100) year += 2000
    const d = new Date(year, mon - 1, day)
    if (mon < 1 || mon > 12 || d.getMonth() !== mon - 1 || d.getDate() !== day)
      return { error: `Ngày ${m[0]} không đúng.` }
    if (ymd(d) > ymd(now)) return { error: `Ngày ${day}/${mon} chưa tới, app chỉ ghi khoản đã chi hoặc đã thu.` }
    return { date: ymd(d), rest: cut(seg, m.index, m[0].length), leading: m.index === 0 }
  }
  return null
}

// ---------- Cả câu ----------
const SPLIT = /\s*[;+\n]\s*|,\s+|\s+và\s+|\s+&\s+/u

export function parseQuick(text: string, now: Date = new Date()): QuickResult {
  const segs = text
    .split(SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
  if (segs.length === 0) return { items: [], error: null }

  const parsed: { amount: number; note: string; date: string | null }[] = []
  let leadingDate: string | null = null

  for (let i = 0; i < segs.length; i++) {
    let seg = segs[i]
    let date: string | null = null

    const dt = extractDate(seg, now)
    if (dt && 'error' in dt) return { items: [], error: dt.error }
    if (dt) {
      date = dt.date
      seg = dt.rest
      if (i === 0 && dt.leading) leadingDate = dt.date
    }

    const amt = extractAmount(seg)
    if (amt && 'error' in amt) return { items: [], error: amt.error }
    if (!amt) return { items: [], error: `Chưa thấy số tiền trong "${segs[i]}". Gõ ví dụ: ${segs[i]} 70k` }
    if (amt.amount <= 0 || amt.amount > 100_000_000_000)
      return { items: [], error: `Số tiền ${fmt(amt.amount)} ₫ chưa hợp lý, bạn kiểm tra lại nhé.` }

    const note = amt.rest.replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim()
    if (!note) return { items: [], error: `${fmt(amt.amount)} ₫ để làm gì? Thêm nội dung, ví dụ: đổ xăng ${segs[i]}` }
    parsed.push({ amount: amt.amount, note, date })
  }

  const today = ymd(now)
  const items: QuickItem[] = parsed.map((p) => {
    const date = p.date ?? leadingDate ?? today
    return {
      amount: p.amount,
      note: p.note,
      date,
      time: date === todayStr(now) ? timeStr(now) : '12:00',
    }
  })
  return { items, error: null }
}
