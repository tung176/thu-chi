// So khớp chữ tiếng Việt: bỏ dấu, bỏ từ chung chung, chịu lỗi gõ nhẹ.
import type { Category, Kind } from '../types'
import { PHATSINH } from '../data/categories'

// Từ quá chung chung, bỏ đi khi so khớp.
// Không đưa 'tra': bỏ dấu thì 'trả' và 'trà' (trà sữa) trùng nhau.
const STOP = new Set(['tien', 'mua', 'dong', 'nap', 'cho', 'cua', 'va'])

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

/** Mọi từ, không bỏ từ chung chung: dùng khi so với những gì bạn đã nhập để không nhầm 'mua điện thoại' với 'tiền điện thoại'. */
export function tokensAll(s: string): string[] {
  return [...new Set(normalize(s).split(' ').filter(Boolean))]
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

// Chịu lỗi gõ một chữ, nhưng chỉ với từ dài từ 5 chữ trở lên (từ ngắn như "xang" và "tang" là hai từ khác nhau).
export const same = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && lev(a, b) <= 1)

/** Độ giống: phần từ của bên ngắn hơn có mặt ở bên dài hơn (contain), và Jaccard để phân hơn thua. */
export function similarity(a: string[], b: string[]): { contain: number; jaccard: number } {
  if (a.length === 0 || b.length === 0) return { contain: 0, jaccard: 0 }
  const [small, big] = a.length <= b.length ? [a, b] : [b, a]
  const hit = small.filter((t) => big.some((u) => same(t, u))).length
  const union = a.length + b.length - hit
  return { contain: hit / small.length, jaccard: hit / union }
}

/**
 * Ngưỡng tự gán vào mục có sẵn khi so khớp mờ: ít nhất 3/4 số từ của bên ngắn hơn phải có mặt.
 * Thấp hơn thì dễ xếp nhầm (ví dụ "ăn sáng" nhầm với "ăn trưa" chỉ vì cùng chữ "ăn"), nên
 * chuyển sang từ điển hoặc tạo mục mới.
 */
export const THRESHOLD = 0.75

/** Tên mục mới từ nội dung: gọn lại và viết hoa chữ đầu. */
export function newCategoryName(note: string): string {
  const s = note.trim().replace(/\s+/g, ' ').slice(0, 40)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function makeCategory(note: string, kind: Kind, parentId?: string): Category {
  return {
    id: `u-${crypto.randomUUID().slice(0, 8)}`,
    name: newCategoryName(note),
    kind,
    parentId: parentId ?? PHATSINH[kind],
  }
}
