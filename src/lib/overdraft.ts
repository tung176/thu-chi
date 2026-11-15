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
