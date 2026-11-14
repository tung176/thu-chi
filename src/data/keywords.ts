// Từ điển từ khóa để xếp danh mục ngay trong máy (không cần mạng, không cần AI).
// Viết có dấu cho dễ đọc, app tự bỏ dấu khi so khớp. Cụm từ dài hơn được ưu tiên.
// Sửa file này để dạy app thêm từ mới.
export const KEYWORDS: Record<string, string[]> = {
  // ----- THU -----
  'thu-luong': ['lương', 'nhận lương', 'lương tháng', 'tiền lương', 'thưởng', 'bonus'],
  'thu-kinhdoanh': ['doanh thu', 'bán hàng', 'lãi kinh doanh', 'thu kinh doanh', 'tiền kinh doanh', 'khách trả hàng'],
  'thu-phong-t2': ['phòng tầng 2', 'tiền phòng tầng 2', 'phòng t2', 'thu phòng tầng 2'],
  'thu-phong-t3': ['phòng tầng 3', 'tiền phòng tầng 3', 'phòng t3', 'thu phòng tầng 3'],
  'thu-phong-t4': ['phòng tầng 4', 'tiền phòng tầng 4', 'phòng t4', 'thu phòng tầng 4'],
  'thu-dv-t2': ['dịch vụ tầng 2', 'phí dịch vụ tầng 2', 'điện nước tầng 2', 'phí tầng 2'],
  'thu-dv-t3': ['dịch vụ tầng 3', 'phí dịch vụ tầng 3', 'điện nước tầng 3', 'phí tầng 3'],
  'thu-dv-t4': ['dịch vụ tầng 4', 'phí dịch vụ tầng 4', 'điện nước tầng 4', 'phí tầng 4'],
  'thu-lai': ['lãi tiết kiệm', 'lãi ngân hàng', 'nhận lãi', 'hoàn tiền', 'cashback', 'hoàn tiền thẻ'],
  'thu-bando': ['bán đồ cũ', 'thanh lý', 'bán lại', 'bán đồ'],
  'thu-duocbieu': ['được biếu', 'được mừng', 'được tặng', 'nhận quà', 'nhận lì xì', 'được cho'],

  // ----- CHI: ăn uống -----
  'chi-angd': ['ăn gia đình', 'đi chợ', 'chợ', 'siêu thị', 'rau', 'thịt', 'cá', 'gạo', 'thực phẩm', 'trứng', 'bách hóa', 'đồ ăn nhà', 'mua đồ ăn'],
  'chi-ancon': ['ăn cho con', 'cho con ăn', 'ăn của con', 'cơm con', 'ăn con'],
  'chi-cafe': ['cafe', 'cà phê', 'coffee', 'trà sữa', 'trà đá', 'sinh tố', 'nước ép', 'highlands', 'phúc long', 'nước ngọt', 'trà', 'cacao'],
  'chi-anngoai': ['ăn sáng', 'ăn trưa', 'ăn tối', 'ăn ngoài', 'cháo', 'phở', 'bún', 'bánh mì', 'cơm', 'mì', 'lẩu', 'nướng', 'quán', 'nhà hàng', 'grabfood', 'shopeefood', 'giao đồ ăn', 'đồ ăn', 'xôi', 'ăn vặt', 'bia', 'nhậu', 'liên hoan', 'bánh', 'ăn'],

  // ----- CHI: nhà ở, tiện ích -----
  'chi-gopnha': ['trả góp nhà', 'góp nhà', 'tiền nhà', 'vay nhà', 'trả ngân hàng nhà'],
  'chi-suanha': ['sửa nhà', 'sửa chữa', 'thợ', 'sơn', 'thợ điện', 'thợ nước', 'ống nước', 'chống thấm', 'sửa điều hòa', 'vệ sinh điều hòa', 'bảo trì nhà'],
  'chi-giadung': ['nồi', 'chảo', 'quạt', 'máy giặt', 'tủ lạnh', 'giường', 'bàn ghế', 'nội thất', 'đồ gia dụng', 'chăn', 'ga giường', 'gối', 'rèm', 'điều hòa', 'máy rửa bát'],
  'chi-dien-tien': ['tiền điện', 'điện', 'evn', 'hóa đơn điện'],
  'chi-dien-3pha': ['điện 3 pha', '3 pha', 'tiền điện 3 pha'],
  'chi-nuoc-tien': ['tiền nước', 'nước', 'nước máy', 'hóa đơn nước'],
  'chi-nuoc-giatla': ['giặt là', 'nước giặt', 'giặt', 'xả vải', 'bột giặt', 'nước xả', 'tiệm giặt'],
  'chi-internet': ['wifi', 'internet', 'mạng', 'fpt', 'cáp quang', 'tiền mạng'],
  'chi-truyenhinh': ['truyền hình', 'k+', 'vtvcab', 'truyền hình cáp'],
  'chi-dienthoai': ['cước điện thoại', 'điện thoại', 'nạp tiền điện thoại', 'nạp điện thoại', 'nạp thẻ', 'sim', '4g', 'viettel', 'mobifone', 'vinaphone', 'gói cước', 'cước'],
  'chi-gas': ['gas', 'bình gas', 'rác', 'tiền rác', 'phí rác', 'vệ sinh'],

  // ----- CHI: di chuyển -----
  'chi-xang': ['xăng', 'đổ xăng', 'bơm xăng', 'đổ dầu', 'đổ nhớt', 'xăng xe'],
  'chi-guixe': ['gửi xe', 'giữ xe', 'cầu đường', 'phí đường', 'bot', 'etc', 'đỗ xe', 'vé cầu'],
  'chi-taxi': ['taxi', 'grab', 'xanh sm', 'xe ôm', 'gojek', 'xe công nghệ', 'đi grab'],
  'chi-suaxe': ['sửa xe', 'bảo dưỡng', 'thay nhớt', 'vá xe', 'thay lốp', 'rửa xe', 'đăng kiểm', 'thay ắc quy', 'bảo trì xe', 'bảo dưỡng xe'],
  'chi-ve': ['vé máy bay', 'vé tàu', 'vé xe', 'vé xe khách', 'vé bay', 'tàu hỏa', 'xe khách'],

  // ----- CHI: mua sắm -----
  'chi-quanao': ['quần', 'áo', 'giày', 'dép', 'váy', 'đầm', 'túi xách', 'thời trang', 'quần áo', 'giày dép'],
  'chi-canhan': ['mỹ phẩm', 'son', 'kem', 'sữa rửa mặt', 'dầu gội', 'sữa tắm', 'kem đánh răng', 'bàn chải', 'đồ dùng cá nhân', 'nước hoa', 'khăn giấy'],
  'chi-dientu': ['laptop', 'máy tính', 'tai nghe', 'sạc', 'cáp', 'ốp lưng', 'chuột', 'bàn phím', 'màn hình', 'camera', 'máy ảnh', 'phụ kiện', 'ipad', 'iphone', 'mua điện thoại', 'đồng hồ'],

  // ----- CHI: con cái -----
  'chi-hocphi': ['học phí', 'tiền học con', 'trường', 'lớp', 'đóng học', 'mầm non', 'học bán trú', 'đồng phục', 'học thêm cho con'],
  'chi-suabim': ['sữa', 'bỉm', 'tã', 'sữa bột', 'sữa cho con', 'khăn ướt', 'bình sữa'],
  'chi-dochoi': ['đồ chơi', 'lego', 'búp bê', 'xe đẩy', 'đồ dùng cho con', 'quần áo con', 'áo con'],

  // ----- CHI: sức khỏe, làm đẹp -----
  'chi-khambenh': ['khám', 'bệnh viện', 'viện phí', 'bác sĩ', 'nha khoa', 'nhổ răng', 'xét nghiệm', 'siêu âm', 'tiêm', 'phòng khám', 'khám bệnh'],
  'chi-thuoc': ['thuốc', 'nhà thuốc', 'vitamin', 'thực phẩm chức năng', 'khẩu trang'],
  'chi-thethao': ['gym', 'tập gym', 'yoga', 'bơi', 'hồ bơi', 'cầu lông', 'bóng đá', 'đá bóng', 'sân bóng', 'tennis', 'pickleball', 'chạy bộ'],
  'chi-lamdep': ['cắt tóc', 'uốn tóc', 'nhuộm tóc', 'gội đầu', 'spa', 'nail', 'làm móng', 'massage', 'làm đẹp', 'tóc'],

  // ----- CHI: bảo hiểm, học tập -----
  'chi-baohiem': ['bảo hiểm', 'bảo hiểm mẹ', 'bhxh', 'bhyt', 'bảo hiểm nhân thọ', 'bh'],
  'chi-hoctap': ['khóa học', 'khoá học', 'học online', 'udemy', 'tiếng anh', 'lớp học', 'học tập', 'đào tạo', 'workshop'],
  'chi-sach': ['sách', 'truyện', 'tài liệu', 'in ấn', 'photo'],
  'chi-phanmem': ['phần mềm', 'app', 'ứng dụng', 'chatgpt', 'claude', 'github', 'domain', 'hosting', 'canva', 'bản quyền'],

  // ----- CHI: giải trí, du lịch, thuê bao -----
  'chi-dulich': ['du lịch', 'đi chơi xa', 'tour', 'khách sạn', 'homestay', 'resort', 'vé tham quan', 'nghỉ dưỡng', 'booking', 'tiền tour'],
  'chi-phim': ['xem phim', 'rạp', 'cgv', 'vui chơi', 'karaoke', 'game', 'nạp game', 'khu vui chơi', 'công viên', 'bowling', 'giải trí'],
  'chi-thuebao': ['netflix', 'youtube', 'spotify', 'icloud', 'google one', 'thuê bao', 'gia hạn', 'subscription', 'disney'],

  // ----- CHI: quan hệ, hiếu hỉ -----
  'chi-tiepkhach': ['tiếp khách', 'tiếp chính quyền', 'biếu cán bộ', 'chính quyền', 'công an', 'phường', 'tiếp đoàn'],
  'chi-muncuoi': ['mừng cưới', 'đám cưới', 'cưới', 'tiền mừng', 'phong bì cưới'],
  'chi-phungvieng': ['phúng viếng', 'đám ma', 'đám tang', 'viếng', 'phúng', 'tang lễ'],
  'chi-bieu': ['biếu', 'biếu mẹ', 'biếu bố', 'bố mẹ', 'mẹ vợ', 'bố vợ', 'gửi mẹ', 'gửi bố mẹ', 'phụng dưỡng'],
  'chi-qua': ['quà', 'tặng', 'sinh nhật', 'quà tặng', 'hoa', 'lì xì', 'mừng tuổi'],
  'chi-tuthien': ['từ thiện', 'ủng hộ', 'quyên góp', 'thiện nguyện', 'chùa', 'cúng', 'lễ chùa'],

  // ----- CHI: kinh doanh, tài chính -----
  'chi-dautu': ['đầu tư', 'làm ăn', 'vốn kinh doanh', 'nhập hàng', 'hàng về', 'tiền đầu tư làm ăn'],
  'chi-thue-kd': ['thuế', 'thuế kinh doanh', 'thuế môn bài', 'kê khai thuế'],
  'chi-kd-khac': ['quảng cáo', 'ads', 'chạy ads', 'facebook ads', 'tiktok ads', 'shipping', 'vận chuyển', 'đóng gói', 'bao bì', 'thuê kho', 'lương nhân viên', 'nhân viên', 'drop'],
  'chi-gopbd': ['trả góp', 'góp tháng', 'kỳ trả góp', 'tiền góp', 'trả góp máy', 'trả góp điện thoại', 'trả góp/bảo dưỡng'],
  'chi-thedao': ['đáo thẻ', 'thẻ tín dụng', 'trả thẻ', 'tất toán thẻ', 'techcombank', 'shinhan', 'woori', 'thẻ'],
  'chi-tranno': ['trả nợ', 'nợ', 'trả tiền vay', 'hoàn nợ'],
  'chi-phinh': ['phí ngân hàng', 'phí chuyển khoản', 'lãi vay', 'lãi', 'phí thẻ', 'phí duy trì', 'sms banking'],
}

/** Từ cho biết khoản thu khi không xếp được vào mục nào. */
export const THU_WORDS = ['lương', 'nhận', 'thu', 'được biếu', 'được mừng', 'hoàn tiền', 'bán', 'doanh thu', 'lãi tiết kiệm']
