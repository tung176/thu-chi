// Gõ tiền nhanh: "5k" = 5.000, "2k5" = 2.500, "1tr" = 1.000.000, "1tr5" = 1.500.000, "000" thêm ba số 0.

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | 'k' | 'tr' | 'back' | 'clear'

const MAX_DIGITS = 12

const hasUnit = (e: string) => e.includes('k') || e.includes('tr')

export function press(expr: string, key: Key): string {
  switch (key) {
    case 'clear':
      return ''
    case 'back':
      return expr.endsWith('tr') ? expr.slice(0, -2) : expr.slice(0, -1)
    case 'k':
    case 'tr':
      // Chỉ thêm đơn vị khi đã có số và chưa có đơn vị nào.
      return /\d$/.test(expr) && !hasUnit(expr) ? expr + key : expr
    case '000':
      return hasUnit(expr) || expr === '' ? expr : expr.replace(/\D/g, '').length + 3 > MAX_DIGITS ? expr : expr + '000'
    default: {
      if (expr.replace(/\D/g, '').length >= MAX_DIGITS) return expr
      // Bỏ số 0 đứng đầu: "0" rồi gõ "5" thành "5".
      if (expr === '0') return key
      return expr + key
    }
  }
}

/** Đổi chuỗi đã gõ thành số tiền (VND, số nguyên). Rỗng hoặc sai cú pháp thì trả 0. */
export function parse(expr: string): number {
  if (!expr) return 0
  const m = /^(\d+)(k|tr)(\d*)$/.exec(expr)
  if (m) {
    const unit = m[2] === 'k' ? 1_000 : 1_000_000
    const frac = m[3] ? Number('0.' + m[3]) : 0
    return Math.round((Number(m[1]) + frac) * unit)
  }
  return /^\d+$/.test(expr) ? Number(expr) : 0
}
