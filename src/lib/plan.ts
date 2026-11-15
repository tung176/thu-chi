// Kế hoạch trả góp: lưu ngay trong danh mục (mục con của "Tiền trả góp / bảo dưỡng").
// Trên Google Sheets, kế hoạch hiện trong tên mục dạng "Tủ lạnh [1500000|12|2026-01|3]" nên đọc được bằng mắt.
import type { Category, Txn } from '../types'

export interface Plan {
  /** Số tiền mỗi kỳ (VND). */
  perMonth: number
  /** Tổng số kỳ. */
  periods: number
  /** Tháng của kỳ đầu tiên (YYYY-MM). */
  firstMonth: string
  /** Số kỳ đã trả trước khi dùng app (đã nằm sẵn trong lịch sử, không tạo lại khoản chi). */
  paidBefore: number
}

export const PLAN_PARENT = 'chi-gopbd'

const RE = /^(.*?)\s*\[(\d+)\|(\d+)\|(\d{4}-\d{2})\|(\d+)\]$/

export const planName = (label: string, p: Plan) =>
  `${label} [${p.perMonth}|${p.periods}|${p.firstMonth}|${p.paidBefore}]`

export function parsePlanName(name: string): { label: string; plan: Plan } | null {
  const m = RE.exec(name)
  if (!m) return null
  return {
    label: m[1],
    plan: { perMonth: Number(m[2]), periods: Number(m[3]), firstMonth: m[4], paidBefore: Number(m[5]) },
  }
}

export function addMonths(ym: string, n: number): string {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5)) - 1 + n
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${yy}-${String(mm + 1).padStart(2, '0')}`
}

export interface PlanStatus {
  category: Category
  plan: Plan
  /** Số kỳ đã trả (trước đó + đã ghi trong app). */
  paid: number
  remaining: number
  /** Kỳ kế tiếp (1 đến periods), null nếu đã trả hết. */
  nextPeriod: number | null
  lastMonth: string
  /** Đã ghi một khoản trả trong tháng này chưa. */
  paidThisMonth: boolean
}

/** Tình trạng của mọi kế hoạch trả góp. */
export function planStatuses(categories: Category[], txns: Txn[], thisMonth: string): PlanStatus[] {
  return categories
    .filter((c) => c.plan)
    .map((c) => {
      const plan = c.plan!
      const mine = txns.filter((t) => t.categoryId === c.id && !t.deleted && !t.summary)
      const paid = plan.paidBefore + mine.length
      const remaining = Math.max(0, plan.periods - paid)
      return {
        category: c,
        plan,
        paid,
        remaining,
        nextPeriod: remaining > 0 ? paid + 1 : null,
        lastMonth: addMonths(plan.firstMonth, plan.periods - 1),
        paidThisMonth: mine.some((t) => t.date.startsWith(thisMonth)),
      }
    })
}

/** Đọc nhiều dòng dạng "Tên | số tiền mỗi kỳ | số kỳ | tháng đầu YYYY-MM | số kỳ đã trả trước". */
export function parsePlanLines(text: string): { ok: { label: string; plan: Plan }[]; errors: string[] } {
  const ok: { label: string; plan: Plan }[] = []
  const errors: string[] = []
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const p = line.split('|').map((s) => s.trim())
      const n = (s: string) => Number(s.replace(/[.,\s]/g, ''))
      const bad = (why: string) => errors.push(`Dòng ${i + 1} (${line}): ${why}`)
      if (p.length !== 5) return bad('cần đủ 5 phần ngăn cách bằng dấu |')
      const [label, per, periods, first, paid] = p
      if (!label) return bad('thiếu tên')
      if (!(n(per) > 0)) return bad('số tiền mỗi kỳ chưa đúng')
      if (!(n(periods) > 0 && n(periods) <= 120)) return bad('số kỳ chưa đúng')
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(first)) return bad('tháng đầu phải dạng YYYY-MM, ví dụ 2026-06')
      if (!(n(paid) >= 0 && n(paid) <= n(periods))) return bad('số kỳ đã trả chưa đúng')
      ok.push({ label, plan: { perMonth: n(per), periods: n(periods), firstMonth: first, paidBefore: n(paid) } })
    })
  return { ok, errors }
}

/** Số tháng từ tháng a đến tháng b (YYYY-MM), b sau a thì dương. */
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5)) - Number(a.slice(5))

/** Còn nợ cuối tháng `month` của một khoản trả góp theo lịch kỳ (null nếu chưa bắt đầu). */
export function planOwedAt(plan: Plan, month: string): number | null {
  const n = monthsBetween(plan.firstMonth, month) + 1
  if (n <= 0) return null
  return Math.max(0, plan.periods - Math.min(n, plan.periods)) * plan.perMonth
}
