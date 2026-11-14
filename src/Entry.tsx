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
import { makeCategory, matchNote, newCategoryName } from './lib/match'

interface Props {
  categories: Category[]
  txns: Txn[]
  onAdd: (t: Txn) => void
  onUpdate: (t: Txn) => void
  onDelete: (id: string) => void
  onAddCategory: (c: Category) => void
}

// Bàn phím 4 cột: số ở 3 cột đầu, cột cuối là xóa lùi và đơn vị k, tr.
const KEYS: Key[] = [
  '7', '8', '9', 'back',
  '4', '5', '6', 'k',
  '1', '2', '3', 'tr',
  '000', '0',
]

const keyLabel = (k: Key) => (k === 'back' ? '⌫' : k)

/** Đang chọn danh mục để làm gì: gán cho khoản đang nhập, hoặc đổi mục của một khoản đã lưu. */
type Picking = null | { for: 'entry' } | { for: 'txn'; id: string }

export function Entry({ categories, txns, onAdd, onUpdate, onDelete, onAddCategory }: Props) {
  const [kind, setKind] = useState<Kind>('chi')
  const [expr, setExpr] = useState('')
  const [catId, setCatId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [picking, setPicking] = useState<Picking>(null)
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
  const text = note.trim()

  // Chưa chọn danh mục mà đã gõ nội dung: app đoán mục phù hợp, không có thì sẽ tạo mục mới.
  const suggestion = useMemo(
    () => (!catId && text ? matchNote(text, kind, categories, txns) : null),
    [catId, text, kind, categories, txns],
  )

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

  const canSave = amount > 0 && (!!chosen || text.length > 0)

  const save = () => {
    if (!canSave) return
    let cat = chosen ?? suggestion?.category
    let created = false
    if (!cat) {
      cat = makeCategory(text, kind)
      onAddCategory(cat)
      created = true
    }
    const now = new Date()
    onAdd({
      id: crypto.randomUUID(),
      date: date ?? todayStr(now),
      time: time ?? timeStr(now),
      amount,
      categoryId: cat.id,
      note: text,
      updatedAt: now.getTime(),
    })
    setToast(
      `Đã lưu ${vnd(amount)} ₫ vào ${labelOf(cat, [...categories, cat])}${created ? ' (mục mới)' : ''}`,
    )
    setTimeout(() => setToast(''), 3200)
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

  const pickFromSheet = (c: Category) => {
    if (picking?.for === 'entry') setCatId(c.id)
    else if (picking?.for === 'txn') {
      const t = txns.find((x) => x.id === picking.id)
      if (t) onUpdate({ ...t, categoryId: c.id, updatedAt: Date.now() })
    }
    setPicking(null)
  }

  // Danh sách trong bảng chọn: theo loại của khoản đang nhập, hoặc loại của khoản đang đổi mục.
  const sheetKind: Kind =
    picking?.for === 'txn'
      ? (categories.find((c) => c.id === txns.find((t) => t.id === picking.id)?.categoryId)?.kind ?? kind)
      : kind
  const sheetCats = useMemo(
    () => rankByUse(selectable(categories, sheetKind), txns),
    [categories, sheetKind, txns],
  )
  const sheetCurrent =
    picking?.for === 'txn' ? txns.find((t) => t.id === picking.id)?.categoryId : catId

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

      <div className="mini">Danh mục (không bắt buộc)</div>
      <div className="chips">
        {top.map((c) => (
          <button
            key={c.id}
            className={`chip ${catId === c.id ? 'sel' : ''}`}
            onClick={() => setCatId(catId === c.id ? null : c.id)}
          >
            {labelOf(c, categories)}
          </button>
        ))}
        {cats.length > top.length && (
          <button className="chip more" onClick={() => setPicking({ for: 'entry' })}>
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
          placeholder="Nội dung, ví dụ: xăng xe máy"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="chip" onClick={() => setShowWhen((v) => !v)}>
          {date && date !== todayStr() ? date.split('-').reverse().join('/') : 'Hôm nay'}
        </button>
      </div>
      {!chosen && text && (
        <div className="suggest">
          {suggestion ? (
            <>
              Sẽ ghi vào <b>{labelOf(suggestion.category, categories)}</b>
            </>
          ) : (
            <>
              Mục mới <b>{newCategoryName(text)}</b> sẽ được tạo trong {kind === 'chi' ? 'Phát sinh' : 'Thu phát sinh'}
            </>
          )}
        </div>
      )}
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
          <div className="mini recent-h">Vừa nhập (chạm tên mục để đổi)</div>
          <ul className="recent">
            {recent.map((t) => {
              const isChi = categories.find((c) => c.id === t.categoryId)?.kind === 'chi'
              return (
                <li key={t.id}>
                  <div className="r-main">
                    <button className="r-cat" onClick={() => setPicking({ for: 'txn', id: t.id })}>
                      {nameOf(t.categoryId)}
                    </button>
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
              ? 'Gõ nội dung hoặc chọn danh mục'
              : 'Nhập số tiền'}
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {picking && (
        <div className="backdrop" onClick={() => setPicking(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <div className="sheet-title">
                {picking.for === 'txn' ? 'Đổi danh mục' : 'Tất cả danh mục'} {sheetKind === 'chi' ? 'chi' : 'thu'}
              </div>
              <button className="close" onClick={() => setPicking(null)} aria-label="Đóng">✕</button>
            </div>
            <ul className="txn-list">
              {sheetCats.map((c) => (
                <li key={c.id} className="pick" onClick={() => pickFromSheet(c)}>
                  <div className="t-main">{labelOf(c, categories)}</div>
                  {sheetCurrent === c.id && <div className="thu">✓</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
