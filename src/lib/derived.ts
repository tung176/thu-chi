// Số liệu suy ra để hiển thị (không lưu): các lần vay/trả thấu chi và các kỳ trả góp đã đến hạn.
// - Vay thấu chi tính là Thu (tiền mặt vào tay), trả gốc thấu chi tính là Chi (tiền mặt ra), cùng ngày thật.
// - Kỳ trả góp đã đến hạn mà chưa ghi thì hiện như một khoản chi của tháng đó; số tổng hợp "Tiền trả góp / bảo dưỡng"
//   của tháng từ file cũ đã chứa các kỳ này nên được trừ bớt để không tính trùng.
import type { Category, Txn } from '../types'
import { eventDay } from './overdraft'
import { addMonths, PLAN_PARENT } from './plan'

export const VAY_ID = 'thu-vay-thauchi'
export const TRA_ID = 'chi-tra-thauchi'

export function withDerived(categories: Category[], txns: Txn[], thisMonth: string): Txn[] {
  const extra: Txn[] = []

  for (const c of categories) {
    c.overdraft?.events.forEach((e, i) => {
      extra.push({
        id: `od-${c.id}-${i}`,
        date: eventDay(e),
        time: '00:00',
        amount: Math.abs(e.amount),
        categoryId: e.amount > 0 ? VAY_ID : TRA_ID,
        note: e.amount > 0 ? 'Vay thấu chi' : 'Trả gốc thấu chi',
      })
    })
  }

  // Số tiền kỳ trả góp theo tháng (đã ghi hoặc đến hạn chưa ghi), để trừ khỏi số tổng hợp cùng tháng.
  const planByMonth = new Map<string, number>()
  for (const c of categories) {
    const p = c.plan
    if (!p) continue
    const mine = txns.filter((t) => t.categoryId === c.id && !t.deleted && !t.summary)
    const recorded = new Set(mine.map((t) => t.date.slice(0, 7)))
    for (const t of mine) planByMonth.set(t.date.slice(0, 7), (planByMonth.get(t.date.slice(0, 7)) ?? 0) + t.amount)
    for (let k = p.paidBefore + 1; k <= p.periods; k++) {
      const month = addMonths(p.firstMonth, k - 1)
      if (month > thisMonth || recorded.has(month)) continue
      extra.push({
        id: `pl-${c.id}-${k}`,
        date: `${month}-01`,
        time: '00:00',
        amount: p.perMonth,
        categoryId: c.id,
        note: `kỳ ${k}/${p.periods} (đến hạn, chưa ghi)`,
      })
      planByMonth.set(month, (planByMonth.get(month) ?? 0) + p.perMonth)
    }
  }

  const left = new Map(planByMonth)
  const adjusted = txns.map((t) => {
    if (!t.summary || t.categoryId !== PLAN_PARENT) return t
    const m = t.date.slice(0, 7)
    const cut = Math.min(t.amount, left.get(m) ?? 0)
    if (cut <= 0) return t
    left.set(m, (left.get(m) ?? 0) - cut)
    return { ...t, amount: t.amount - cut }
  })

  return [...adjusted.filter((t) => t.amount > 0), ...extra]
}
