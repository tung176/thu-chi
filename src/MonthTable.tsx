import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Txn } from './types'
import {
  buildTree,
  kindTotal,
  leafIds,
  monthOf,
  nodeTotal,
  sumByLeafMonth,
  vnd,
  type RowNode,
} from './lib/aggregate'

interface Props {
  categories: Category[]
  txns: Txn[]
  months: string[]
  currentMonth: string
}

interface Picked {
  title: string
  month: string
  ids: string[]
}

const monthLabel = (m: string) => `T${Number(m.slice(5))}/${m.slice(2, 4)}`

export function MonthTable({ categories, txns, months, currentMonth }: Props) {
  const leaf = useMemo(() => sumByLeafMonth(txns), [txns])
  const thuTree = useMemo(() => buildTree(categories, 'thu'), [categories])
  const chiTree = useMemo(() => buildTree(categories, 'chi'), [categories])
  const [open, setOpen] = useState<Set<string>>(new Set(['thu-phong']))
  const [picked, setPicked] = useState<Picked | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // Mở lên là cuộn tới tháng hiện tại (bên phải), vẫn cuộn ngược được về các tháng trước.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const cell = (key: string, value: number, onClick?: () => void, cls = '') => (
    <td
      key={key}
      className={`num ${value === 0 ? 'zero' : ''} ${onClick ? 'tap' : ''} ${cls}`}
      onClick={value !== 0 ? onClick : undefined}
    >
      {value === 0 ? '–' : vnd(value)}
    </td>
  )

  // Mục đã lưu trữ chỉ hiện khi có số trong các tháng đang xem.
  const visibleChildren = (node: RowNode) =>
    node.children.filter(
      (c) => !c.category.archived || months.some((m) => nodeTotal(c, m, leaf) !== 0),
    )

  const renderNode = (node: RowNode, depth: number, kind: 'thu' | 'chi'): React.ReactNode => {
    const kids = visibleChildren(node)
    const isGroup = kids.length > 0
    const expanded = open.has(node.category.id)
    return (
      <FragmentRows key={node.category.id}>
        <tr className={`row depth${depth} ${isGroup ? 'group' : ''}`}>
          <th
            className="name"
            style={{ paddingLeft: 10 + depth * 14 }}
            onClick={isGroup ? () => toggle(node.category.id) : undefined}
          >
            {isGroup && <span className="caret">{expanded ? '▾' : '▸'}</span>}
            {node.category.name}
          </th>
          {months.map((m) =>
            cell(m, nodeTotal(node, m, leaf), () =>
              setPicked({ title: node.category.name, month: m, ids: leafIds(node) }),
              kind,
            ),
          )}
        </tr>
        {isGroup && expanded && kids.map((c) => renderNode(c, depth + 1, kind))}
      </FragmentRows>
    )
  }

  const kindRow = (label: string, kind: 'thu' | 'chi', tree: RowNode[]) => (
    <tr className={`row kind ${kind}`}>
      <th className="name">{label}</th>
      {months.map((m) => (
        <td key={m} className="num">
          {vnd(kindTotal(tree, m, leaf))}
        </td>
      ))}
    </tr>
  )

  return (
    <>
      <div className="scroller" ref={scroller}>
        <table className="grid">
          <thead>
            <tr>
              <th className="name corner">Danh mục</th>
              {months.map((m) => (
                <th key={m} className={`mhead ${m === currentMonth ? 'now' : ''}`}>
                  {monthLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kindRow('THU', 'thu', thuTree)}
            {thuTree.map((n) => renderNode(n, 0, 'thu'))}
            {kindRow('CHI', 'chi', chiTree)}
            {chiTree.map((n) => renderNode(n, 0, 'chi'))}
            <tr className="row balance">
              <th className="name">Còn lại (Thu − Chi)</th>
              {months.map((m) => {
                const d = kindTotal(thuTree, m, leaf) - kindTotal(chiTree, m, leaf)
                return (
                  <td key={m} className={`num ${d < 0 ? 'neg' : 'pos'}`}>
                    {d < 0 ? '−' : ''}
                    {vnd(Math.abs(d))}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {picked && (
        <TxnSheet
          picked={picked}
          txns={txns}
          categories={categories}
          onClose={() => setPicked(null)}
        />
      )}
    </>
  )
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function TxnSheet({
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
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? id
  const ids = new Set(picked.ids)
  const list = txns.filter((t) => ids.has(t.categoryId) && monthOf(t.date) === picked.month)
  const total = list.reduce((s, t) => s + t.amount, 0)
  const showCat = picked.ids.length > 1

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{picked.title}</div>
            <div className="sheet-sub">
              {monthLabel(picked.month)} · {list.length} giao dịch · {vnd(total)} ₫
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
