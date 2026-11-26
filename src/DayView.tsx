import { useMemo, useState } from 'react'
import type { Category, Txn } from './types'
import { vnd } from './lib/aggregate'
import { pathOf } from './lib/entry'

interface Props {
  categories: Category[]
  txns: Txn[]
  /** Khoản thật đang lưu trong máy: chỉ những khoản này mới đổi ngày được. */
  realTxns: Txn[]
  /** Mọi tháng có thể xem, từ cũ đến mới. */
  months: string[]
  /** Tháng hiện tại theo lịch của máy (YYYY-MM). */
  thisMonth: string
  /** Hôm nay (YYYY-MM-DD). */
  today: string
  onUpdate: (t: Txn) => void
}

const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

const monthTitle = (m: string) => `Tháng ${Number(m.slice(5))}/${m.slice(0, 4)}`
const daysIn = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)), 0).getDate()

function dayLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return { weekday: WEEKDAY[new Date(y, m - 1, d).getDay()], short: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` }
}

interface Day {
  chi: number
  thu: number
  items: Txn[]
}

/** Mỗi ngày thu chi bao nhiêu. Chỉ tính khoản ghi theo từng ngày; số tổng hợp tháng (từ file Sheet cũ) không có ngày thật nên không đưa vào đây. */
export function DayView({ categories, txns, realTxns, months, thisMonth, today, onUpdate }: Props) {
  const real = useMemo(() => txns.filter((t) => !t.summary), [txns])
  const initial = useMemo(() => {
    const withData = real.map((t) => t.date.slice(0, 7)).filter((m) => m <= thisMonth).sort()
    return withData[withData.length - 1] ?? thisMonth
  }, [real, thisMonth])

  const [month, setMonth] = useState(initial)
  const [open, setOpen] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ id: string; date: string } | null>(null)
  const [movedMsg, setMovedMsg] = useState('')
  const editable = useMemo(() => new Set(realTxns.map((t) => t.id)), [realTxns])

  const saveDate = (id: string) => {
    const t = realTxns.find((x) => x.id === id)
    const date = edit?.date
    setEdit(null)
    if (!t || !date || date === t.date) return
    onUpdate({ ...t, date, updatedAt: Date.now() })
    setMovedMsg(`Đã chuyển sang ngày ${date.split('-').reverse().join('/')}`)
  }

  const idx = months.indexOf(month)
  const kindOf = (id: string) => categories.find((c) => c.id === id)?.kind

  const { days, totalChi, totalThu } = useMemo(() => {
    const map = new Map<string, Day>()
    let chi = 0
    let thu = 0
    for (const t of real) {
      if (!t.date.startsWith(month)) continue
      const d = map.get(t.date) ?? { chi: 0, thu: 0, items: [] }
      if (kindOf(t.categoryId) === 'thu') {
        d.thu += t.amount
        thu += t.amount
      } else {
        d.chi += t.amount
        chi += t.amount
      }
      d.items.push(t)
      map.set(t.date, d)
    }
    const list = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    for (const [, d] of list) d.items.sort((a, b) => b.time.localeCompare(a.time))
    return { days: list, totalChi: chi, totalThu: thu }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real, month, categories])

  const summaryOnly = days.length === 0 && txns.some((t) => t.summary && t.date.startsWith(month))
  const elapsed = month === thisMonth ? Number(today.slice(8)) : daysIn(month)
  const avg = elapsed > 0 ? Math.round(totalChi / elapsed) : 0
  const maxChi = Math.max(1, ...days.map(([, d]) => d.chi))

  return (
    <div className="page">
      <div className="ov-head">
        <button className="nav" disabled={idx <= 0} onClick={() => setMonth(months[idx - 1])} aria-label="Tháng trước">
          ‹
        </button>
        <div className="ov-title">{monthTitle(month)}</div>
        <button
          className="nav"
          disabled={idx < 0 || idx >= months.length - 1}
          onClick={() => setMonth(months[idx + 1])}
          aria-label="Tháng sau"
        >
          ›
        </button>
      </div>

      <div className="tiles">
        <div className="tile">
          <div className="tile-l">Chi</div>
          <div className="tile-v chi">{vnd(totalChi)}</div>
        </div>
        <div className="tile">
          <div className="tile-l">Thu</div>
          <div className="tile-v thu">{vnd(totalThu)}</div>
        </div>
        <div className="tile wide">
          <div className="tile-l">
            Chi trung bình mỗi ngày ({elapsed} ngày{month === thisMonth ? ' tính đến hôm nay' : ''})
          </div>
          <div className="tile-v big">{vnd(avg)} ₫</div>
        </div>
      </div>

      {movedMsg && (
        <div className="msg ok" role="status">
          {movedMsg}
        </div>
      )}

      {summaryOnly && (
        <p className="muted notice">
          Tháng này chỉ có số tổng hợp theo tháng (nhập từ file Sheet cũ), chưa có chi tiết từng ngày. Xem ở tab Bảng tháng.
        </p>
      )}
      {!summaryOnly && days.length === 0 && <p className="muted notice">Chưa có khoản nào trong tháng này.</p>}

      <ul className="days">
        {days.map(([date, d]) => {
          const { weekday, short } = dayLabel(date)
          const isOpen = open === date
          return (
            <li key={date} className="day">
              <button className="day-row" onClick={() => setOpen(isOpen ? null : date)} aria-expanded={isOpen}>
                <div className="day-main">
                  <div className="day-name">
                    {weekday}, {short}
                    {date === today && <span className="day-today">Hôm nay</span>}
                  </div>
                  <div className="day-sub muted">{d.items.length} khoản</div>
                </div>
                <div className="day-amt">
                  {d.chi > 0 && <div className="chi">−{vnd(d.chi)}</div>}
                  {d.thu > 0 && <div className="thu">+{vnd(d.thu)}</div>}
                </div>
                <span className="caret">{isOpen ? '▾' : '▸'}</span>
              </button>
              {d.chi > 0 && (
                <div className="day-bar">
                  <div style={{ width: `${Math.max(2, (d.chi / maxChi) * 100)}%` }} />
                </div>
              )}
              {isOpen && (
                <ul className="day-items">
                  {d.items.map((t) => {
                    const cat = categories.find((c) => c.id === t.categoryId)
                    const isThu = cat?.kind === 'thu'
                    return (
                      <li
                        key={t.id}
                        className={editable.has(t.id) ? 'tap' : undefined}
                        onClick={() => {
                          if (!editable.has(t.id) || edit?.id === t.id) return
                          setMovedMsg('')
                          setEdit({ id: t.id, date: t.date })
                        }}
                      >
                        <div className="di-main">
                          <div>{t.note || (cat ? pathOf(cat, categories) : t.categoryId)}</div>
                          <div className="muted di-sub">
                            {t.time}
                            {cat && t.note ? ` · ${pathOf(cat, categories)}` : ''}
                          </div>
                        </div>
                        <div className={`di-amt ${isThu ? 'thu' : 'chi'}`}>
                          {isThu ? '+' : '−'}
                          {vnd(t.amount)}
                        </div>
                        {edit?.id === t.id && (
                          <div className="di-edit" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="date"
                              aria-label="Ngày của khoản này"
                              value={edit.date}
                              onChange={(e) => setEdit({ id: t.id, date: e.target.value })}
                            />
                            <button className="chip sel" disabled={!edit.date} onClick={() => saveDate(t.id)}>
                              Đổi ngày
                            </button>
                            <button className="chip" onClick={() => setEdit(null)}>
                              Hủy
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
