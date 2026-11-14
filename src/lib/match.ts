// Ghép nội dung gõ tay (ví dụ "xăng xe máy") với danh mục có sẵn.
// Không dùng AI: so khớp từ khóa, bỏ dấu tiếng Việt, chịu được lỗi gõ nhẹ.
import type { Category, Kind, Txn } from '../types'
import { PHATSINH } from '../data/categories'
import { labelOf, selectable } from './entry'

// Từ quá chung chung, bỏ đi khi so khớp.
const STOP = new Set(['tien', 'mua', 'tra', 'dong', 'nap', 'cho', 'cua', 'va'])

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokens(s: string): string[] {
  return [...new Set(normalize(s).split(' ').filter((t) => t && !STOP.has(t)))]
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
  return dp[a.length][b.length]
}

const same = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= 1)

/** Độ giống: phần từ của bên ngắn hơn có mặt ở bên dài hơn (contain), và Jaccard để phân hơn thua. */
function similarity(a: string[], b: string[]): { contain: number; jaccard: number } {
  if (a.length === 0 || b.length === 0) return { contain: 0, jaccard: 0 }
  const [small, big] = a.length <= b.length ? [a, b] : [b, a]
  const hit = small.filter((t) => big.some((u) => same(t, u))).length
  const union = a.length + b.length - hit
  return { contain: hit / small.length, jaccard: hit / union }
}

/** Ngưỡng tự gán vào mục có sẵn. Thấp hơn thì tạo mục mới trong "Phát sinh". */
const THRESHOLD = 0.5

export interface Match {
  category: Category
  contain: number
}

/**
 * Tìm mục giống nhất cho nội dung vừa gõ:
 * 1. những nội dung bạn đã từng nhập (và mục bạn đã gán cho nó),
 * 2. tên các mục hiện có.
 */
export function matchNote(
  note: string,
  kind: Kind,
  categories: Category[],
  txns: Txn[],
): Match | null {
  const want = tokens(note)
  if (want.length === 0) return null

  const pool = selectable(categories, kind)
  const byId = new Map(pool.map((c) => [c.id, c]))

  type Cand = { category: Category; contain: number; jaccard: number }
  let best: Cand | null = null
  const consider = (category: Category | undefined, toks: string[]) => {
    if (!category) return
    const s = similarity(want, toks)
    if (s.contain < THRESHOLD) return
    if (!best || s.contain > best.contain || (s.contain === best.contain && s.jaccard > best.jaccard))
      best = { category, ...s }
  }

  // Nội dung cũ: lần gán gần nhất của cùng một nội dung được ưu tiên.
  const latest = new Map<string, string>()
  const ordered = txns
    .filter((t) => !t.summary && !t.deleted && t.note)
    .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
  for (const t of ordered) latest.set(normalize(t.note), t.categoryId)
  for (const [n, id] of latest) consider(byId.get(id), tokens(n))

  for (const c of pool) consider(c, tokens(labelOf(c, categories)))

  return best ? { category: (best as Cand).category, contain: (best as Cand).contain } : null
}

/** Tên mục mới từ nội dung: gọn lại và viết hoa chữ đầu. */
export function newCategoryName(note: string): string {
  const s = note.trim().replace(/\s+/g, ' ').slice(0, 40)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function makeCategory(note: string, kind: Kind): Category {
  return {
    id: `u-${crypto.randomUUID().slice(0, 8)}`,
    name: newCategoryName(note),
    kind,
    parentId: PHATSINH[kind],
  }
}
