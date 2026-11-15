export type Kind = 'thu' | 'chi'

export interface Category {
  id: string
  name: string
  kind: Kind
  /** null = nằm ngay dưới Thu/Chi. Có parentId = mục thành phần của một nhóm. */
  parentId: string | null
  /** Mục đã lưu trữ: không hiện khi nhập mới, vẫn giữ để dữ liệu cũ đúng. */
  archived?: boolean
  /** Nhóm chỉ để chứa mục con (ví dụ "Phát sinh"), không chọn trực tiếp khi nhập. */
  container?: boolean
  /** Kế hoạch trả góp của mục này (nếu mục là một khoản trả góp). */
  /** Khoản thấu chi (lãi suất năm %, các lần rút/trả). */
  overdraft?: { rate: number; events: { date: string; amount: number }[] }
  plan?: { perMonth: number; periods: number; firstMonth: string; paidBefore: number }
}

export interface Txn {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm */
  time: string
  /** VND, luôn dương. Loại thu/chi lấy từ danh mục. */
  amount: number
  categoryId: string
  note: string
  /** Giao dịch tổng hợp của cả tháng (nhập từ file Sheet cũ). */
  summary?: boolean
  /** Mili giây. Dùng để đồng bộ về sau. */
  updatedAt?: number
  /** Xóa mềm: vẫn giữ trong máy để đồng bộ việc xóa lên Drive sau này. */
  deleted?: boolean
}

export interface History {
  source: string
  categories: Category[]
  txns: Txn[]
}
