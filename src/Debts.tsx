import { useMemo, useState } from 'react'
import type { Category, Txn } from './types'
import { vnd } from './lib/aggregate'
import { PLAN_PARENT, parsePlanLines, planStatuses } from './lib/plan'
import { Overdraft } from './Overdraft'

interface Props {
  categories: Category[]
  txns: Txn[]
  thisMonth: string
  today: string
  onAdd: (t: Txn) => void
  onAddCategory: (c: Category) => void
  onRemoveCategory: (id: string) => void
}

const monthShort = (m: string) => `T${Number(m.slice(5))}/${m.slice(0, 4)}`

/** Các khoản nợ: thấu chi và trả góp (trước đây nằm ở tab Đầu tháng). */
export function Debts({ categories, txns, thisMonth, today, onAdd, onAddCategory, onRemoveCategory }: Props) {
  const plans = useMemo(() => planStatuses(categories, txns, thisMonth), [categories, txns, thisMonth])
  const [planText, setPlanText] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const totalRemaining = plans.reduce((s, p) => s + p.remaining * p.plan.perMonth, 0)

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
      onAddCategory({ id: `u-${crypto.randomUUID().slice(0, 8)}`, name: p.label, kind: 'chi', parentId: PLAN_PARENT, plan: p.plan })
      added++
    }
    setPlanText('')
    setMsg({ ok: true, text: added === ok.length ? `Đã thêm ${added} khoản trả góp.` : `Đã thêm ${added} khoản (bỏ qua khoản trùng tên đã có).` })
  }

  const removePlan = (id: string, name: string) => {
    if (txns.some((t) => t.categoryId === id && !t.deleted)) {
      setMsg({ ok: false, text: `"${name}" đã có khoản trả ghi trong app nên không xóa ở đây được.` })
      return
    }
    if (window.confirm(`Xóa khoản trả góp "${name}"?`)) onRemoveCategory(id)
  }

  /** Ghi khoản trả góp của kỳ tiếp theo vào ngày hôm nay. */
  const payNow = (id: string, per: number, note: string) => {
    if (!window.confirm(`Ghi trả ${vnd(per)} ₫ cho "${note}" hôm nay?`)) return
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    onAdd({ id: crypto.randomUUID(), date: today, time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, amount: per, categoryId: id, note, updatedAt: Date.now() })
    setMsg({ ok: true, text: 'Đã ghi khoản trả góp.' })
  }

  return (
    <>
      <Overdraft categories={categories} today={today} onSave={onAddCategory} onRemove={onRemoveCategory} onAddTxn={onAdd} />

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
                <span className="muted">{p.remaining === 0 ? 'Đã trả hết' : `kỳ ${p.nextPeriod}/${p.plan.periods}`}</span>
                <button className="r-del" aria-label="Xóa khoản trả góp" onClick={() => removePlan(p.category.id, p.category.name)}>
                  ✕
                </button>
              </div>
              <div className="plan-bar">
                <div style={{ width: `${pct}%` }} />
              </div>
              <div className="muted small plan-sub">
                Đã trả {p.paid}/{p.plan.periods} kỳ · {vnd(p.plan.perMonth)} ₫ mỗi kỳ · còn {p.remaining} kỳ ({vnd(p.remaining * p.plan.perMonth)} ₫) · hết{' '}
                {monthShort(p.lastMonth)}
                {p.paidThisMonth && <span className="thu"> · tháng này đã trả</span>}
              </div>
              {p.remaining > 0 && !p.paidThisMonth && (
                <button className="save thu" onClick={() => payNow(p.category.id, p.plan.perMonth, `kỳ ${p.nextPeriod}/${p.plan.periods}`)}>
                  Ghi trả kỳ {p.nextPeriod} ({vnd(p.plan.perMonth)} ₫)
                </button>
              )}
            </div>
          )
        })}
        <details className="adv">
          <summary>Thêm khoản trả góp</summary>
          <p className="muted small">
            Mỗi dòng một khoản: <b>Tên | tiền mỗi kỳ | số kỳ | tháng đầu (YYYY-MM) | số kỳ đã trả trước</b>. Ví dụ: Tủ lạnh | 1500000 | 12 | 2026-01 | 3
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

      {msg && <div className={msg.ok ? 'msg ok' : 'msg bad'}>{msg.text}</div>}
    </>
  )
}
