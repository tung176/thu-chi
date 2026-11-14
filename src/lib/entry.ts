import type { Category, Kind, Txn } from '../types'

/** Mục có thể chọn khi nhập: chưa lưu trữ và không còn mục con nào đang dùng. */
export function selectable(categories: Category[], kind: Kind): Category[] {
  return categories.filter(
    (c) =>
      c.kind === kind &&
      !c.archived &&
      !c.container &&
      !categories.some((x) => x.parentId === c.id && !x.archived),
  )
}

export function labelOf(c: Category, categories: Category[]): string {
  const parent = c.parentId ? categories.find((p) => p.id === c.parentId) : undefined
  if (!parent) return c.name
  // "Tiền điện" nằm trong nhóm "Điện" thì chỉ cần "Tiền điện".
  return c.name.toLowerCase().includes(parent.name.toLowerCase()) ? c.name : `${parent.name} · ${c.name}`
}

/** Sắp theo số lần dùng (nhiều lên đầu), cùng số lần thì giữ thứ tự danh mục. */
export function rankByUse(cats: Category[], txns: Txn[]): Category[] {
  const count = new Map<string, number>()
  for (const t of txns) count.set(t.categoryId, (count.get(t.categoryId) ?? 0) + 1)
  return cats
    .map((c, i) => ({ c, i, n: count.get(c.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.c)
}

export interface Template {
  category: Category
  amount: number
}

/**
 * Khoản lặp lại hằng tháng: số tiền của hai tháng gần nhất có dữ liệu bằng nhau
 * (ví dụ tiền phòng, internet). Chạm một lần là điền sẵn danh mục và số tiền.
 */
export function recurringTemplates(cats: Category[], txns: Txn[]): Template[] {
  const byCat = new Map<string, Map<string, number>>()
  for (const t of txns) {
    const m = t.date.slice(0, 7)
    const months = byCat.get(t.categoryId) ?? new Map<string, number>()
    months.set(m, (months.get(m) ?? 0) + t.amount)
    byCat.set(t.categoryId, months)
  }
  const out: Template[] = []
  for (const c of cats) {
    const months = byCat.get(c.id)
    if (!months || months.size < 2) continue
    const sorted = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const [, last] = sorted[sorted.length - 1]
    const [, prev] = sorted[sorted.length - 2]
    if (last > 0 && last === prev) out.push({ category: c, amount: last })
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, 6)
}

const pad = (n: number) => String(n).padStart(2, '0')
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const timeStr = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
