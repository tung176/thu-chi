import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Entry } from './Entry'
import { MonthTable } from './MonthTable'
import { Overview } from './Overview'
import { Settings } from './Settings'
import { CATEGORIES } from './data/categories'
import { delCategory, loadCategories, loadTxns, putMany, putTxn, replaceSummary } from './lib/db'
import {
  autoSyncOn,
  countPending,
  getSyncState,
  pushNow,
  syncReady,
  type SyncStatus,
} from './lib/sync'
import type { Category, History, Txn } from './types'

type Tab = 'entry' | 'overview' | 'table' | 'settings'

const pad = (n: number) => String(n).padStart(2, '0')

// Tháng hiện tại theo lịch của máy, tính một lần khi mở app.
const NOW = new Date()
const thisMonth = `${NOW.getFullYear()}-${pad(NOW.getMonth() + 1)}`

/**
 * Danh mục của bản app (nhóm, tên, cách xếp) luôn lấy theo code để cập nhật được khi app đổi;
 * danh mục bạn tự tạo (u-...) giữ nguyên từ bộ nhớ trong máy.
 */
function mergeCategories(stored: Category[]): Category[] {
  const seeded = new Set(CATEGORIES.map((c) => c.id))
  return [...CATEGORIES, ...stored.filter((c) => !seeded.has(c.id))]
}

/** Mọi tháng từ tháng đầu có dữ liệu đến tháng hiện tại của lịch. */
function monthRange(first: string, last: string): string[] {
  const out: string[] = []
  let y = Number(first.slice(0, 4))
  let m = Number(first.slice(5))
  const ly = Number(last.slice(0, 4))
  const lm = Number(last.slice(5))
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${pad(m)}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

export default function App() {
  const [tab, setTab] = useState<Tab>('entry')
  const [categories, setCategories] = useState<Category[]>(CATEGORIES)
  const [txns, setTxns] = useState<Txn[] | null>(null)
  const [started, setStarted] = useState(false)
  const [error, setError] = useState('')

  const importHistory = async (h: History) => {
    await replaceSummary(h.txns)
    setCategories(mergeCategories(await loadCategories()))
    setTxns((await loadTxns()).filter((t) => !t.deleted))
  }

  // Mở app: đọc dữ liệu trong máy. Khi chạy `npm run dev` thì nạp lại data/history.json.
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (import.meta.env.DEV) {
        try {
          const r = await fetch('/__data/history.json')
          if (r.ok && alive) {
            await importHistory((await r.json()) as History)
            return
          }
        } catch {
          // không có file thì dùng dữ liệu đã lưu
        }
      }
      const [t, c] = await Promise.all([loadTxns(), loadCategories()])
      if (!alive) return
      if (c.length > 0) setCategories(mergeCategories(c))
      setTxns(t.filter((x) => !x.deleted))
    })()
    return () => {
      alive = false
    }
  }, [])

  const onPick = async (file: File | undefined) => {
    if (!file) return
    try {
      await importHistory(JSON.parse(await file.text()) as History)
      setError('')
    } catch {
      setError('Không đọc được file này. Hãy chọn file history.json.')
    }
  }

  /** Đọc lại dữ liệu từ bộ nhớ trong máy (sau khi nhập file sao lưu). */
  const reload = async () => {
    const [t, c] = await Promise.all([loadTxns(), loadCategories()])
    setCategories(mergeCategories(c))
    setTxns(t.filter((x) => !x.deleted))
  }

  const addTxn = (t: Txn) => {
    setTxns((cur) => [...(cur ?? []), t])
    void putTxn(t)
  }

  const addCategory = (c: Category) => {
    setCategories((cur) => [...cur, c])
    void putMany('categories', [c])
  }

  const removeCategory = (id: string) => {
    setCategories((cur) => cur.filter((c) => c.id !== id))
    void delCategory(id)
  }

  const updateTxn = (t: Txn) => {
    setTxns((cur) => (cur ?? []).map((x) => (x.id === t.id ? t : x)))
    void putTxn(t)
  }

  const deleteTxn = (id: string) => {
    const t = txns?.find((x) => x.id === id)
    if (!t) return
    setTxns((cur) => (cur ?? []).filter((x) => x.id !== id))
    void putTxn({ ...t, deleted: true, updatedAt: Date.now() })
  }

  // ----- Sao lưu lên Google Sheets (nếu đã nhập địa chỉ Apps Script trong Cài đặt) -----
  const [sync, setSync] = useState<SyncStatus>(() => ({
    phase: syncReady() ? 'idle' : 'off',
    at: getSyncState().lastAt,
    msg: '',
    pending: 0,
  }))
  const syncing = useRef(false)

  const runSync = useCallback(async (force = false) => {
    if (!syncReady() || syncing.current) return
    if (!navigator.onLine) {
      setSync((s) => ({ ...s, phase: 'idle', msg: 'Chưa có mạng, sẽ sao lưu sau.' }))
      return
    }
    syncing.current = true
    setSync((s) => ({ ...s, phase: 'syncing', msg: '' }))
    try {
      await pushNow(force)
      setSync({ phase: 'ok', at: getSyncState().lastAt, msg: '', pending: await countPending() })
    } catch (e) {
      setSync((s) => ({ ...s, phase: 'error', msg: e instanceof Error ? e.message : 'Lỗi sao lưu.' }))
    } finally {
      syncing.current = false
    }
  }, [])

  const syncConfigChanged = useCallback(() => {
    setSync((s) => ({ ...s, phase: syncReady() ? 'idle' : 'off', msg: '', at: getSyncState().lastAt }))
  }, [])

  // Mỗi lần dữ liệu đổi (và khi mở app): đợi 3 giây rồi đẩy lên Sheet. Có mạng lại thì tự đẩy tiếp.
  useEffect(() => {
    if (!txns || !syncReady() || !autoSyncOn()) return
    void countPending().then((p) => setSync((s) => ({ ...s, pending: p })))
    const timer = setTimeout(() => void runSync(), 3000)
    return () => clearTimeout(timer)
  }, [txns, categories, runSync])

  useEffect(() => {
    const onOnline = () => {
      if (autoSyncOn()) void runSync()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [runSync])

  const syncLabel = (() => {
    if (sync.phase === 'off') return ''
    if (sync.phase === 'syncing') return 'Đang sao lưu…'
    if (sync.phase === 'error') return 'Lỗi sao lưu'
    if (sync.pending > 0) return `Chờ sao lưu ${sync.pending}`
    if (sync.at) {
      const d = new Date(sync.at)
      return `Đã sao lưu ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    return 'Chưa sao lưu'
  })()

  const { months, latest } = useMemo(() => {
    if (!txns || txns.length === 0) return { months: [thisMonth], latest: thisMonth }
    const ms = txns.map((t) => t.date.slice(0, 7)).sort()
    const lastData = ms[ms.length - 1]
    return {
      months: monthRange(ms[0], thisMonth > lastData ? thisMonth : lastData),
      latest: lastData,
    }
  }, [txns])

  if (txns === null) return <div className="app"><p className="hint">Đang tải…</p></div>

  if (txns.length === 0 && !started) {
    return (
      <div className="app">
        <header className="topbar"><h1>Thu Chi</h1></header>
        <div className="page">
          <p className="hint">
            Chưa có dữ liệu. Bạn có thể nạp lịch sử đã chuyển từ Google Sheet (history.json), hoặc bắt đầu ghi mới.
          </p>
          <input type="file" accept="application/json,.json" onChange={(e) => onPick(e.target.files?.[0])} />
          {error && <p className="chi">{error}</p>}
          <p>
            <button className="save thu" onClick={() => setStarted(true)}>Bắt đầu ghi mới</button>
          </p>
        </div>
      </div>
    )
  }

  const title =
    tab === 'entry' ? 'Nhập' : tab === 'overview' ? 'Tổng quan' : tab === 'table' ? 'Bảng tháng' : 'Cài đặt'

  return (
    <div className="app">
      <header className="topbar">
        <h1>{title}</h1>
        {syncLabel && (
          <button className={`sync-pill ${sync.phase}`} onClick={() => setTab('settings')} title={sync.msg}>
            {syncLabel}
          </button>
        )}
      </header>
      <main className="main">
        {tab === 'entry' && (
          <Entry
            categories={categories}
            txns={txns}
            onAdd={addTxn}
            onUpdate={updateTxn}
            onDelete={deleteTxn}
            onAddCategory={addCategory}
            onRemoveCategory={removeCategory}
          />
        )}
        {tab === 'overview' && (
          <Overview categories={categories} txns={txns} months={months} initialMonth={latest} />
        )}
        {tab === 'table' && (
          <>
            <p className="hint">Vuốt ngang để xem các tháng. Chạm tên nhóm để mở/gập, chạm một ô số để xem giao dịch.</p>
            <MonthTable categories={categories} txns={txns} months={months} currentMonth={thisMonth} />
          </>
        )}
        {tab === 'settings' && (
          <Settings
            onImported={reload}
            sync={sync}
            onSyncNow={(force) => runSync(force)}
            onSyncConfigChanged={syncConfigChanged}
          />
        )}
      </main>
      <nav className="tabbar">
        <button className={tab === 'entry' ? 'on' : ''} onClick={() => setTab('entry')}>
          Nhập
        </button>
        <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>
          Tổng quan
        </button>
        <button className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>
          Bảng tháng
        </button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>
          Cài đặt
        </button>
      </nav>
    </div>
  )
}
