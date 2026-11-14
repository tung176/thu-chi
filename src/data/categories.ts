import type { Category } from '../types'

// Danh mục theo đúng tab "Thu chi hàng tháng" trong file Sheet của bạn.
// Mục nào nằm dưới Chi thì là chi, tên chỉ là cách ghi vắn tắt.
export const CATEGORIES: Category[] = [
  // ----- THU -----
  { id: 'thu-luong', name: 'Tiền lương', kind: 'thu', parentId: null },
  { id: 'thu-kinhdoanh', name: 'Tiền kinh doanh', kind: 'thu', parentId: null },

  { id: 'thu-phong', name: 'Tiền phòng', kind: 'thu', parentId: null },
  { id: 'thu-phong-t2', name: 'Tầng 2', kind: 'thu', parentId: 'thu-phong' },
  { id: 'thu-phong-t3', name: 'Tầng 3', kind: 'thu', parentId: 'thu-phong' },
  { id: 'thu-phong-t4', name: 'Tầng 4', kind: 'thu', parentId: 'thu-phong' },

  { id: 'thu-dv', name: 'Tiền phí dịch vụ', kind: 'thu', parentId: null },
  { id: 'thu-dv-t2', name: 'Tầng 2', kind: 'thu', parentId: 'thu-dv' },
  { id: 'thu-dv-t3', name: 'Tầng 3', kind: 'thu', parentId: 'thu-dv' },
  { id: 'thu-dv-t4', name: 'Tầng 4', kind: 'thu', parentId: 'thu-dv' },

  // ----- CHI -----
  { id: 'chi-angd', name: 'Tiền ăn gia đình', kind: 'chi', parentId: null },
  { id: 'chi-ancon', name: 'Tiền ăn cho con', kind: 'chi', parentId: null },

  { id: 'chi-dien', name: 'Điện', kind: 'chi', parentId: null },
  { id: 'chi-dien-tien', name: 'Tiền điện', kind: 'chi', parentId: 'chi-dien' },
  { id: 'chi-dien-3pha', name: 'Tiền điện 3 pha', kind: 'chi', parentId: 'chi-dien' },

  { id: 'chi-nuoc', name: 'Nước', kind: 'chi', parentId: null },
  { id: 'chi-nuoc-tien', name: 'Tiền nước', kind: 'chi', parentId: 'chi-nuoc' },
  { id: 'chi-nuoc-giatla', name: 'Nước giặt là (kinh doanh)', kind: 'chi', parentId: 'chi-nuoc' },

  { id: 'chi-internet', name: 'Tiền internet', kind: 'chi', parentId: null },
  { id: 'chi-truyenhinh', name: 'Tiền truyền hình', kind: 'chi', parentId: null },
  { id: 'chi-gopnha', name: 'Tiền trả góp nhà', kind: 'chi', parentId: null },
  { id: 'chi-baohiem', name: 'Tiền bảo hiểm', kind: 'chi', parentId: null },
  { id: 'chi-hoctap', name: 'Tiền học tập', kind: 'chi', parentId: null },
  { id: 'chi-dautu', name: 'Tiền đầu tư làm ăn', kind: 'chi', parentId: null },

  { id: 'chi-thedao', name: 'Tiền trả thẻ ngoài đáo', kind: 'chi', parentId: null },
  { id: 'chi-the-tech', name: 'Thẻ Tech', kind: 'chi', parentId: 'chi-thedao', archived: true },
  { id: 'chi-the-shinhan', name: 'Thẻ Shinhan', kind: 'chi', parentId: 'chi-thedao', archived: true },
  { id: 'chi-the-woori', name: 'Thẻ Woori Bank', kind: 'chi', parentId: 'chi-thedao', archived: true },

  { id: 'chi-gopbd', name: 'Tiền trả góp / bảo dưỡng', kind: 'chi', parentId: null },
  { id: 'chi-tiepkhach', name: 'Tiền tiếp chính quyền', kind: 'chi', parentId: null },
  { id: 'chi-dulich', name: 'Tiền đi du lịch', kind: 'chi', parentId: null },
  { id: 'chi-thue-kd', name: 'Tiền thuế kinh doanh', kind: 'chi', parentId: null },
  { id: 'chi-tranno', name: 'Trả nợ', kind: 'chi', parentId: null },

  // Mục mới phát sinh khi nhập tay (ví dụ "Xăng xe máy") được app tự tạo trong hai nhóm này.
  { id: 'chi-phatsinh', name: 'Phát sinh', kind: 'chi', parentId: null, container: true },
  { id: 'thu-phatsinh', name: 'Thu phát sinh', kind: 'thu', parentId: null, container: true },
]

export const PHATSINH: Record<'thu' | 'chi', string> = {
  chi: 'chi-phatsinh',
  thu: 'thu-phatsinh',
}
