// Lưu dữ liệu trên máy bằng IndexedDB để dùng được khi không có mạng.
import type { Category, Txn } from '../types'

const DB_NAME = 'thu-chi'
const VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        db.createObjectStore('txns', { keyPath: 'id' })
        db.createObjectStore('categories', { keyPath: 'id' })
      }
      const timer = setTimeout(() => {
        dbPromise = null
        reject(new Error('Không mở được bộ nhớ trong máy (IndexedDB) sau 8 giây.'))
      }, 8000)
      req.onsuccess = () => {
        clearTimeout(timer)
        resolve(req.result)
      }
      req.onerror = () => {
        clearTimeout(timer)
        dbPromise = null
        reject(req.error)
      }
    })
  }
  return dbPromise
}

function run<T>(
  store: 'txns' | 'categories',
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => resolve(req ? req.result : undefined)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export const loadTxns = async () => ((await run<Txn[]>('txns', 'readonly', (s) => s.getAll())) ?? [])
export const loadCategories = async () =>
  ((await run<Category[]>('categories', 'readonly', (s) => s.getAll())) ?? [])

export const putTxn = (t: Txn) => run('txns', 'readwrite', (s) => void s.put(t))

/**
 * Nạp lại lịch sử từ file Sheet: thay toàn bộ giao dịch "tổng hợp" cũ bằng bản mới,
 * giữ nguyên các khoản bạn đã tự nhập trong app.
 */
export function replaceSummary(history: Txn[]) {
  return open().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction('txns', 'readwrite')
        const txns = tx.objectStore('txns')
        const req = txns.getAll()
        req.onsuccess = () => {
          for (const t of req.result as Txn[]) if (t.summary) txns.delete(t.id)
          for (const t of history) txns.put(t)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export const delCategory = (id: string) => run('categories', 'readwrite', (s) => void s.delete(id))

export function putMany(store: 'txns' | 'categories', items: (Txn | Category)[]) {
  return run(store, 'readwrite', (s) => {
    for (const it of items) s.put(it)
  })
}
