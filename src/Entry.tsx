import { useMemo, useRef, useState } from 'react'
import type { Category, Kind, Txn } from './types'
import { parse, press, type Key } from './lib/amount'
import { vnd } from './lib/aggregate'
import { classify, guessKind } from './lib/classify'
import {
  labelOf,
  pathOf,
  rankByUse,
  recurringTemplates,
  selectable,
  timeStr,
  todayStr,
} from './lib/entry'
import { makeCategory, newCategoryName } from './lib/match'
import { parseQuick } from './lib/quick'

interface Props {
  categories: Category[]
  txns: Txn[]
  onAdd: (t: Txn) => void
  onUpdate: (t: Txn) => void
  onDelete: (id: string) => void
  onAddCategory: (c: Category) => void
  onRemoveCategory: (id: string) => void
}

// Bàn phím 4 cột: số ở 3 cột đầu, cột cuối là xóa lùi và đơn vị k, tr.
const KEYS: Key[] = [
  '7', '8', '9', 'back',
  '4', '5', '6', 'k',
  '1', '2', '3', 'tr',
  '000', '0',
]

const keyLabel = (k: Key) => (k === 'back' ? '⌫' : k)

const EXAMPLES = ['đổ xăng 70k', 'cà phê 30k, ăn trưa 50k', 'hôm qua mua cháo 45k', 'nhận lương 36tr']

/** Đang chọn danh mục để làm gì: gán cho khoản đang nhập tay, hoặc đổi mục của một khoản đã lưu. */
type Picking = null | { for: 'entry' } | { for: 'txn'; id: string }

interface Undo {
  txnIds: string[]
  catIds: string[]
  lines: string[]
}

export function Entry({
  categories,
  txns,
  onAdd,
  onUpdate,
  onDelete,
  onAddCategory,
  onRemoveCategory,
}: Props) {
  // ----- gõ nhanh -----
  const [quick, setQuick] = useState('')
  const [qErr, setQErr] = useState('')
  const quickRef = useRef<HTMLInputElement>(null)

  // ----- nhập tay bằng bàn phím số -----
  const [manual, setManual] = useState(false)
  const [kind, setKind] = useState<Kind>('chi')
  const [expr, setExpr] = useState('')
  const [catId, setCatId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [showWhen, setShowWhen] = useState(false)

  const [picking, setPicking] = useState<Picking>(null)
  const [undo, setUndo] = useState<Undo | null>(null)
  const undoTimer = useRef<number | undefined>(undefined)

  const showUndo = (u: Undo) => {
    window.clearTimeout(undoTimer.current)
    setUndo(u)
    undoTimer.current = window.setTimeout(() => setUndo(null), 9000)
  }

  const doUndo = () => {
    if (!undo) return
    undo.txnIds.forEach(onDelete)
    undo.catIds.forEach(onRemoveCategory)
    window.clearTimeout(undoTimer.current)
    setUndo(null)
  }

  const nameOf = (id: string, cats: Category[] = categories) => {
    const c = cats.find((x) => x.id === id)
    return c ? pathOf(c, cats) : id
  }

  const line = (cat: Category, amount: number, cats: Category[], isNew: boolean, d?: string) =>
    `${cat.kind === 'chi' ? 'Chi' : 'Thu'} ${vnd(amount)} · ${pathOf(cat, cats)}${isNew ? ' (mục mới)' : ''}${
      d && d !== todayStr() ? ` · ${d.slice(8)}/${d.slice(5, 7)}` : ''
    }`

  // ===== Gõ nhanh: "đổ xăng 70k, cà phê 30k hôm qua" =====
  const submitQuick = () => {
    const text = quick.trim()
    if (!text) return
    const res = parseQuick(text)
    if (res.error) {
      setQErr(res.error)
      return
    }
    setQErr('')

    let cats = categories
    const createdIds: string[] = []
    const addedIds: string[] = []
    const lines: string[] = []
    const base = Date.now()

    res.items.forEach((it, i) => {
      const hit = classify(it.note, cats, txns)
      let cat = hit?.category
      if (!cat) {
        cat = makeCategory(it.note, guessKind(it.note))
        cats = [...cats, cat]
        createdIds.push(cat.id)
        onAddCategory(cat)
      }
      const t: Txn = {
        id: crypto.randomUUID(),
        date: it.date,
        time: it.time,
        amount: it.amount,
        categoryId: cat.id,
        note: it.note,
        updatedAt: base + i,
      }
      onAdd(t)
      addedIds.push(t.id)
      lines.push(line(cat, it.amount, cats, !hit, it.date))
    })

    showUndo({ txnIds: addedIds, catIds: createdIds, lines })
    setQuick('')
    quickRef.current?.focus()
  }

  // ===== Nhập tay =====
  const amount = parse(expr)
  const cats = useMemo(
    () => rankByUse(selectable(categories, kind), txns),
    [categories, kind, txns],
  )
  const templates = useMemo(() => recurringTemplates(cats, txns), [cats, txns])
  const chosen = catId ? categories.find((c) => c.id === catId) : undefined
  const top = cats.slice(0, 6)
  const text = note.trim()

  const suggestion = useMemo(
    () => (manual && !catId && text ? classify(text, categories, txns, kind) : null),
    [manual, catId, text, kind, categories, txns],
  )

  const switchKind = (k: Kind) => {
    setKind(k)
    setCatId(null)
  }

  const canSave = amount > 0 && (!!chosen || text.length > 0)

  const saveManual = () => {
    if (!canSave) return
    let cat = chosen ?? suggestion?.category
    const created: string[] = []
    let all = categories
    const isNew = !cat
    if (!cat) {
      cat = makeCategory(text, kind)
      all = [...categories, cat]
      created.push(cat.id)
      onAddCategory(cat)
    }
    const now = new Date()
    const t: Txn = {
      id: crypto.randomUUID(),
      date: date ?? todayStr(now),
      time: time ?? timeStr(now),
      amount,
      categoryId: cat.id,
      note: text,
      updatedAt: now.getTime(),
    }
    onAdd(t)
    showUndo({ txnIds: [t.id], catIds: created, lines: [line(cat, amount, all, isNew, t.date)] })
    setExpr('')
    setCatId(null)
    setNote('')
    // Giữ lại ngày đã chọn để ghi bù nhiều khoản liên tiếp; giờ thì lấy lại theo lúc lưu.
    setTime(null)
  }

  // ===== Bảng chọn danh mục =====
  const pickFromSheet = (c: Category) => {
    if (picking?.for === 'entry') setCatId(c.id)
    else if (picking?.for === 'txn') {
      const t = txns.find((x) => x.id === picking.id)
      if (t) onUpdate({ ...t, categoryId: c.id, updatedAt: Date.now() })
    }
    setPicking(null)
  }

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

  const recent = useMemo(
    () =>
      txns
        .filter((t) => !t.summary && !t.deleted)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 5),
    [txns],
  )

  return (
    <div className="page entry">
      <form
        className="quick"
        onSubmit={(e) => {
          e.preventDefault()
          submitQuick()
        }}
      >
        <input
          ref={quickRef}
          className="quick-input"
          placeholder="Gõ nhanh, ví dụ: mua cháo 70k"
          value={quick}
          onChange={(e) => {
            setQuick(e.target.value)
            if (qErr) setQErr('')
          }}
          enterKeyHint="send"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Gõ nội dung và số tiền"
        />
        <button className="quick-go" type="submit" disabled={!quick.trim()}>
          Ghi
        </button>
      </form>
      {qErr ? (
        <div className="quick-err">{qErr}</div>
      ) : (
        <div className="chips quick-ex">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="chip tpl"
              onClick={() => {
                setQuick(ex)
                quickRef.current?.focus()
              }}
            >
              {ex}
            </button>
          ))}
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

      <button className="manual-toggle" onClick={() => setManual((v) => !v)}>
        {manual ? 'Thu gọn bàn phím số ▴' : 'Bàn phím số ▾'}
      </button>

      {manual && (
        <>
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
            <div className="picked">Đã chọn: {pathOf(chosen, categories)}</div>
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
                  Sẽ ghi vào <b>{pathOf(suggestion.category, categories)}</b>
                </>
              ) : (
                <>
                  Mục mới <b>{newCategoryName(text)}</b> sẽ được tạo trong Chưa phân loại
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
            <button className={`save ${kind}`} disabled={!canSave} onClick={saveManual}>
              {canSave
                ? `Lưu ${kind === 'chi' ? 'khoản chi' : 'khoản thu'} ${vnd(amount)} ₫`
                : amount > 0
                  ? 'Gõ nội dung hoặc chọn danh mục'
                  : 'Nhập số tiền'}
            </button>
          </div>
        </>
      )}

      {undo && (
        <div className="toast" role="status">
          <div className="toast-lines">
            <div className="toast-h">Đã ghi</div>
            {undo.lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
          <button className="toast-undo" onClick={doUndo}>
            Hoàn tác
          </button>
        </div>
      )}

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
                  <div className="t-main">{pathOf(c, categories)}</div>
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
