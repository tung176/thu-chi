import type { Category } from '../types'
import { expandIds, hasTxn, sumIds } from './aggregate'

export interface PieSlice {
  key: string
  label: string
  /** Id danh mục hoặc nhóm (tự gồm cả con). */
  ids: string[]
  color: string
}

// Màu theo bảng Cove, gán cố định theo từng mục (không đổi theo thứ hạng).
const C = {
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#eda100',
  magenta: '#e87ba4',
  green: '#008300',
  violet: '#6250d6',
  red: '#e34948',
  // Lát thứ 9, thêm theo yêu cầu tách Bảo hiểm riêng (bảng Cove chỉ có 8 màu).
  teal: '#0e7490',
  gray: '#898781',
}

export const PIE_THU: PieSlice[] = [
  { key: 'luong', label: 'Tiền lương', ids: ['thu-luong'], color: C.blue },
  { key: 'phong', label: 'Tiền cho thuê phòng', ids: ['thu-phong'], color: C.orange },
  { key: 'kd', label: 'Tiền kinh doanh', ids: ['thu-kinhdoanh'], color: C.aqua },
  { key: 'dv', label: 'Phí dịch vụ của khách', ids: ['thu-dv'], color: C.yellow },
]

export const PIE_CHI: PieSlice[] = [
  { key: 'gopnha', label: 'Trả góp nhà', ids: ['chi-gopnha'], color: C.blue },
  { key: 'angd', label: 'Ăn gia đình', ids: ['chi-angd'], color: C.orange },
  { key: 'ancon', label: 'Ăn cho con', ids: ['chi-ancon'], color: C.aqua },
  { key: 'dien', label: 'Điện', ids: ['chi-dien'], color: C.yellow },
  { key: 'nuoc', label: 'Nước', ids: ['chi-nuoc'], color: C.magenta },
  { key: 'hoctap', label: 'Học tập', ids: ['chi-hoctap'], color: C.green },
  { key: 'dautu', label: 'Đầu tư làm ăn', ids: ['chi-dautu'], color: C.violet },
  {
    key: 'no',
    label: 'Trả góp và thẻ',
    ids: ['chi-gopbd', 'chi-thedao', 'chi-tranno'],
    color: C.red,
  },
  { key: 'baohiem', label: 'Bảo hiểm', ids: ['chi-baohiem'], color: C.teal },
  {
    key: 'khac',
    label: 'Khác',
    ids: [
      'chi-internet',
      'chi-truyenhinh',
      'chi-dulich',
      'chi-tiepkhach',
      'chi-thue-kd',
    ],
    color: C.gray,
  },
]

export interface Gap {
  key: string
  title: string
  /** Bên "thu vào" (cột xanh). */
  inLabel: string
  inIds: string[]
  /** Bên "chi ra" (cột đỏ). */
  outLabel: string
  outIds: string[]
  /** Chữ khi bên chi lớn hơn / nhỏ hơn bên thu. */
  worse: string
  better: string
  /** Id phải có giao dịch trong kỳ thì phép so sánh mới đủ số liệu. */
  required?: { ids: string[]; label: string }
}

export const GAPS: Gap[] = [
  {
    key: 'dien-nuoc',
    title: 'Điện và nước so với phí dịch vụ',
    inLabel: 'Phí dịch vụ thu của khách',
    inIds: ['thu-dv'],
    outLabel: 'Điện + nước nhà và khách',
    outIds: ['chi-dien', 'chi-nuoc-tien'],
    worse: 'Bù thêm',
    better: 'Dư',
    required: { ids: ['chi-nuoc-tien'], label: 'tiền nước' },
  },
  {
    key: 'gopnha',
    title: 'Trả góp nhà so với tiền phòng',
    inLabel: 'Tiền phòng thu được',
    inIds: ['thu-phong'],
    outLabel: 'Trả góp nhà',
    outIds: ['chi-gopnha'],
    worse: 'Bù thêm',
    better: 'Dư',
  },
  {
    key: 'kinhdoanh',
    title: 'Kinh doanh: thu so với đầu tư',
    inLabel: 'Tiền kinh doanh thu',
    inIds: ['thu-kinhdoanh'],
    outLabel: 'Đầu tư làm ăn + nước giặt là',
    outIds: ['chi-dautu', 'chi-nuoc-giatla'],
    worse: 'Lỗ',
    better: 'Lãi',
  },
]

export interface GapResult {
  gap: Gap
  inAmt: number
  outAmt: number
  /** Dương = bên chi lớn hơn bên thu. */
  diff: number
  /** Bên thu bù được bao nhiêu phần trăm bên chi (null nếu bên chi bằng 0). */
  coverPct: number | null
  missing: string | null
}

export function computeGap(
  gap: Gap,
  months: string[],
  leaf: Map<string, number>,
  categories: Category[],
): GapResult {
  const inAmt = sumIds(expandIds(gap.inIds, categories), months, leaf)
  const outAmt = sumIds(expandIds(gap.outIds, categories), months, leaf)
  let missing: string | null = null
  if (gap.required) {
    const ids = expandIds(gap.required.ids, categories)
    // Chỉ báo thiếu khi chọn đúng một tháng và tháng đó chưa có giao dịch.
    if (months.length === 1 && !hasTxn(ids, months, leaf)) missing = gap.required.label
  }
  return {
    gap,
    inAmt,
    outAmt,
    diff: outAmt - inAmt,
    coverPct: outAmt > 0 ? Math.round((inAmt / outAmt) * 100) : null,
    missing,
  }
}
