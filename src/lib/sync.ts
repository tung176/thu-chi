// Sao lưu lên Google Sheets qua "hộp thư" Apps Script của bạn (xem apps-script/Code.gs).
// App không đăng nhập Google; chỉ biết một địa chỉ và một mã bí mật do bạn đặt, lưu trong máy này.
import type { Category, Txn } from '../types'
import { CATEGORIES } from '../data/categories'
import { importBackup, type ImportResult } from './backup'
import { loadCategories, loadTxns } from './db'

export class SyncError extends Error {}

const K_URL = 'thu-chi-sync-url'
const K_SECRET = 'thu-chi-sync-secret'
const K_AUTO = 'thu-chi-sync-auto'
const K_STATE = 'thu-chi-sync-state'
const TIMEOUT_MS = 30000
const CHUNK = 300

function read(k: string): string {
  try {
    return localStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}
function write(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    // trình duyệt chặn lưu: bỏ qua
  }
}

export const getSyncUrl = () => read(K_URL)
export const getSyncSecret = () => read(K_SECRET)
export function setSyncConfig(url: string, secret: string) {
  write(K_URL, url.trim())
  write(K_SECRET, secret.trim())
}
export function clearSyncConfig() {
  write(K_URL, null)
  write(K_SECRET, null)
  write(K_STATE, null)
}
export const syncReady = () => !!getSyncUrl() && !!getSyncSecret()
export const autoSyncOn = () => read(K_AUTO) !== 'off'
export const setAutoSync = (on: boolean) => write(K_AUTO, on ? 'on' : 'off')

interface State {
  /** Đã đẩy toàn bộ dữ liệu lên Sheet lần đầu chưa. */
  fullPushed: boolean
  /** Các khoản có updatedAt lớn hơn mốc này là chưa sao lưu. */
  lastPushed: number
  /** Lần sao lưu thành công gần nhất (mili giây). */
  lastAt: number
}

export function getSyncState(): State {
  try {
    const s = JSON.parse(read(K_STATE) || '{}') as Partial<State>
    return { fullPushed: !!s.fullPushed, lastPushed: s.lastPushed ?? 0, lastAt: s.lastAt ?? 0 }
  } catch {
    return { fullPushed: false, lastPushed: 0, lastAt: 0 }
  }
}
const setState = (s: State) => write(K_STATE, JSON.stringify(s))

/** Danh mục của bản app cộng danh mục bạn tự tạo (cùng cách hợp nhất như màn chính). */
async function allCategories(): Promise<Category[]> {
  const stored = await loadCategories()
  const seeded = new Set(CATEGORIES.map((c) => c.id))
  return [...CATEGORIES, ...stored.filter((c) => !seeded.has(c.id))]
}

interface Reply {
  ok: boolean
  error?: string
}

async function post<T extends Reply>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const url = getSyncUrl()
  const secret = getSyncSecret()
  if (!url || !secret) throw new SyncError('Chưa nhập địa chỉ và mã bí mật.')

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    // Không đặt header riêng: nội dung gửi dạng text thường nên trình duyệt không cần hỏi trước (preflight).
    res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ secret, action, ...payload }),
      redirect: 'follow',
      signal: ctl.signal,
    })
  } catch (e) {
    throw new SyncError(
      (e as Error).name === 'AbortError'
        ? 'Quá lâu không thấy phản hồi.'
        : 'Không kết nối được. Kiểm tra mạng và địa chỉ Apps Script.',
    )
  } finally {
    clearTimeout(timer)
  }

  let data: T
  try {
    data = (await res.json()) as T
  } catch {
    throw new SyncError('Phản hồi lạ. Địa chỉ có thể sai, hoặc lúc đăng tải chưa chọn quyền truy cập "Bất kỳ ai".')
  }
  if (!data.ok) throw new SyncError(data.error ?? 'Apps Script báo lỗi.')
  return data
}

/** Thử kết nối: trả về số dòng đang có trong Sheet. */
export async function testSync(): Promise<number> {
  return (await post<Reply & { rows: number }>('ping')).rows
}

type Row = (string | number | boolean)[]

/** Một khoản thành một dòng, đúng thứ tự cột trong Code.gs. */
export function toRow(t: Txn, cats: Category[]): Row {
  const cat = cats.find((c) => c.id === t.categoryId)
  const chain: Category[] = []
  let cur: Category | undefined = cat
  while (cur) {
    chain.unshift(cur)
    const pid: string | null = cur.parentId
    cur = pid ? cats.find((x) => x.id === pid) : undefined
  }
  const loai = cat?.kind === 'thu' ? 'Thu' : 'Chi'
  const group = chain[0]?.name ?? 'Không rõ'
  const item = chain.length > 1 ? chain[chain.length - 1].name : ''
  // Nội dung: Thu hoặc Chi, rồi nhóm lớn, mục nhỏ, và nội dung bạn đã gõ.
  const content = [loai, group, item, t.note].filter(Boolean).join(' - ')
  const del = !!t.deleted
  return [
    t.date,
    t.time,
    (del ? '[Đã xóa] ' : '') + content,
    t.amount,
    del ? 0 : loai === 'Thu' ? t.amount : -t.amount,
    loai,
    group,
    item,
    t.note,
    t.id,
    t.categoryId,
    t.updatedAt ?? 0,
    del,
    !!t.summary,
  ]
}

function pendingOf(all: Txn[], st: State): Txn[] {
  return st.fullPushed ? all.filter((t) => (t.updatedAt ?? 0) > st.lastPushed) : all
}

export async function countPending(): Promise<number> {
  if (!syncReady()) return 0
  return pendingOf(await loadTxns(), getSyncState()).length
}

/**
 * Đẩy các khoản chưa sao lưu lên Sheet (lần đầu thì đẩy hết).
 * force = true: đẩy lại toàn bộ (dùng khi muốn viết lại cả Sheet theo cách ghép mới).
 */
export async function pushNow(force = false): Promise<{ pushed: number }> {
  const st = force ? { ...getSyncState(), fullPushed: false } : getSyncState()
  const [all, cats] = await Promise.all([loadTxns(), allCategories()])
  const pend = pendingOf(all, st)
  if (pend.length === 0) return { pushed: 0 }

  const custom = cats
    .filter((c) => c.id.startsWith('u-'))
    .map((c) => [c.id, c.name, c.kind, c.parentId ?? ''])

  for (let i = 0; i < pend.length; i += CHUNK) {
    await post('upsert', { rows: pend.slice(i, i + CHUNK).map((t) => toRow(t, cats)), categories: custom })
  }
  const lastPushed = Math.max(st.lastPushed, ...pend.map((t) => t.updatedAt ?? 0))
  setState({ fullPushed: true, lastPushed, lastAt: Date.now() })
  return { pushed: pend.length }
}

interface PullReply extends Reply {
  txns: Txn[]
  categories: { id: string; name: string; kind: 'thu' | 'chi'; parentId: string }[]
}

/** Kéo toàn bộ từ Sheet về máy này. Chỉ thêm hoặc cập nhật, không xóa gì đang có. */
export async function pullNow(): Promise<ImportResult> {
  const data = await post<PullReply>('pull')
  const result = await importBackup(
    JSON.stringify({
      app: 'thu-chi',
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: data.categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, parentId: c.parentId || null })),
      txns: data.txns,
    }),
  )
  // Mọi thứ vừa kéo về đã có sẵn trong Sheet, nên không cần đẩy lại.
  const lastPushed = Math.max(getSyncState().lastPushed, ...data.txns.map((t) => t.updatedAt ?? 0))
  setState({ fullPushed: true, lastPushed, lastAt: Date.now() })
  return result
}

/** Trạng thái hiển thị trên màn hình: không bật / chờ / đang gửi / xong / lỗi. */
export interface SyncStatus {
  phase: 'off' | 'idle' | 'syncing' | 'ok' | 'error'
  /** Lần sao lưu thành công gần nhất (mili giây), 0 nếu chưa có. */
  at: number
  msg: string
  pending: number
}

// ---------- Mã cài đặt: chuyển địa chỉ và mã bí mật sang điện thoại bằng một lần dán ----------
const CODE_PREFIX = 'thuchi1:'
const URL_RE = /^https:\/\/script\.google\.com\/.+\/exec$/

export const isSyncUrl = (u: string) => URL_RE.test(u.trim())

/** Đóng gói địa chỉ và mã bí mật đang lưu thành một chuỗi để dán sang máy khác. Coi nó như mật khẩu. */
export function makeSetupCode(): string {
  const raw = JSON.stringify({ u: getSyncUrl(), s: getSyncSecret() })
  const bytes = new TextEncoder().encode(raw)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return CODE_PREFIX + btoa(bin)
}

/** Đọc mã cài đặt; trả null nếu mã sai hoặc hỏng. */
export function parseSetupCode(code: string): { url: string; secret: string } | null {
  const c = code.trim()
  if (!c.startsWith(CODE_PREFIX)) return null
  try {
    const bin = atob(c.slice(CODE_PREFIX.length))
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))) as {
      u?: string
      s?: string
    }
    if (!o.u || !o.s || !isSyncUrl(o.u) || o.s.length < 12) return null
    return { url: o.u, secret: o.s }
  } catch {
    return null
  }
}
