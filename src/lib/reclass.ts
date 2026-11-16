import type { Category } from '../types'
import { normalize } from './match'

/** Quy tắc anh dặn: khoản cũ đang nằm ở "Chưa phân loại" mà ghi chú chứa cụm này thì chuyển sang mục đúng. */
const RULES: [string, string][] = [
  ['thay tung goi hon', 'chi-angd'],
  ['dua vo', 'chi-ancon'],
  ['shopee', 'chi-hangngay'],
  ['nap 5g cho me', 'chi-hangngay'],
  ['mua bong den thay tang 3', 'chi-hangngay'],
]

export function reclassTarget(note: string): string | null {
  const n = ' ' + normalize(note) + ' '
  for (const [phrase, id] of RULES) if (n.includes(' ' + phrase + ' ')) return id
  return null
}

/** Mục đang nằm dưới "Chưa phân loại" (hoặc không có nhóm). */
export function isUnclassified(cat: Category | undefined, cats: Category[]): boolean {
  let cur: Category | undefined = cat
  while (cur) {
    if (cur.id === 'chi-phatsinh' || cur.id === 'thu-phatsinh') return true
    const pid: string | null = cur.parentId
    cur = pid ? cats.find((x) => x.id === pid) : undefined
  }
  return !cat
}
