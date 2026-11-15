import { useState } from 'react'
import type { Category, Txn } from './types'
import { parse } from './lib/amount'
import { vnd } from './lib/aggregate'
import { timeStr } from './lib/entry'
import { balanceOn, eventDay, interestTo, nextDay, OD_LABEL, OD_PARENT, type OdEvent, type Overdraft as OdData } from './lib/overdraft'

interface Props {
  categories: Category[]
  today: string
  onSave: (c: Category) => void
  onRemove: (id: string) => void
  onAddTxn: (t: Txn) => void
}

function toAmount(s: string): number {
  const t = s.trim().toLowerCase().replace(/[.,\s]/g, '').replace(/(đ|d|vnd)$/, '')
  if (!t) return 0
  return /^\d+$/.test(t) ? Number(t) : parse(t)
}

const plusDays = (s: string, n: number) =>
  new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n)).toISOString().slice(0, 10)
const dmy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`

/** Khoản rút ngày 14/11/2026; lãi tính từ hôm sau (15/11) theo lời bạn. */
const DEFAULT_START = '2026-11-14'
/** 13%/năm là mức trong ví dụ của trang Techcombank, chỉ để ước tính tạm; sửa khi có biên lai. */
const DEFAULT_RATE = '13'

export function Overdraft({ categories, today, onSave, onRemove, onAddTxn }: Props) {
  const cat = categories.find((c) => c.overdraft)
  const od = cat?.overdraft
  const [amount, setAmount] = useState('25000000')
  const [start, setStart] = useState(DEFAULT_START)
  const [rate, setRate] = useState(DEFAULT_RATE)
  const [future, setFuture] = useState(plusDays(today, 30))
  const [evKind, setEvKind] = useState<'draw' | 'pay'>('pay')
  const [evAmount, setEvAmount] = useState('')
  const [evDate, setEvDate] = useState(today)
  const [msg, setMsg] = useState('')

  const save = (next: OdData) => {
    if (!cat) return
    onSave({ ...cat, overdraft: next })
  }

  const create = () => {
    const a = toAmount(amount)
    const r = Number(rate.replace(',', '.'))
    if (!(a > 0) || !(r > 0 && r < 100) || !start) {
      setMsg('Nhập số tiền, ngày bắt đầu tính lãi và lãi suất (%/năm) cho đúng.')
      return
    }
    onSave({
      id: `u-${crypto.randomUUID().slice(0, 8)}`,
      name: OD_LABEL,
      kind: 'chi',
      parentId: OD_PARENT,
      archived: true,
      overdraft: { rate: r, events: [{ date: nextDay(start), amount: a }] },
    })
    setMsg('')
  }

  if (!cat || !od) {
    return (
      <section className="card">
        <div className="card-head">
          <h2>Thấu chi</h2>
        </div>
        <p className="muted small">
          Tiền rút thấu chi là khoản vay, không tính vào Thu. Lãi = dư nợ × lãi suất ÷ 365 × số ngày, tính từ ngày hôm sau ngày rút.
        </p>
        <label className="field">
          Số tiền rút (₫)
          <input className="note" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          Ngày rút
          <input type="date" className="note" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          Lãi suất (%/năm)
          <input className="note" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <p className="muted small">
          13% là mức ví dụ trên trang Techcombank, chỉ để ước tính tạm. Khi có biên lai hoặc hợp đồng, sửa lại lãi suất đúng.
        </p>
        <button className="save thu" onClick={create}>
          Tạo khoản thấu chi
        </button>
        {msg && <div className="msg bad">{msg}</div>}
      </section>
    )
  }

  const bal = balanceOn(od, today)
  const now = interestTo(od, today)
  const fut = interestTo(od, future)
  const futBal = balanceOn(od, future)
  const sorted = [...od.events].sort((a, b) => eventDay(a).localeCompare(eventDay(b)))

  const addEvent = () => {
    const a = toAmount(evAmount)
    if (!(a > 0) || !evDate) {
      setMsg('Nhập số tiền và ngày cho đúng.')
      return
    }
    const ev: OdEvent = evKind === 'draw' ? { date: nextDay(evDate), amount: a } : { date: evDate, amount: -a }
    save({ ...od, events: [...od.events, ev] })
    setEvAmount('')
    setMsg('')
  }

  const recordInterest = () => {
    if (now.interest <= 0) return
    if (!window.confirm(`Ghi ${vnd(now.interest)} ₫ tiền lãi vào mục "Phí ngân hàng, lãi" hôm nay?`)) return
    onAddTxn({
      id: crypto.randomUUID(),
      date: today,
      time: timeStr(new Date()),
      amount: now.interest,
      categoryId: OD_PARENT,
      note: 'Lãi thấu chi',
      updatedAt: Date.now(),
    })
    setMsg('Đã ghi tiền lãi vào chi.')
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Thấu chi</h2>
        <span className="muted">{od.rate}%/năm</span>
      </div>
      <p>
        Dư nợ gốc hôm nay: <b>{vnd(bal)} ₫</b>
      </p>
      <p>
        Lãi đến hôm nay: <b className="chi">{vnd(now.interest)} ₫</b> <span className="muted small">({now.days} ngày)</span>
      </p>
      <p>
        Nếu trả hết hôm nay: <b>{vnd(bal + now.interest)} ₫</b>
      </p>
      <label className="field">
        Dự kiến trả vào ngày
        <input type="date" className="note" value={future} min={today} onChange={(e) => setFuture(e.target.value || today)} />
      </label>
      <p className="muted small">
        Đến {dmy(future)}: gốc {vnd(futBal)} ₫ + lãi {vnd(fut.interest)} ₫ ({fut.days} ngày) = <b>{vnd(futBal + fut.interest)} ₫</b>
      </p>
      <div className="mini">Các lần rút / trả</div>
      {sorted.map((e, i) => (
        <div className="plan-sub muted small" key={`${e.date}-${i}`}>
          {dmy(eventDay(e))} · {e.amount > 0 ? 'Rút' : 'Trả bớt'} {vnd(Math.abs(e.amount))} ₫{' '}
          <button
            className="r-del"
            aria-label="Xóa dòng này"
            onClick={() => {
              if (window.confirm('Xóa dòng này?')) save({ ...od, events: od.events.filter((x) => x !== e) })
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <details className="adv">
        <summary>Rút thêm, trả bớt, sửa lãi suất</summary>
        <label className="field">
          Loại
          <select className="note" value={evKind} onChange={(e) => setEvKind(e.target.value as 'draw' | 'pay')}>
            <option value="pay">Trả bớt gốc</option>
            <option value="draw">Rút thêm</option>
          </select>
        </label>
        <label className="field">
          Số tiền (₫)
          <input className="note" inputMode="numeric" value={evAmount} onChange={(e) => setEvAmount(e.target.value)} />
        </label>
        <label className="field">
          Ngày rút / ngày trả
          <input type="date" className="note" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
        </label>
        <button className="save thu" onClick={addEvent}>
          Thêm
        </button>
        <label className="field">
          Lãi suất (%/năm)
          <input
            className="note"
            inputMode="decimal"
            defaultValue={od.rate}
            onBlur={(e) => {
              const r = Number(e.target.value.replace(',', '.'))
              if (r > 0 && r < 100 && r !== od.rate) save({ ...od, rate: r })
            }}
          />
        </label>
        <button className="save chi" disabled={now.interest <= 0} onClick={recordInterest}>
          Ghi tiền lãi {vnd(now.interest)} ₫ vào chi
        </button>
        <button
          className="save"
          onClick={() => {
            if (window.confirm('Xóa khoản thấu chi này?')) onRemove(cat.id)
          }}
        >
          Xóa khoản thấu chi
        </button>
      </details>
      {msg && <div className="msg ok">{msg}</div>}
    </section>
  )
}
