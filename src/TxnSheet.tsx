import type { Category, Txn } from './types'
import { monthOf, vnd } from './lib/aggregate'
import { pathOf } from './lib/entry'

export interface Picked {
  title: string
  months: string[]
  ids: string[]
}

export const monthLabel = (m: string) => `T${Number(m.slice(5))}/${m.slice(2, 4)}`

const periodLabel = (months: string[]) =>
  months.length === 1 ? monthLabel(months[0]) : `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`

/** Danh sách từng khoản tạo nên một con số: ngày giờ, nội dung bạn đã gõ, số tiền. */
export function TxnSheet({
  picked,
  txns,
  categories,
  onClose,
}: {
  picked: Picked
  txns: Txn[]
  categories: Category[]
  onClose: () => void
}) {
  const ids = new Set(picked.ids)
  const months = new Set(picked.months)
  const list = txns
    .filter((t) => ids.has(t.categoryId) && months.has(monthOf(t.date)))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  const total = list.reduce((s, t) => s + t.amount, 0)
  const nameOf = (id: string) => {
    const c = categories.find((x) => x.id === id)
    return c ? pathOf(c, categories) : id
  }
  const showCat = picked.ids.length > 1

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{picked.title}</div>
            <div className="sheet-sub">
              {periodLabel(picked.months)} · {list.length} giao dịch · {vnd(total)} ₫
            </div>
          </div>
          <button className="close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <ul className="txn-list">
          {list.map((t) => (
            <li key={t.id}>
              <div>
                <div className="t-main">{t.note || (showCat ? nameOf(t.categoryId) : 'Không ghi chú')}</div>
                <div className="t-sub">
                  {t.date.slice(8)}/{t.date.slice(5, 7)} · {t.time}
                  {showCat && t.note ? ` · ${nameOf(t.categoryId)}` : ''}
                </div>
              </div>
              <div className="t-amt">{vnd(t.amount)}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
