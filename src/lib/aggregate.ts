import type { Category, Kind, Txn } from '../types'

export const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n)

export const monthOf = (date: string) => date.slice(0, 7)

/** Tổng tiền theo từng danh mục và từng tháng: key `${categoryId}|${YYYY-MM}`. */
export function sumByLeafMonth(txns: Txn[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of txns) {
    const k = `${t.categoryId}|${monthOf(t.date)}`
    m.set(k, (m.get(k) ?? 0) + t.amount)
  }
  return m
}

export interface RowNode {
  category: Category
  children: RowNode[]
}

export function buildTree(categories: Category[], kind: Kind): RowNode[] {
  const byParent = new Map<string | null, Category[]>()
  for (const c of categories.filter((c) => c.kind === kind)) {
    const list = byParent.get(c.parentId) ?? []
    list.push(c)
    byParent.set(c.parentId, list)
  }
  const make = (c: Category): RowNode => ({
    category: c,
    children: (byParent.get(c.id) ?? []).map(make),
  })
  return (byParent.get(null) ?? []).map(make)
}

/**
 * Tổng của một nút trong một tháng = số ghi thẳng vào nút đó + tổng các nút con.
 * (Nút cha thường không có số riêng, trừ dữ liệu cũ của các mục đã lưu trữ.)
 */
export function nodeTotal(node: RowNode, month: string, leaf: Map<string, number>): number {
  const own = leaf.get(`${node.category.id}|${month}`) ?? 0
  return own + node.children.reduce((s, c) => s + nodeTotal(c, month, leaf), 0)
}

export function kindTotal(tree: RowNode[], month: string, leaf: Map<string, number>): number {
  return tree.reduce((s, n) => s + nodeTotal(n, month, leaf), 0)
}

/** Mọi id thuộc một nút (chính nó và các nút con), để xem giao dịch khi chạm vào ô. */
export function leafIds(node: RowNode): string[] {
  return [node.category.id, ...node.children.flatMap(leafIds)]
}

/** Tổng của một danh sách id danh mục (đã gồm cả con, nếu truyền id nhóm) trong các tháng. */
export function sumIds(
  ids: string[],
  months: string[],
  leaf: Map<string, number>,
): number {
  let s = 0
  for (const id of ids) for (const m of months) s += leaf.get(`${id}|${m}`) ?? 0
  return s
}

/** Có ít nhất một giao dịch của các id này trong các tháng đó không. */
export function hasTxn(ids: string[], months: string[], leaf: Map<string, number>): boolean {
  return ids.some((id) => months.some((m) => leaf.has(`${id}|${m}`)))
}

/** Mở rộng id nhóm thành chính nó và mọi id con (theo cây danh mục). */
export function expandIds(ids: string[], categories: Category[]): string[] {
  const out = new Set<string>()
  const visit = (id: string) => {
    out.add(id)
    for (const c of categories) if (c.parentId === id) visit(c.id)
  }
  ids.forEach(visit)
  return [...out]
}
