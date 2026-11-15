import { useMemo, useState } from 'react'
import type { Category, Txn } from './types'
import { vnd } from './lib/aggregate'
import { pathOf } from './lib/entry'
import { eventDay } from './lib/overdraft'

interface Props {
  categories: Category[]
  txns: Txn[]
  /** Mọi tháng có thể xem, từ cũ đến mới. */
  months: string[]
  /** Tháng hiện tại theo lịch của máy (YYYY-MM). */
  thisMonth: string
  /** Hôm nay (YYYY-MM-DD). */
  today: string
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
  /** Vay (+) hoặc trả (−) thấu chi trong ngày: hiện riêng, không cộng vào Thu/Chi. */
  loans: number[]
}

/** Mỗi ngày thu chi bao nhiêu. Chỉ tính khoản ghi theo từng ngày; số tổng hợp tháng (từ file Sheet cũ) không có ngày thật nên không đưa vào đây. */
export function DayView({ categories, txns, months, thisMonth, today }: Props) {
  const real = useMemo(() => txns.filter((t) => !t.summary), [txns])
  const initial = useMemo(() => {
    const withData = real.map((t) => t.date.slice(0, 7)).sort()
    return withData[withData.length - 1] ?? thisMonth
  }, [real, thisMonth])

  const [month, setMonth] = useState(initial)
  const [open, setOpen] = useState<string | null>(null)

  const idx = months.indexOf(month)
  const kindOf = (id: string) => categories.find((c) => c.id === id)?.kind

  const { days, totalChi, totalThu } = useMemo(() => {
    const map = new Map<string, Day>()
    let chi = 0
    let thu = 0
    for (const t of real) {
      if (!t.date.startsWith(month)) continue
      const d = map.get(t.date) ?? { chi: 0, thu: 0, items: [], loans: [] }
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
    for (const c of categories) {
      for (const e of c.overdraft?.events ?? []) {
        const day = eventDay(e)
        if (!day.startsWith(month)) continue
        const dd = map.get(day) ?? { chi: 0, thu: 0, items: [], loans: [] }
        dd.loans.push(e.amount)
        map.set(day, dd)
      }
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
                  <div className="day-sub muted">{d.items.length + d.loans.length} khoản</div>
                </div>
                <div className="day-amt">
                  {d.chi > 0 && <div className="chi">−{vnd(d.chi)}</div>}
                  {d.thu > 0 && <div className="thu">+{vnd(d.thu)}</div>}
                  {d.loans.length > 0 && (
                    <div className="loan">
                      {d.loans.reduce((s, x) => s + x, 0) >= 0 ? '+' : '−'}
                      {vnd(Math.abs(d.loans.reduce((s, x) => s + x, 0)))} thấu chi
                    </div>
                  )}
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
                  {d.loans.map((x, i) => (
                    <li key={`loan-${i}`}>
                      <div className="di-main">
                        <div>{x > 0 ? 'Vay thấu chi' : 'Trả gốc thấu chi'}</div>
                        <div className="muted di-sub">Khoản vay, không tính vào Thu/Chi</div>
                      </div>
                      <div className="di-amt loan">
                        {x > 0 ? '+' : '−'}
                        {vnd(Math.abs(x))}
                      </div>
                    </li>
                  ))}
                  {d.items.map((t) => {
                    const cat = categories.find((c) => c.id === t.categoryId)
                    const isThu = cat?.kind === 'thu'
                    return (
                      <li key={t.id}>
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
