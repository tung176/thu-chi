import { useEffect, useMemo, useRef, useState } from 'react'
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
import { makeCategory, newCategoryName, normalize } from './lib/match'
import { aiReady, AiError, classifyWithAI, type AiResult } from './lib/ai'
import { PHATSINH } from './data/categories'
import { parseQuick } from './lib/quick'
import { loanIntent, nextDay, withLoanEvent } from './lib/overdraft'

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

/** Cách một khoản được xếp: '' = mục có sẵn, 'new' = mục mới app tạo, 'ai' = AI chọn mục có sẵn, 'ai-new' = AI đề xuất mục mới. */
type Tag = '' | 'new' | 'ai' | 'ai-new'

interface Undo {
  txnIds: string[]
  catIds: string[]
  lines: string[]
  /** Khoản thấu chi vừa đổi: before = bản trước đó (null = vừa tạo mới). */
  od?: { id: string; before: Category | null }
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
  const [busy, setBusy] = useState(false)
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
  const whenRef = useRef<HTMLDivElement>(null)
  // Bàn phím số dính đáy màn hình sẽ che khung chọn ngày/giờ: mở ra thì cuộn khung lên phía trên bàn phím.
  useEffect(() => {
    if (!showWhen) return
    const dockH = document.querySelector<HTMLElement>('.dock')?.offsetHeight ?? 0
    if (whenRef.current) whenRef.current.style.scrollMarginBottom = `${dockH + 12}px`
    whenRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [showWhen])

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
    if (undo.od) {
      if (undo.od.before) onAddCategory(undo.od.before)
      else onRemoveCategory(undo.od.id)
    }
    window.clearTimeout(undoTimer.current)
    setUndo(null)
  }

  const nameOf = (id: string, cats: Category[] = categories) => {
    const c = cats.find((x) => x.id === id)
    return c ? pathOf(c, cats) : id
  }

  const line = (cat: Category, amount: number, cats: Category[], tag: Tag, d?: string) => {
    const mark = tag === 'new' ? ' (mục mới)' : tag === 'ai' ? ' · AI xếp' : tag === 'ai-new' ? ' (mục mới · AI)' : ''
    const when = d && d !== todayStr() ? ` · ${d.slice(8)}/${d.slice(5, 7)}` : ''
    return `${cat.kind === 'chi' ? 'Chi' : 'Thu'} ${vnd(amount)} · ${pathOf(cat, cats)}${mark}${when}`
  }

  // ===== Gõ nhanh: "đổ xăng 70k, cà phê 30k hôm qua" =====
  const submitQuick = async () => {
    if (busy) return
    const text = quick.trim()
    if (!text) return
    const res = parseQuick(text)
    if (res.error) {
      setQErr(res.error)
      return
    }
    // Khoản vay thấu chi không phải chi tiêu: cộng vào mục Thấu chi (tab Đầu tháng), không ghi vào Chi.
    const intents = res.items.map((it) => loanIntent(it.note))
    if (intents.includes('unknown')) {
      setQErr('Khoản vay nào? App mới tính được thấu chi: hãy gõ có chữ "thấu chi", ví dụ "vay thấu chi 25tr". Chưa ghi gì.')
      return
    }
    if (intents.includes('pay') && !categories.some((c) => c.overdraft)) {
      setQErr('Chưa có khoản thấu chi nào để trả. Hãy gõ "vay thấu chi …" trước. Chưa ghi gì.')
      return
    }
    const loanLines: string[] = []
    const origOd = categories.find((c) => c.overdraft)
    let od = origOd
    res.items.forEach((it, i) => {
      const k = intents[i]
      if (k !== 'draw' && k !== 'pay') return
      od = withLoanEvent(od, k === 'draw' ? { date: nextDay(it.date), amount: it.amount } : { date: it.date, amount: -it.amount })
      loanLines.push(
        k === 'draw'
          ? `Vay thấu chi ${vnd(it.amount)} · tính lãi từ ${nextDay(it.date).slice(8)}/${nextDay(it.date).slice(5, 7)} (không tính vào Chi)`
          : `Trả thấu chi ${vnd(it.amount)} (không tính vào Chi)`,
      )
    })
    if (od && loanLines.length > 0) onAddCategory(od)
    const rest = res.items.filter((_, i) => intents[i] === null)
    if (rest.length === 0) {
      showUndo({ txnIds: [], catIds: [], lines: loanLines, od: od ? { id: od.id, before: origOd ?? null } : undefined })
      setQuick('')
      setQErr('')
      quickRef.current?.focus()
      return
    }
    setQErr('')

    // 1) Xếp bằng điều đã nhớ, từ điển và tên mục (ngay trong máy, không cần mạng).
    const local = rest.map((it) => classify(it.note, categories, txns))

    // 2) Khoản nào chưa xếp được thì nhờ AI, nếu đã có key, đang bật và có mạng.
    const ai = new Map<string, AiResult | null>()
    let aiError = ''
    const unknown = [...new Set(rest.filter((_, i) => !local[i]).map((it) => it.note))]
    if (unknown.length > 0 && aiReady()) {
      setBusy(true)
      await Promise.all(
        unknown.map(async (n) => {
          try {
            ai.set(n, await classifyWithAI(n, categories))
          } catch (e) {
            if (!aiError) aiError = e instanceof AiError ? e.message : 'AI không trả lời.'
            ai.set(n, null)
          }
        }),
      )
      setBusy(false)
    }

    // 3) Ghi.
    let cats = categories
    const createdIds: string[] = []
    const addedIds: string[] = []
    const lines: string[] = [...loanLines]
    const base = Date.now()

    rest.forEach((it, i) => {
      let cat = local[i]?.category
      let tag: Tag = ''
      if (!cat) {
        const r = ai.get(it.note)
        if (r?.type === 'existing') {
          cat = r.category
          tag = 'ai'
        } else {
          const kind = r?.type === 'new' ? r.kind : guessKind(it.note)
          const parentId = r?.type === 'new' ? r.parentId : PHATSINH[kind]
          const name = r?.type === 'new' ? r.name : it.note
          // Hai khoản giống nhau trong một câu thì dùng chung một mục mới.
          const dup = cats.find((c) => c.parentId === parentId && normalize(c.name) === normalize(name))
          cat = dup ?? makeCategory(name, kind, parentId)
          if (!dup) {
            cats = [...cats, cat]
            createdIds.push(cat.id)
            onAddCategory(cat)
          }
          // Trùng với mục đã có thì không phải "mục mới".
          tag = dup ? (r?.type === 'new' ? 'ai' : '') : r?.type === 'new' ? 'ai-new' : 'new'
        }
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
      lines.push(line(cat, it.amount, cats, tag, it.date))
    })

    showUndo({ txnIds: addedIds, catIds: createdIds, lines, od: od && loanLines.length > 0 ? { id: od.id, before: origOd ?? null } : undefined })
    setQuick('')
    if (aiError) setQErr(`AI chưa dùng được: ${aiError} Khoản này đã được ghi vào Chưa phân loại.`)
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
    showUndo({ txnIds: [t.id], catIds: created, lines: [line(cat, amount, all, isNew ? 'new' : '', t.date)] })
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
    <div className={`page entry${manual ? ' fit' : ''}`}>
      <form
        className="quick"
        onSubmit={(e) => {
          e.preventDefault()
          void submitQuick()
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
        <button className="quick-go" type="submit" disabled={!quick.trim() || busy}>
          {busy ? 'AI…' : 'Ghi'}
        </button>
      </form>
      {qErr ? (
        <div className="quick-err">{qErr}</div>
      ) : !manual && (
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

      {!manual && recent.length > 0 && (
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
            <div className="when-pick" ref={whenRef}>
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
