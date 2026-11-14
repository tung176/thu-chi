import { useEffect, useMemo, useState } from 'react'
import { Entry } from './Entry'
import { MonthTable } from './MonthTable'
import { Overview } from './Overview'
import { CATEGORIES } from './data/categories'
import { loadCategories, loadTxns, putTxn, replaceSummary } from './lib/db'
import type { Category, History, Txn } from './types'

type Tab = 'entry' | 'overview' | 'table'

const pad = (n: number) => String(n).padStart(2, '0')

// Tháng hiện tại theo lịch của máy, tính một lần khi mở app.
const NOW = new Date()
const thisMonth = `${NOW.getFullYear()}-${pad(NOW.getMonth() + 1)}`

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
    await replaceSummary(h.txns, h.categories)
    setCategories(h.categories)
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
      if (c.length > 0) setCategories(c)
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

  const addTxn = (t: Txn) => {
    setTxns((cur) => [...(cur ?? []), t])
    void putTxn(t)
  }

  const deleteTxn = (id: string) => {
    const t = txns?.find((x) => x.id === id)
    if (!t) return
    setTxns((cur) => (cur ?? []).filter((x) => x.id !== id))
    void putTxn({ ...t, deleted: true, updatedAt: Date.now() })
  }

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

  const title = tab === 'entry' ? 'Nhập' : tab === 'overview' ? 'Tổng quan' : 'Bảng tháng'

  return (
    <div className="app">
      <header className="topbar">
        <h1>{title}</h1>
      </header>
      <main className="main">
        {tab === 'entry' && (
          <Entry categories={categories} txns={txns} onAdd={addTxn} onDelete={deleteTxn} />
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
      </nav>
    </div>
  )
}
