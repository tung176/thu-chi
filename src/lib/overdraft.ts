// Khoản thấu chi: lãi theo ngày trên dư nợ thực tế, cơ số 365 ngày.
// Lưu ngay trong danh mục (giống nợ trả góp) và hiện trong tên mục trên Google Sheets
// dạng "Thấu chi Shopcash {13|2026-11-15:25000000;2026-12-01:-5000000}".
// Quy ước tính (theo ví dụ của ngân hàng): lãi tính từ ngày bắt đầu đến hết ngày liền kề trước ngày thanh toán.
import type { Category } from '../types'

export interface OdEvent {
  /** Ngày bắt đầu tính lãi (rút) hoặc ngày thanh toán (trả bớt), YYYY-MM-DD. */
  date: string
  /** Dương = rút thêm, âm = trả bớt (VND). */
  amount: number
}

export interface Overdraft {
  /** Lãi suất năm, đơn vị %. */
  rate: number
  events: OdEvent[]
}

export const OD_PARENT = 'chi-phinh'
export const OD_LABEL = 'Thấu chi Shopcash'

const RE = /^(.*?)\s*\{(\d+(?:\.\d+)?)\|([^}]*)\}$/

export const overdraftName = (label: string, o: Overdraft) =>
  `${label} {${o.rate}|${o.events.map((e) => `${e.date}:${e.amount}`).join(';')}}`

export function parseOverdraftName(name: string): { label: string; od: Overdraft } | null {
  const m = RE.exec(name)
  if (!m) return null
  const events: OdEvent[] = []
  for (const part of m[3].split(';').filter(Boolean)) {
    const [date, amt] = part.split(':')
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Number(amt))) events.push({ date, amount: Number(amt) })
  }
  return { label: m[1], od: { rate: Number(m[2]), events } }
}

export const isOverdraft = (c: Category) => !!c.overdraft

/** Số ngày lịch (UTC, không lệch giờ mùa). */
const dayNum = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000
const dayStr = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10)

/** Dư nợ gốc sau mọi sự kiện có ngày từ đầu đến hết `asOf`. */
export function balanceOn(od: Overdraft, asOf: string): number {
  return od.events.filter((e) => e.date <= asOf).reduce((s, e) => s + e.amount, 0)
}

/** Lãi dồn tích tới `asOf`: mỗi ngày d trong [ngày đầu, asOf) tính dư nợ(d) × lãi suất ÷ 365. Làm tròn một lần ở cuối. */
export function interestTo(od: Overdraft, asOf: string): { interest: number; days: number } {
  if (od.events.length === 0) return { interest: 0, days: 0 }
  const start = Math.min(...od.events.map((e) => dayNum(e.date)))
  const end = dayNum(asOf)
  let sum = 0
  let days = 0
  for (let d = start; d < end; d++) {
    const bal = balanceOn(od, dayStr(d))
    if (bal > 0) {
      sum += (bal * od.rate) / 100 / 365
      days++
    }
  }
  return { interest: Math.round(sum), days }
}

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')

/**
 * Câu gõ nhanh có phải khoản vay thấu chi không?
 * 'draw' = vay/rút thêm, 'pay' = trả, 'unknown' = có chữ "vay" nhưng không nói rõ thấu chi, null = không phải khoản vay.
 */
export function loanIntent(text: string): 'draw' | 'pay' | 'unknown' | null {
  const t = plain(text)
  const named = /\b(thau\s*chi|thau\s*tri|shopcash)\b/.test(t)
  const borrow = /\bvay\b/.test(t)
  if (!named && !borrow) return null
  if (!/\b(thau\s*chi|thau\s*tri)\b/.test(t) && !(named && borrow)) return 'unknown'
  return /\b(tra|hoan|thanh\s*toan|nop)\b/.test(t) ? 'pay' : 'draw'
}

/** Ngày liền sau (YYYY-MM-DD): tiền rút ngày 14 thì lãi tính từ ngày 15. */
export const nextDay = (s: string) => dayStr(dayNum(s) + 1)

/** Thêm một lần rút/trả vào khoản thấu chi; chưa có khoản nào thì tạo mới (lãi suất tạm 13%/năm, sửa ở Đầu tháng). */
export function withLoanEvent(existing: Category | undefined, ev: OdEvent): Category {
  if (existing?.overdraft) {
    return { ...existing, overdraft: { ...existing.overdraft, events: [...existing.overdraft.events, ev] } }
  }
  return {
    id: `u-${crypto.randomUUID().slice(0, 8)}`,
    name: OD_LABEL,
    kind: 'chi',
    parentId: OD_PARENT,
    archived: true,
    overdraft: { rate: 13, events: [ev] },
  }
}

const prevDay = (s: string) => dayStr(dayNum(s) - 1)

/** Ngày vay/trả thật để hiển thị: lần vay lưu ngày bắt đầu tính lãi (hôm sau), nên lùi lại một ngày. */
export const eventDay = (e: OdEvent) => (e.amount > 0 ? prevDay(e.date) : e.date)

/** Vay, trả và dư nợ gốc cuối tháng (YYYY-MM) của khoản thấu chi, theo ngày vay/trả thật. */
export function monthLoanStats(od: Overdraft, month: string): { drawn: number; repaid: number; endBalance: number } {
  let drawn = 0
  let repaid = 0
  let endBalance = 0
  for (const e of od.events) {
    const d = eventDay(e).slice(0, 7)
    if (d === month) {
      if (e.amount > 0) drawn += e.amount
      else repaid += -e.amount
    }
    if (d <= month) endBalance += e.amount
  }
  return { drawn, repaid, endBalance }
}
