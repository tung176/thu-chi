// Xếp một nội dung ("đổ xăng", "mua cháo"...) vào danh mục, theo thứ tự:
// 1. điều bạn đã từng nhập và sửa, 2. từ điển từ khóa, 3. tên các mục hiện có.
import type { Category, Kind, Txn } from '../types'
import { KEYWORDS, THU_WORDS } from '../data/keywords'
import { labelOf, selectable } from './entry'
import { normalize, same, similarity, THRESHOLD, tokens, tokensAll } from './match'

export type Via = 'memory' | 'dict' | 'name'

export interface Classified {
  category: Category
  via: Via
}

type Best = { category: Category; contain: number; jaccard: number }

function pool(categories: Category[], kind?: Kind): Category[] {
  return kind
    ? selectable(categories, kind)
    : [...selectable(categories, 'chi'), ...selectable(categories, 'thu')]
}

export function classify(
  note: string,
  categories: Category[],
  txns: Txn[],
  kind?: Kind,
): Classified | null {
  const norm = normalize(note)
  if (!norm) return null

  const cands = pool(categories, kind)
  const byId = new Map(cands.map((c) => [c.id, c]))

  // 1. Điều bạn từng nhập: lần gán gần nhất của cùng một nội dung được ưu tiên.
  const latest = new Map<string, string>()
  const ordered = txns
    .filter((t) => !t.summary && !t.deleted && t.note)
    .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
  for (const t of ordered) latest.set(normalize(t.note), t.categoryId)

  const exact = latest.get(norm)
  if (exact && byId.has(exact)) return { category: byId.get(exact)!, via: 'memory' }

  // Câu mới phải chứa trọn một câu đã nhớ (chiều ngược lại không tính: "tiền điện" không được
  // kéo về mục của "tiền điện thoại"). Câu đã nhớ dài hơn thì thắng.
  const want = tokensAll(note)
  let memHit: { category: Category; len: number } | null = null
  for (const [n, id] of latest) {
    const cat = byId.get(id)
    const mt = tokensAll(n)
    if (!cat || mt.length === 0) continue
    if (mt.every((t) => want.some((u) => same(t, u))) && (!memHit || mt.length > memHit.len))
      memHit = { category: cat, len: mt.length }
  }
  if (memHit) return { category: (memHit as { category: Category }).category, via: 'memory' }

  // 2. Từ điển từ khóa: cụm từ dài nhất khớp nguyên từ thì thắng.
  // Câu có gõ dấu thì so khớp giữ nguyên dấu (để "cuối" không nhầm với "cưới", "xăng" không nhầm với "tầng");
  // câu gõ không dấu thì mới bỏ dấu khi so.
  const keepMarks = /\P{ASCII}/u.test(note)
  const fold = (s: string) =>
    keepMarks
      ? s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
      : normalize(s)
  const padded = ` ${fold(note)} `
  let dictHit: { category: Category; len: number } | null = null
  for (const c of cands) {
    for (const k of KEYWORDS[c.id] ?? []) {
      const nk = fold(k)
      if (nk && padded.includes(` ${nk} `) && (!dictHit || nk.length > dictHit.len))
        dictHit = { category: c, len: nk.length }
    }
  }
  if (dictHit) return { category: (dictHit as { category: Category }).category, via: 'dict' }

  // 3. Tên các mục hiện có (kể cả mục bạn đã tự tạo), bỏ qua các từ chung chung như 'tiền', 'mua'.
  let best: Best | null = null
  const wantNames = tokens(note)
  for (const c of cands) {
    if (wantNames.length === 0) break
    const s = similarity(wantNames, tokens(labelOf(c, categories)))
    if (s.contain < THRESHOLD) continue
    if (!best || s.contain > best.contain || (s.contain === best.contain && s.jaccard > best.jaccard))
      best = { category: c, ...s }
  }
  if (best) return { category: (best as Best).category, via: 'name' }

  return null
}

/** Khi chưa xếp được vào mục nào: đoán là Thu hay Chi từ vài từ khóa. */
export function guessKind(note: string): Kind {
  const padded = ` ${normalize(note)} `
  return THU_WORDS.some((w) => padded.includes(` ${normalize(w)} `)) ? 'thu' : 'chi'
}
