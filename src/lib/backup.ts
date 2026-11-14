// Sao lưu thủ công: xuất toàn bộ dữ liệu ra một file .json và nhập lại từ file đó.
// Không phụ thuộc Google nên luôn dùng được.
import type { Category, Txn } from '../types'
import { loadCategories, loadTxns, putMany } from './db'

export interface Backup {
  app: 'thu-chi'
  version: 1
  exportedAt: string
  /** Chỉ danh mục bạn tự tạo (id bắt đầu bằng u-). Danh mục có sẵn lấy theo bản app. */
  categories: Category[]
  /** Gồm cả khoản đã xóa (đánh dấu deleted) để khôi phục không làm sống lại khoản đã xóa. */
  txns: Txn[]
}

export async function buildBackup(): Promise<Backup> {
  const [txns, cats] = await Promise.all([loadTxns(), loadCategories()])
  return {
    app: 'thu-chi',
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: cats.filter((c) => c.id.startsWith('u-')),
    txns,
  }
}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
}

const isTxn = (t: unknown): t is Txn => {
  const x = t as Txn
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.categoryId === 'string' &&
    typeof x.amount === 'number' &&
    Number.isFinite(x.amount) &&
    typeof x.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.date)
  )
}

const isCategory = (c: unknown): c is Category => {
  const x = c as Category
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && (x.kind === 'thu' || x.kind === 'chi')
}

/**
 * Gộp file sao lưu vào dữ liệu trong máy: khoản chưa có thì thêm, khoản đã có thì
 * lấy bản mới hơn (theo updatedAt). Không bao giờ xóa gì đang có trong máy.
 */
export async function importBackup(text: string): Promise<ImportResult> {
  let data: Partial<Backup>
  try {
    data = JSON.parse(text) as Partial<Backup>
  } catch {
    throw new Error('File này không phải file sao lưu (không đọc được).')
  }
  if (data.app !== 'thu-chi' || !Array.isArray(data.txns)) {
    throw new Error('File này không phải file sao lưu của Thu Chi.')
  }

  const existing = new Map((await loadTxns()).map((t) => [t.id, t]))
  const write: Txn[] = []
  let added = 0
  let updated = 0
  let skipped = 0

  for (const t of data.txns) {
    if (!isTxn(t)) {
      skipped++
      continue
    }
    const cur = existing.get(t.id)
    if (!cur) {
      write.push(t)
      added++
    } else if ((t.updatedAt ?? 0) > (cur.updatedAt ?? 0)) {
      write.push(t)
      updated++
    }
  }

  const haveCats = new Set((await loadCategories()).map((c) => c.id))
  const cats = (Array.isArray(data.categories) ? data.categories : []).filter(
    (c): c is Category => isCategory(c) && !haveCats.has(c.id),
  )

  if (write.length) await putMany('txns', write)
  if (cats.length) await putMany('categories', cats)
  return { added, updated, skipped }
}

/** Đưa file cho người dùng: ưu tiên bảng chia sẻ của iPhone (Lưu vào Tệp), không có thì tải về. */
export async function exportFile(): Promise<{ count: number; name: string }> {
  const backup = await buildBackup()
  const day = new Date().toISOString().slice(0, 10)
  const name = `thu-chi-sao-luu-${day}.json`
  const file = new File([JSON.stringify(backup)], name, { type: 'application/json' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sao lưu Thu Chi' })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e
    }
  } else {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  return { count: backup.txns.filter((t) => !t.deleted).length, name }
}
