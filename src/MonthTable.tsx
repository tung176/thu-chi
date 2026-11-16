import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Txn } from './types'
import {
  buildTree,
  kindTotal,
  leafIds,
  nodeTotal,
  sumByLeafMonth,
  vnd,
  type RowNode,
} from './lib/aggregate'
import { monthLabel, TxnSheet, type Picked } from './TxnSheet'
import { monthLoanStats } from './lib/overdraft'
import { planOwedAt } from './lib/plan'

interface Props {
  categories: Category[]
  txns: Txn[]
  months: string[]
  currentMonth: string
}

export function MonthTable({ categories, txns, months, currentMonth }: Props) {
  const leaf = useMemo(() => sumByLeafMonth(txns), [txns])
  const thuTree = useMemo(() => buildTree(categories, 'thu'), [categories])
  const chiTree = useMemo(() => buildTree(categories, 'chi'), [categories])
  // Mặc định mở sẵn mọi nhóm để thấy ngay từng mục bên trong.
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<Picked | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // 'all': hiện dòng có số ở bất kỳ tháng nào; 'last': chỉ dòng có số ở tháng mới nhất (cột bên phải).
  const [scope, setScope] = useState<'all' | 'last'>('last')
  const od = categories.find((c) => c.overdraft)?.overdraft
  const plans = categories.filter((c) => c.plan)

  // Mở lên là cuộn tới tháng hiện tại (bên phải), vẫn cuộn ngược được về các tháng trước.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  const toggle = (id: string) =>
    setClosed((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // Mục không có số nào trong các tháng đang xem thì ẩn đi cho gọn.
  const hasData = (node: RowNode) =>
    (scope === 'last' ? months.slice(-1) : months).some((m) => nodeTotal(node, m, leaf) !== 0)
  const shown = (nodes: RowNode[]) => nodes.filter(hasData)

  const cell = (key: string, value: number, onClick?: () => void, cls = '') => (
    <td
      key={key}
      className={`num ${value === 0 ? 'zero' : ''} ${onClick ? 'tap' : ''} ${cls}`}
      onClick={value !== 0 ? onClick : undefined}
    >
      {value === 0 ? '–' : vnd(value)}
    </td>
  )

  const renderNode = (node: RowNode, depth: number, kind: 'thu' | 'chi'): React.ReactNode => {
    const kids = shown(node.children)
    const isGroup = kids.length > 0
    const expanded = !closed.has(node.category.id)
    return (
      <Fragment key={node.category.id}>
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
            cell(
              m,
              nodeTotal(node, m, leaf),
              () => setPicked({ title: node.category.name, months: [m], ids: leafIds(node) }),
              kind,
            ),
          )}
        </tr>
        {isGroup && expanded && kids.map((c) => renderNode(c, depth + 1, kind))}
      </Fragment>
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
      <div className="row2">
        <button className={`chip big ${scope === 'last' ? 'sel' : ''}`} onClick={() => setScope('last')}>
          Chỉ dòng có số ở tháng mới nhất
        </button>
        <button className={`chip big ${scope === 'all' ? 'sel' : ''}`} onClick={() => setScope('all')}>
          Mọi dòng từng có số
        </button>
      </div>
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
            {shown(thuTree).map((n) => renderNode(n, 0, 'thu'))}
            {kindRow('CHI', 'chi', chiTree)}
            {shown(chiTree).map((n) => renderNode(n, 0, 'chi'))}
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
            {plans.length > 0 && (
              <>
                <tr className="row kind">
                  <th className="name">NỢ TRẢ GÓP (còn nợ cuối tháng theo lịch kỳ; tiền trả mỗi kỳ đã nằm trong Chi)</th>
                  {months.map((m) => (
                    <td key={m} className="num" />
                  ))}
                </tr>
                {plans.map((c) => (
                  <tr className="row depth0" key={c.id}>
                    <th className="name">{c.name}</th>
                    {months.map((m) => cell(m, planOwedAt(c.plan!, m) ?? 0, undefined, 'loan'))}
                  </tr>
                ))}
              </>
            )}
            {od && (
              <>
                <tr className="row kind">
                  <th className="name">THẤU CHI (khoản nợ, số âm; không tính vào Thu hay Chi)</th>
                  {months.map((m) => (
                    <td key={m} className="num" />
                  ))}
                </tr>
                {([
                  ['Dư nợ cuối tháng', 'endBalance'],
                ] as const).map(([label, key]) => (
                  <tr className="row depth0" key={key}>
                    <th className="name">{label}</th>
                    {months.map((m) => cell(m, -monthLoanStats(od, m)[key], undefined, 'loan'))}
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {picked && (
        <TxnSheet picked={picked} txns={txns} categories={categories} onClose={() => setPicked(null)} />
      )}
    </>
  )
}
