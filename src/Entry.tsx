import { useMemo, useState } from 'react'
import type { Category, Kind, Txn } from './types'
import { parse, press, type Key } from './lib/amount'
import { vnd } from './lib/aggregate'
import {
  labelOf,
  rankByUse,
  recurringTemplates,
  selectable,
  timeStr,
  todayStr,
} from './lib/entry'

interface Props {
  categories: Category[]
  txns: Txn[]
  onAdd: (t: Txn) => void
  onDelete: (id: string) => void
}

// Bàn phím 4 cột: số ở 3 cột đầu, cột cuối là xóa lùi và đơn vị k, tr.
const KEYS: Key[] = [
  '7', '8', '9', 'back',
  '4', '5', '6', 'k',
  '1', '2', '3', 'tr',
  '000', '0',
]

const keyLabel = (k: Key) => (k === 'back' ? '⌫' : k)

export function Entry({ categories, txns, onAdd, onDelete }: Props) {
  const [kind, setKind] = useState<Kind>('chi')
  const [expr, setExpr] = useState('')
  const [catId, setCatId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [showWhen, setShowWhen] = useState(false)
  const [toast, setToast] = useState('')

  const amount = parse(expr)
  const cats = useMemo(
    () => rankByUse(selectable(categories, kind), txns),
    [categories, kind, txns],
  )
  const templates = useMemo(() => recurringTemplates(cats, txns), [cats, txns])
  const chosen = catId ? categories.find((c) => c.id === catId) : undefined
  const top = cats.slice(0, 6)

  const recent = useMemo(
    () =>
      txns
        .filter((t) => !t.summary && !t.deleted)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 5),
    [txns],
  )

  const switchKind = (k: Kind) => {
    setKind(k)
    setCatId(null)
  }

  const canSave = amount > 0 && !!chosen

  const save = () => {
    if (!canSave || !chosen) return
    const now = new Date()
    onAdd({
      id: crypto.randomUUID(),
      date: date ?? todayStr(now),
      time: time ?? timeStr(now),
      amount,
      categoryId: chosen.id,
      note: note.trim(),
      updatedAt: now.getTime(),
    })
    setToast(`Đã lưu ${kind === 'chi' ? 'khoản chi' : 'khoản thu'} ${vnd(amount)} ₫`)
    setTimeout(() => setToast(''), 2200)
    setExpr('')
    setCatId(null)
    setNote('')
    // Giữ lại ngày đã chọn để ghi bù nhiều khoản liên tiếp; giờ thì lấy lại theo lúc lưu.
    setTime(null)
  }

  const nameOf = (id: string) => {
    const c = categories.find((x) => x.id === id)
    return c ? labelOf(c, categories) : id
  }

  return (
    <div className="page entry">
      <div className="seg" role="tablist">
        <button className={kind === 'chi' ? 'on chi' : ''} onClick={() => switchKind('chi')}>
          Chi
        </button>
        <button className={kind === 'thu' ? 'on thu' : ''} onClick={() => switchKind('thu')}>
          Thu
        </button>
      </div>

      <div className="amt-box">
        <div className={`amt ${kind}`} aria-live="polite">
          {vnd(amount)} <span className="cur">₫</span>
        </div>
        <div className="amt-expr muted">{/[a-z]/.test(expr) ? `Gõ: ${expr}` : ' '}</div>
      </div>

      {templates.length > 0 && (
        <>
          <div className="mini">Lặp lại hằng tháng</div>
          <div className="chips">
            {templates.map((t) => (
              <button
                key={t.category.id}
                className="chip tpl"
                onClick={() => {
                  setCatId(t.category.id)
                  setExpr(String(t.amount))
                }}
              >
                {labelOf(t.category, categories)} · {vnd(t.amount)}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mini">Danh mục</div>
      <div className="chips">
        {top.map((c) => (
          <button
            key={c.id}
            className={`chip ${catId === c.id ? 'sel' : ''}`}
            onClick={() => setCatId(c.id)}
          >
            {labelOf(c, categories)}
          </button>
        ))}
        {cats.length > top.length && (
          <button className="chip more" onClick={() => setShowAll(true)}>
            Tất cả ›
          </button>
        )}
      </div>
      {chosen && !top.some((c) => c.id === chosen.id) && (
        <div className="picked">Đã chọn: {labelOf(chosen, categories)}</div>
      )}

      <div className="when">
        <input
          className="note"
          placeholder="Ghi chú (tùy chọn)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="chip" onClick={() => setShowWhen((v) => !v)}>
          {date && date !== todayStr() ? date.split('-').reverse().join('/') : 'Hôm nay'}
        </button>
      </div>
      {showWhen && (
        <div className="when-pick">
          <label>
            Ngày
            <input type="date" value={date ?? todayStr()} max={todayStr()} onChange={(e) => setDate(e.target.value || null)} />
          </label>
          <label>
            Giờ
            <input type="time" value={time ?? timeStr()} onChange={(e) => setTime(e.target.value || null)} />
          </label>
          <button className="chip" onClick={() => { setDate(null); setTime(null) }}>
            Về hiện tại
          </button>
        </div>
      )}

      {recent.length > 0 && (
        <>
          <div className="mini recent-h">Vừa nhập</div>
          <ul className="recent">
            {recent.map((t) => {
              const isChi = categories.find((c) => c.id === t.categoryId)?.kind === 'chi'
              return (
                <li key={t.id}>
                  <div className="r-main">
                    <div>{nameOf(t.categoryId)}</div>
                    <div className="muted r-sub">
                      {t.date.slice(8)}/{t.date.slice(5, 7)} {t.time}
                      {t.note ? ` · ${t.note}` : ''}
                    </div>
                  </div>
                  <div className={`r-amt ${isChi ? 'chi' : 'thu'}`}>
                    {isChi ? '−' : '+'}
                    {vnd(t.amount)}
                  </div>
                  <button
                    className="r-del"
                    aria-label="Xóa khoản này"
                    onClick={() => {
                      if (window.confirm('Xóa khoản này?')) onDelete(t.id)
                    }}
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="dock">
        <div className="pad">
          {KEYS.map((k) => (
            <button
              key={k}
              className={`key ${k === 'k' || k === 'tr' ? 'unit' : ''}`}
              onClick={() => setExpr((e) => press(e, k))}
            >
              {keyLabel(k)}
            </button>
          ))}
          <button className="key unit clr span2" onClick={() => setExpr('')}>
            Xóa hết
          </button>
        </div>
        <button className={`save ${kind}`} disabled={!canSave} onClick={save}>
          {canSave
            ? `Lưu ${kind === 'chi' ? 'khoản chi' : 'khoản thu'} ${vnd(amount)} ₫`
            : amount > 0
              ? 'Chọn danh mục để lưu'
              : 'Nhập số tiền'}
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {showAll && (
        <div className="backdrop" onClick={() => setShowAll(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <div className="sheet-title">Tất cả danh mục {kind === 'chi' ? 'chi' : 'thu'}</div>
              <button className="close" onClick={() => setShowAll(false)} aria-label="Đóng">✕</button>
            </div>
            <ul className="txn-list">
              {cats.map((c) => (
                <li
                  key={c.id}
                  className="pick"
                  onClick={() => {
                    setCatId(c.id)
                    setShowAll(false)
                  }}
                >
                  <div className="t-main">{labelOf(c, categories)}</div>
                  {catId === c.id && <div className="thu">✓</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
