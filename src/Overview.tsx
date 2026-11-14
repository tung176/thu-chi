import { useMemo, useState } from 'react'
import type { Category, Txn } from './types'
import {
  buildTree,
  expandIds,
  kindTotal,
  sumByLeafMonth,
  sumIds,
  vnd,
} from './lib/aggregate'
import { pathOf } from './lib/entry'
import { computeGap, GAPS, PIE_CHI, PIE_THU, type PieSlice } from './lib/overview'
import { TxnSheet, type Picked } from './TxnSheet'

interface Props {
  categories: Category[]
  txns: Txn[]
  /** Mọi tháng có thể xem, từ cũ đến mới (gồm cả tháng hiện tại dù chưa có số). */
  months: string[]
  /** Tháng mở lên đầu tiên (tháng gần nhất có dữ liệu). */
  initialMonth: string
}

const monthTitle = (m: string) => `Tháng ${Number(m.slice(5))}/${m.slice(0, 4)}`

export function Overview({ categories, txns, months, initialMonth }: Props) {
  const leaf = useMemo(() => sumByLeafMonth(txns), [txns])
  const thuTree = useMemo(() => buildTree(categories, 'thu'), [categories])
  const chiTree = useMemo(() => buildTree(categories, 'chi'), [categories])

  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [month, setMonth] = useState(initialMonth)
  const year = month.slice(0, 4)

  const period = useMemo(
    () => (mode === 'month' ? [month] : months.filter((m) => m.startsWith(year))),
    [mode, month, months, year],
  )

  const idx = months.indexOf(month)
  const years = [...new Set(months.map((m) => m.slice(0, 4)))]
  const canPrev = mode === 'month' ? idx > 0 : years.indexOf(year) > 0
  const canNext = mode === 'month' ? idx < months.length - 1 : years.indexOf(year) < years.length - 1

  const go = (dir: -1 | 1) => {
    if (mode === 'month') setMonth(months[idx + dir])
    else {
      const ny = years[years.indexOf(year) + dir]
      // Giữ nguyên số tháng nếu có, không thì lấy tháng cuối có trong năm đó.
      const same = `${ny}-${month.slice(5)}`
      setMonth(months.includes(same) ? same : months.filter((m) => m.startsWith(ny)).slice(-1)[0])
    }
  }

  const sumKind = (tree: ReturnType<typeof buildTree>) =>
    period.reduce((s, m) => s + kindTotal(tree, m, leaf), 0)
  const thu = sumKind(thuTree)
  const chi = sumKind(chiTree)
  const left = thu - chi

  return (
    <div className="page">
      <div className="ov-head">
        <button className="nav" disabled={!canPrev} onClick={() => go(-1)} aria-label="Kỳ trước">
          ‹
        </button>
        <div className="ov-title">{mode === 'month' ? monthTitle(month) : `Cả năm ${year}`}</div>
        <button className="nav" disabled={!canNext} onClick={() => go(1)} aria-label="Kỳ sau">
          ›
        </button>
      </div>

      <div className="seg" role="tablist">
        <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>
          Tháng
        </button>
        <button className={mode === 'year' ? 'on' : ''} onClick={() => setMode('year')}>
          Cả năm
        </button>
      </div>

      <div className="tiles">
        <div className="tile">
          <div className="tile-l">Thu</div>
          <div className="tile-v thu">{vnd(thu)}</div>
        </div>
        <div className="tile">
          <div className="tile-l">Chi</div>
          <div className="tile-v chi">{vnd(chi)}</div>
        </div>
        <div className="tile wide">
          <div className="tile-l">Còn lại</div>
          <div className={`tile-v big ${left < 0 ? 'chi' : 'thu'}`}>
            {left < 0 ? '−' : '+'}
            {vnd(Math.abs(left))}
          </div>
        </div>
      </div>

      <PieCard
        title="Thu theo nguồn"
        kind="thu"
        slices={PIE_THU}
        kindSum={thu}
        period={period}
        leaf={leaf}
        categories={categories}
        txns={txns}
      />
      <PieCard
        title="Chi theo hạng mục"
        kind="chi"
        slices={PIE_CHI}
        kindSum={chi}
        period={period}
        leaf={leaf}
        categories={categories}
        txns={txns}
      />

      <h2 className="sec">So sánh thu và chi</h2>
      {GAPS.map((g) => {
        const r = computeGap(g, period, leaf, categories)
        const max = Math.max(r.inAmt, r.outAmt, 1)
        const worse = r.diff > 0
        return (
          <div className="gap-card" key={g.key}>
            <div className="gap-title">{g.title}</div>
            <GapBar label={g.inLabel} amount={r.inAmt} pct={(r.inAmt / max) * 100} color="var(--thu)" />
            <GapBar label={g.outLabel} amount={r.outAmt} pct={(r.outAmt / max) * 100} color="var(--chi)" />
            {r.missing ? (
              <div className="gap-res muted">Chưa đủ số liệu: chưa có {r.missing} trong kỳ này.</div>
            ) : (
              <div className={`gap-res ${worse ? 'chi' : 'thu'}`}>
                {r.diff === 0 ? 'Cân bằng' : `${worse ? g.worse : g.better} ${vnd(Math.abs(r.diff))}`}
                {r.coverPct !== null && (
                  <span className="muted"> · bên thu bù được {r.coverPct}% bên chi</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function GapBar({
  label,
  amount,
  pct,
  color,
}: {
  label: string
  amount: number
  pct: number
  color: string
}) {
  return (
    <div className="gb">
      <div className="gb-row">
        <span>{label}</span>
        <span className="gb-amt">{vnd(amount)}</span>
      </div>
      <div className="gb-track">
        <div className="gb-fill" style={{ width: `${Math.max(pct, amount > 0 ? 1 : 0)}%`, background: color }} />
      </div>
    </div>
  )
}

interface Row {
  id: string
  label: string
  amount: number
}

function PieCard({
  title,
  kind,
  slices,
  kindSum,
  period,
  leaf,
  categories,
  txns,
}: {
  title: string
  kind: 'thu' | 'chi'
  slices: PieSlice[]
  kindSum: number
  period: string[]
  leaf: Map<string, number>
  categories: Category[]
  txns: Txn[]
}) {
  const [detail, setDetail] = useState<{ title: string; rows: Row[] } | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)

  // Id thuộc từng lát (đã gồm mục con). Lát "Khác" là mọi mục của loại này chưa nằm trong lát nào.
  const idsOf = useMemo(() => {
    const explicit = new Set<string>()
    const map = new Map<string, string[]>()
    for (const s of slices) {
      if (s.rest) continue
      const ids = expandIds(s.ids, categories)
      ids.forEach((i) => explicit.add(i))
      map.set(s.key, ids)
    }
    for (const s of slices) {
      if (s.rest) {
        map.set(
          s.key,
          categories.filter((c) => c.kind === kind && !explicit.has(c.id)).map((c) => c.id),
        )
      }
    }
    return map
  }, [slices, categories, kind])

  const data = slices.map((s) => ({
    ...s,
    value: sumIds(idsOf.get(s.key) ?? [], period, leaf),
  }))
  const total = kindSum
  const drawn = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  const pctOf = (v: number) => (total > 0 ? (v / total) * 100 : 0)
  const fmtPct = (v: number) => {
    const p = pctOf(v)
    return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
  }

  const openDetail = (key: string, label: string) => {
    const ids = idsOf.get(key) ?? []
    const rows: Row[] = ids
      .map((id) => {
        const c = categories.find((x) => x.id === id)
        return { id, label: c ? pathOf(c, categories) : id, amount: sumIds([id], period, leaf) }
      })
      .filter((r) => r.amount !== 0)
      .sort((a, b) => b.amount - a.amount)
    setDetail({ title: label, rows })
  }

  const paths = drawn.map((d, i) => {
    const before = drawn.slice(0, i).reduce((s, x) => s + x.value, 0)
    const a0 = -Math.PI / 2 + (before / total) * Math.PI * 2
    const a1 = a0 + (d.value / total) * Math.PI * 2
    return { d, a0, a1 }
  })

  const R = 56
  const cx = 60
  const cy = 60
  const arc = (a0: number, a1: number) => {
    const x0 = cx + R * Math.cos(a0)
    const y0 = cy + R * Math.sin(a0)
    const x1 = cx + R * Math.cos(a1)
    const y1 = cy + R * Math.sin(a1)
    const large = a1 - a0 > Math.PI ? 1 : 0
    return `M${cx},${cy} L${x0.toFixed(3)},${y0.toFixed(3)} A${R},${R} 0 ${large} 1 ${x1.toFixed(3)},${y1.toFixed(3)} Z`
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="muted">{vnd(total)} ₫</span>
      </div>
      {total === 0 ? (
        <p className="muted empty">Chưa có giao dịch trong kỳ này.</p>
      ) : (
        <div className="pie-wrap">
          <svg viewBox="0 0 120 120" className="pie" role="img" aria-label={title}>
            {paths.length === 1 ? (
              <circle
                cx={cx}
                cy={cy}
                r={R}
                fill={paths[0].d.color}
                onClick={() => openDetail(paths[0].d.key, paths[0].d.label)}
              />
            ) : (
              paths.map(({ d, a0, a1 }) => (
                <path
                  key={d.key}
                  d={arc(a0, a1)}
                  fill={d.color}
                  stroke="var(--card)"
                  strokeWidth="1.5"
                  onClick={() => openDetail(d.key, d.label)}
                >
                  <title>{`${d.label}: ${vnd(d.value)} ₫ (${fmtPct(d.value)})`}</title>
                </path>
              ))
            )}
          </svg>
          <ul className="legend">
            {drawn.map((d) => (
              <li key={d.key} className="tap" onClick={() => openDetail(d.key, d.label)}>
                <span className="sw" style={{ background: d.color }} />
                <span className="lg-name">{d.label}</span>
                <span className="lg-pct">{fmtPct(d.value)}</span>
                <span className="lg-amt">{vnd(d.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail && (
        <div className="backdrop" onClick={() => setDetail(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <div>
                <div className="sheet-title">{detail.title}</div>
                <div className="sheet-sub">
                  {detail.rows.length} mục · {vnd(detail.rows.reduce((s, r) => s + r.amount, 0))} ₫
                </div>
              </div>
              <button className="close" onClick={() => setDetail(null)} aria-label="Đóng">
                ✕
              </button>
            </div>
            <ul className="txn-list">
              {detail.rows.map((r) => (
                <li
                  key={r.id}
                  className="pick"
                  onClick={() => setPicked({ title: r.label, months: period, ids: [r.id] })}
                >
                  <div className="t-main">{r.label}</div>
                  <div className="t-amt">{vnd(r.amount)}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {picked && (
        <TxnSheet picked={picked} txns={txns} categories={categories} onClose={() => setPicked(null)} />
      )}
    </section>
  )
}
