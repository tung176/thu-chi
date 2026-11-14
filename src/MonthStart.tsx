import { useMemo, useState } from 'react'
import type { Category, Txn } from './types'
import { parse } from './lib/amount'
import { sumByLeafMonth, vnd } from './lib/aggregate'
import { labelOf, timeStr } from './lib/entry'
import { addMonths, PLAN_PARENT, parsePlanLines, planStatuses } from './lib/plan'

interface Props {
  categories: Category[]
  txns: Txn[]
  thisMonth: string
  today: string
  onAdd: (t: Txn) => void
  onAddCategory: (c: Category) => void
  onRemoveCategory: (id: string) => void
}

/** Các khoản bạn thường ghi một lượt vào đầu tháng khi có lương và thu tiền khách. */
const ROUTINE: { id: string; kind: 'thu' | 'chi' }[] = [
  { id: 'thu-luong', kind: 'thu' },
  { id: 'thu-phong-t2', kind: 'thu' },
  { id: 'thu-phong-t3', kind: 'thu' },
  { id: 'thu-phong-t4', kind: 'thu' },
  { id: 'thu-dv-t2', kind: 'thu' },
  { id: 'thu-dv-t3', kind: 'thu' },
  { id: 'thu-dv-t4', kind: 'thu' },
  { id: 'chi-gopnha', kind: 'chi' },
  { id: 'chi-angd', kind: 'chi' },
  { id: 'chi-ancon', kind: 'chi' },
  { id: 'chi-dien-tien', kind: 'chi' },
  { id: 'chi-nuoc-tien', kind: 'chi' },
  { id: 'chi-internet', kind: 'chi' },
]

const monthTitle = (m: string) => `Đầu tháng ${Number(m.slice(5))}/${m.slice(0, 4)}`
const monthShort = (m: string) => `T${Number(m.slice(5))}/${m.slice(0, 4)}`

/** "21.500.000", "21tr5", "850k" đều đọc được. */
function toAmount(s: string): number {
  const t = s.trim().toLowerCase().replace(/[.,\s]/g, '').replace(/(đ|d|vnd)$/, '')
  if (!t) return 0
  return /^\d+$/.test(t) ? Number(t) : parse(t)
}

interface Row {
  id: string
  kind: 'thu' | 'chi'
  label: string
  hint: string
  prefill: number
  recorded: number
  /** Ghi chú cho khoản (kế hoạch trả góp có "kỳ 4/12"). */
  note: string
  defaultChecked: boolean
}

export function MonthStart({ categories, txns, thisMonth, today, onAdd, onAddCategory, onRemoveCategory }: Props) {
  const leaf = useMemo(() => sumByLeafMonth(txns), [txns])
  const plans = useMemo(() => planStatuses(categories, txns, thisMonth), [categories, txns, thisMonth])
  const [date, setDate] = useState(today)
  const [edits, setEdits] = useState<Record<string, { checked?: boolean; text?: string }>>({})
  const [planText, setPlanText] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const totalRemaining = plans.reduce((s, p) => s + p.remaining * p.plan.perMonth, 0)

  const lastAmount = (id: string): { amount: number; month: string } => {
    let m = addMonths(thisMonth, -1)
    for (let i = 0; i < 36; i++) {
      const v = leaf.get(`${id}|${m}`) ?? 0
      if (v > 0) return { amount: v, month: m }
      m = addMonths(m, -1)
    }
    return { amount: 0, month: '' }
  }

  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    for (const r of ROUTINE) {
      const c = categories.find((x) => x.id === r.id)
      if (!c) continue
      const last = lastAmount(r.id)
      const recorded = leaf.get(`${r.id}|${thisMonth}`) ?? 0
      out.push({
        id: r.id,
        kind: r.kind,
        label: labelOf(c, categories),
        hint: last.amount ? `${monthShort(last.month)}: ${vnd(last.amount)}` : 'Chưa có số tháng trước',
        prefill: last.amount,
        recorded,
        note: '',
        defaultChecked: recorded === 0 && last.amount > 0,
      })
    }
    for (const p of plans) {
      if (p.remaining === 0) continue
      const label = `Trả góp ${p.category.name}`
      out.push({
        id: p.category.id,
        kind: 'chi',
        label: `${label} · kỳ ${p.nextPeriod}/${p.plan.periods}`,
        hint: `${vnd(p.plan.perMonth)} mỗi kỳ`,
        prefill: p.plan.perMonth,
        recorded: p.paidThisMonth ? p.plan.perMonth : 0,
        note: `kỳ ${p.nextPeriod}/${p.plan.periods}`,
        defaultChecked: !p.paidThisMonth,
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, leaf, plans, thisMonth])

  const eff = (r: Row) => ({
    checked: edits[r.id]?.checked ?? r.defaultChecked,
    text: edits[r.id]?.text ?? (r.prefill ? vnd(r.prefill) : ''),
  })

  const chosen = rows.filter((r) => eff(r).checked && toAmount(eff(r).text) > 0)
  const sumThu = chosen.filter((r) => r.kind === 'thu').reduce((s, r) => s + toAmount(eff(r).text), 0)
  const sumChi = chosen.filter((r) => r.kind === 'chi').reduce((s, r) => s + toAmount(eff(r).text), 0)

  const saveAll = () => {
    if (chosen.length === 0) return
    const now = new Date()
    const time = date === today ? timeStr(now) : '08:00'
    const base = now.getTime()
    chosen.forEach((r, i) =>
      onAdd({
        id: crypto.randomUUID(),
        date,
        time,
        amount: toAmount(eff(r).text),
        categoryId: r.id,
        note: r.note,
        updatedAt: base + i,
      }),
    )
    setEdits({})
    setMsg({ ok: true, text: `Đã ghi ${chosen.length} khoản (thu ${vnd(sumThu)} ₫, chi ${vnd(sumChi)} ₫). Xem ở tab Theo ngày.` })
  }

  const addPlans = () => {
    const { ok, errors } = parsePlanLines(planText)
    if (errors.length > 0) {
      setMsg({ ok: false, text: errors.join(' ') })
      return
    }
    if (ok.length === 0) {
      setMsg({ ok: false, text: 'Chưa có dòng nào. Mỗi dòng: Tên | tiền mỗi kỳ | số kỳ | tháng đầu (YYYY-MM) | số kỳ đã trả trước.' })
      return
    }
    const have = new Set(plans.map((p) => p.category.name.toLowerCase()))
    let added = 0
    for (const p of ok) {
      if (have.has(p.label.toLowerCase())) continue
      onAddCategory({
        id: `u-${crypto.randomUUID().slice(0, 8)}`,
        name: p.label,
        kind: 'chi',
        parentId: PLAN_PARENT,
        plan: p.plan,
      })
      added++
    }
    setPlanText('')
    setMsg({
      ok: true,
      text: added === ok.length ? `Đã thêm ${added} khoản trả góp.` : `Đã thêm ${added} khoản (bỏ qua khoản trùng tên đã có).`,
    })
  }

  const removePlan = (id: string, name: string) => {
    if (txns.some((t) => t.categoryId === id && !t.deleted)) {
      setMsg({ ok: false, text: `"${name}" đã có khoản trả ghi trong app nên không xóa ở đây được.` })
      return
    }
    if (window.confirm(`Xóa khoản trả góp "${name}"?`)) onRemoveCategory(id)
  }

  const section = (title: string, kind: 'thu' | 'chi') => {
    const list = rows.filter((r) => r.kind === kind)
    if (list.length === 0) return null
    return (
      <div className="ms-block">
        <div className="mini">{title}</div>
        <ul className="ms-list">
          {list.map((r) => {
            const e = eff(r)
            const done = r.recorded > 0
            return (
              <li key={r.id} className={done ? 'done' : ''}>
                <input
                  type="checkbox"
                  className="ms-check"
                  checked={e.checked}
                  onChange={(ev) => setEdits((s) => ({ ...s, [r.id]: { ...s[r.id], checked: ev.target.checked } }))}
                  aria-label={`Ghi ${r.label}`}
                />
                <div className="ms-main">
                  <div className="ms-name">{r.label}</div>
                  <div className="muted ms-hint">
                    {done ? `Tháng này đã ghi ${vnd(r.recorded)} ₫` : r.hint}
                  </div>
                </div>
                <input
                  className="ms-amt"
                  inputMode="decimal"
                  value={e.text}
                  onChange={(ev) => setEdits((s) => ({ ...s, [r.id]: { ...s[r.id], text: ev.target.value } }))}
                  aria-label={`Số tiền ${r.label}`}
                />
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="page">
      <h2 className="ms-title">{monthTitle(thisMonth)}</h2>

      <section className="card">
        <div className="card-head">
          <h2>Nợ trả góp</h2>
          {plans.length > 0 && <span className="muted">Còn {vnd(totalRemaining)} ₫</span>}
        </div>
        {plans.length === 0 && <p className="muted small">Chưa có khoản trả góp nào. Thêm ở bên dưới.</p>}
        {plans.map((p) => {
          const pct = Math.round((p.paid / p.plan.periods) * 100)
          return (
            <div className="plan" key={p.category.id}>
              <div className="plan-head">
                <b>{p.category.name}</b>
                <span className="muted">
                  {p.remaining === 0 ? 'Đã trả hết' : `kỳ ${p.nextPeriod}/${p.plan.periods}`}
                </span>
                <button className="r-del" aria-label="Xóa khoản trả góp" onClick={() => removePlan(p.category.id, p.category.name)}>
                  ✕
                </button>
              </div>
              <div className="plan-bar">
                <div style={{ width: `${pct}%` }} />
              </div>
              <div className="muted small plan-sub">
                Đã trả {p.paid}/{p.plan.periods} kỳ · {vnd(p.plan.perMonth)} ₫ mỗi kỳ · còn {p.remaining} kỳ (
                {vnd(p.remaining * p.plan.perMonth)} ₫) · hết {monthShort(p.lastMonth)}
                {p.paidThisMonth && <span className="thu"> · tháng này đã trả</span>}
              </div>
            </div>
          )
        })}
        <details className="adv">
          <summary>Thêm khoản trả góp</summary>
          <p className="muted small">
            Mỗi dòng một khoản: <b>Tên | tiền mỗi kỳ | số kỳ | tháng đầu (YYYY-MM) | số kỳ đã trả trước</b>. Ví dụ:
            Tủ lạnh | 1500000 | 12 | 2026-01 | 3
          </p>
          <textarea
            className="note ms-text"
            rows={4}
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
            placeholder="Tên | tiền mỗi kỳ | số kỳ | tháng đầu | đã trả trước"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="save thu" disabled={!planText.trim()} onClick={addPlans}>
            Thêm khoản trả góp
          </button>
        </details>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Ghi các khoản đầu tháng</h2>
        </div>
        <p className="muted small">
          Số tiền điền sẵn theo tháng gần nhất. Sửa số nào khác, bỏ tích khoản chưa có, rồi bấm ghi một lần.
        </p>
        <label className="field">
          Ngày ghi
          <input type="date" className="note" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </label>
        {section('Thu', 'thu')}
        {section('Chi', 'chi')}
        <button className="save thu" disabled={chosen.length === 0} onClick={saveAll}>
          {chosen.length === 0
            ? 'Chưa chọn khoản nào'
            : `Ghi ${chosen.length} khoản (thu ${vnd(sumThu)} · chi ${vnd(sumChi)})`}
        </button>
      </section>

      {msg && <div className={msg.ok ? 'msg ok' : 'msg bad'}>{msg.text}</div>}
    </div>
  )
}
