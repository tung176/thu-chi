import type { Category, Kind } from '../types'

// Danh mục: 14 nhóm lớn cho Chi, Thu giữ theo file Sheet.
// Dấu ✱ trong ghi chú = dòng đang có trong tab "Thu chi hàng tháng" của bạn (giữ nguyên id để số cũ không đổi).
// Mục nào nằm dưới Chi thì là chi, tên chỉ là cách ghi vắn tắt.

const chi = (id: string, name: string, parentId: string | null, extra: Partial<Category> = {}): Category => ({
  id,
  name,
  kind: 'chi',
  parentId,
  ...extra,
})
const thu = (id: string, name: string, parentId: string | null, extra: Partial<Category> = {}): Category => ({
  id,
  name,
  kind: 'thu',
  parentId,
  ...extra,
})

export const CATEGORIES: Category[] = [
  // ===== THU =====
  thu('thu-luong', 'Tiền lương', null), // ✱
  thu('thu-kinhdoanh', 'Tiền kinh doanh', null), // ✱

  thu('thu-phong', 'Tiền phòng', null), // ✱
  thu('thu-phong-t2', 'Tầng 2', 'thu-phong'),
  thu('thu-phong-t3', 'Tầng 3', 'thu-phong'),
  thu('thu-phong-t4', 'Tầng 4', 'thu-phong'),

  thu('thu-dv', 'Tiền phí dịch vụ', null), // ✱
  thu('thu-dv-t2', 'Tầng 2', 'thu-dv'),
  thu('thu-dv-t3', 'Tầng 3', 'thu-dv'),
  thu('thu-dv-t4', 'Tầng 4', 'thu-dv'),

  thu('thu-phatsinh', 'Thu khác', null, { container: true }),
  thu('thu-lai', 'Lãi, hoàn tiền', 'thu-phatsinh'),
  thu('thu-bando', 'Bán đồ cũ', 'thu-phatsinh'),
  thu('thu-duocbieu', 'Được biếu, được mừng', 'thu-phatsinh'),

  // ===== CHI =====
  // 1. Ăn uống
  chi('g-chi-anuong', 'Ăn uống', null, { container: true }),
  chi('chi-angd', 'Tiền ăn gia đình', 'g-chi-anuong'), // ✱
  chi('chi-ancon', 'Tiền ăn cho con', 'g-chi-anuong'), // ✱
  chi('chi-cafe', 'Cà phê, trà sữa', 'g-chi-anuong'),
  chi('chi-anngoai', 'Ăn ngoài, giao đồ ăn', 'g-chi-anuong'),

  // 2. Nhà ở
  chi('g-chi-nhao', 'Nhà ở', null, { container: true }),
  chi('chi-gopnha', 'Tiền trả góp nhà', 'g-chi-nhao'), // ✱
  chi('chi-suanha', 'Sửa chữa, bảo trì nhà', 'g-chi-nhao'),
  chi('chi-giadung', 'Đồ gia dụng, nội thất', 'g-chi-nhao'),

  // 3. Điện nước, tiện ích
  chi('g-chi-tienich', 'Điện nước, tiện ích', null, { container: true }),
  chi('chi-dien', 'Điện', 'g-chi-tienich'), // ✱ nhóm
  chi('chi-dien-tien', 'Tiền điện', 'chi-dien'), // ✱
  chi('chi-dien-3pha', 'Tiền điện 3 pha', 'chi-dien'), // ✱
  chi('chi-nuoc', 'Nước', 'g-chi-tienich'), // ✱ nhóm
  chi('chi-nuoc-tien', 'Tiền nước', 'chi-nuoc'), // ✱
  chi('chi-nuoc-giatla', 'Nước giặt là (kinh doanh)', 'chi-nuoc'),
  chi('chi-internet', 'Tiền internet', 'g-chi-tienich'), // ✱
  chi('chi-truyenhinh', 'Tiền truyền hình', 'g-chi-tienich'), // ✱
  chi('chi-dienthoai', 'Cước điện thoại', 'g-chi-tienich'),
  chi('chi-gas', 'Gas, rác', 'g-chi-tienich'),

  // 4. Di chuyển
  chi('g-chi-dichuyen', 'Di chuyển', null, { container: true }),
  chi('chi-xang', 'Xăng xe', 'g-chi-dichuyen'),
  chi('chi-guixe', 'Gửi xe, cầu đường', 'g-chi-dichuyen'),
  chi('chi-taxi', 'Taxi, Grab', 'g-chi-dichuyen'),
  chi('chi-suaxe', 'Sửa, bảo dưỡng xe', 'g-chi-dichuyen'),
  chi('chi-ve', 'Vé tàu xe, máy bay', 'g-chi-dichuyen'),

  // 5. Mua sắm
  chi('g-chi-muasam', 'Mua sắm', null, { container: true }),
  chi('chi-quanao', 'Quần áo, giày dép', 'g-chi-muasam'),
  chi('chi-canhan', 'Đồ dùng cá nhân, mỹ phẩm', 'g-chi-muasam'),
  chi('chi-dientu', 'Đồ điện tử, phụ kiện', 'g-chi-muasam'),

  // 6. Con cái
  chi('g-chi-concai', 'Con cái', null, { container: true }),
  chi('chi-hocphi', 'Học phí, trường lớp', 'g-chi-concai'),
  chi('chi-suabim', 'Sữa, bỉm', 'g-chi-concai'),
  chi('chi-dochoi', 'Đồ chơi, đồ dùng cho con', 'g-chi-concai'),

  // 7. Sức khỏe, làm đẹp
  chi('g-chi-suckhoe', 'Sức khỏe, làm đẹp', null, { container: true }),
  chi('chi-khambenh', 'Khám chữa bệnh', 'g-chi-suckhoe'),
  chi('chi-thuoc', 'Thuốc', 'g-chi-suckhoe'),
  chi('chi-thethao', 'Thể thao', 'g-chi-suckhoe'),
  chi('chi-lamdep', 'Cắt tóc, spa', 'g-chi-suckhoe'),

  // 8. Bảo hiểm (một mục, đứng riêng)
  chi('chi-baohiem', 'Tiền bảo hiểm', null), // ✱

  // 9. Học tập
  chi('g-chi-hoctap', 'Học tập', null, { container: true }),
  chi('chi-hoctap', 'Tiền học tập', 'g-chi-hoctap'), // ✱
  chi('chi-sach', 'Sách, tài liệu', 'g-chi-hoctap'),
  chi('chi-phanmem', 'Phần mềm, ứng dụng', 'g-chi-hoctap'),

  // 10. Giải trí, du lịch
  chi('g-chi-giaitri', 'Giải trí, du lịch', null, { container: true }),
  chi('chi-dulich', 'Tiền đi du lịch', 'g-chi-giaitri'), // ✱
  chi('chi-phim', 'Xem phim, vui chơi', 'g-chi-giaitri'),
  chi('chi-thuebao', 'Thuê bao số', 'g-chi-giaitri'),

  // 11. Quan hệ, hiếu hỉ
  chi('g-chi-quanhe', 'Quan hệ, hiếu hỉ', null, { container: true }),
  chi('chi-tiepkhach', 'Tiền tiếp chính quyền', 'g-chi-quanhe'), // ✱
  chi('chi-muncuoi', 'Mừng cưới', 'g-chi-quanhe'),
  chi('chi-phungvieng', 'Phúng viếng', 'g-chi-quanhe'),
  chi('chi-bieu', 'Biếu bố mẹ', 'g-chi-quanhe'),
  chi('chi-qua', 'Quà tặng', 'g-chi-quanhe'),
  chi('chi-tuthien', 'Từ thiện', 'g-chi-quanhe'),

  // 12. Kinh doanh
  chi('g-chi-kinhdoanh', 'Kinh doanh', null, { container: true }),
  chi('chi-dautu', 'Tiền đầu tư làm ăn', 'g-chi-kinhdoanh'), // ✱
  chi('chi-thue-kd', 'Tiền thuế kinh doanh', 'g-chi-kinhdoanh'), // ✱
  chi('chi-kd-khac', 'Chi phí kinh doanh khác', 'g-chi-kinhdoanh'),

  // 13. Tài chính, nợ
  chi('g-chi-taichinh', 'Tài chính, nợ', null, { container: true }),
  chi('chi-gopbd', 'Tiền trả góp / bảo dưỡng', 'g-chi-taichinh'), // ✱
  chi('chi-thedao', 'Tiền trả thẻ ngoài đáo', 'g-chi-taichinh'), // ✱
  chi('chi-the-tech', 'Thẻ Tech', 'chi-thedao', { archived: true }),
  chi('chi-the-shinhan', 'Thẻ Shinhan', 'chi-thedao', { archived: true }),
  chi('chi-the-woori', 'Thẻ Woori Bank', 'chi-thedao', { archived: true }),
  chi('chi-tranno', 'Trả nợ', 'g-chi-taichinh'),
  chi('chi-phinh', 'Phí ngân hàng, lãi', 'g-chi-taichinh'),

  // 14. Chưa phân loại: chỗ tạm cho mục app tự tạo mà chưa biết xếp vào nhóm nào
  chi('chi-phatsinh', 'Chưa phân loại', null, { container: true }),
]

/** Nhóm chứa mục mới tự tạo khi chưa biết xếp vào đâu. */
export const PHATSINH: Record<Kind, string> = {
  chi: 'chi-phatsinh',
  thu: 'thu-phatsinh',
}
