/**
 * THU CHI - HỘP THƯ SAO LƯU
 *
 * Đoạn mã này chạy trong Google Sheets của bạn. App Thu Chi trên iPhone gửi các khoản thu chi
 * tới đây, và mã này ghi chúng thành từng dòng trong Sheet.
 *
 * VIỆC DUY NHẤT BẠN PHẢI SỬA: đặt mã bí mật ở dòng SECRET bên dưới (một câu dài ít nhất 20 ký tự,
 * ví dụ gồm chữ, số và dấu gạch). Cùng mã này sẽ được nhập vào màn Cài đặt của app.
 * Không dùng lại mật khẩu của chỗ khác và không gửi mã này cho ai.
 *
 * @OnlyCurrentDoc
 * (Dòng trên giới hạn quyền: đoạn mã này chỉ được đụng vào đúng Google Sheets chứa nó,
 * không đọc được các file khác trong Drive của bạn.)
 */
var SECRET = 'DOI-CHUOI-NAY-THANH-MA-BI-MAT-CUA-BAN';

var TX_SHEET = 'GiaoDich';
var CAT_SHEET = 'DanhMuc'; // kỹ thuật: danh mục tự tạo và kế hoạch trả góp (được ẩn đi)
var CAT_VIEW_SHEET = 'DanhMucDayDu'; // bảng danh mục để đọc: Loại, Nhóm lớn, Mục
var MONTH_SHEET = 'BangThang'; // bảng cộng theo tháng, tự tính từ GiaoDich bằng công thức

// Bố cục trang GiaoDich (cột A đến M). Khoản mới được sắp theo ngày rồi giờ, cũ ở trên, mới ở dưới.
var TX_HEADERS = [
  'Ngày', 'Giờ', 'Loại', 'Nhóm lớn', 'Mục', 'Nội dung', 'Số tiền', 'Số tiền (+/−)',
  'Mã khoản', 'Mã danh mục', 'Cập nhật lúc', 'Đã xóa', 'Tổng hợp tháng'
];
var TX_N = TX_HEADERS.length;
var ID_COL = 9; // cột I: Mã khoản
var IN_LEN = 14; // dòng app gửi lên có 14 phần (thứ tự cũ, không đổi để app và mã này khớp với mọi phiên bản)
var DEL_PREFIX = '[Đã xóa] ';
var CAT_HEADERS = ['Mã danh mục', 'Tên', 'Loại', 'Nhóm cha'];
var PLACEHOLDER = 'DOI-CHUOI-NAY-THANH-MA-BI-MAT-CUA-BAN';

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Mở địa chỉ này bằng trình duyệt chỉ để kiểm tra hộp thư đang chạy. Dữ liệu chỉ đi qua doPost kèm mã bí mật.
function doGet() {
  return out_({ ok: true, message: 'Hộp thư Thu Chi đang chạy. App sẽ gửi dữ liệu bằng POST kèm mã bí mật.' });
}

function doPost(e) {
  try {
    if (SECRET === PLACEHOLDER) {
      return out_({ ok: false, error: 'Bạn chưa đặt mã bí mật trong mã Apps Script (dòng SECRET).' });
    }
    var req = JSON.parse(e.postData.contents);
    if (req.secret !== SECRET) {
      return out_({ ok: false, error: 'Sai mã bí mật.' });
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      migrate_(ss);
      if (req.action === 'ping') return out_(ping_(ss));
      if (req.action === 'upsert') return out_(upsert_(ss, req.rows || [], req.categories || [], req.catalog || null));
      if (req.action === 'pull') return out_(pull_(ss));
      return out_({ ok: false, error: 'Yêu cầu không hợp lệ.' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function text_(v) {
  return v === null || v === undefined ? '' : String(v);
}

function dateText_(ss, v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return text_(v);
}

function timeText_(ss, v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'HH:mm');
  }
  return text_(v) || '00:00';
}

function isTrue_(v) {
  return v === true || text_(v).toUpperCase() === 'TRUE';
}

// Dòng app gửi (thứ tự: ngày, giờ, nội dung gộp, số tiền, +/−, loại, nhóm, mục, ghi chú, mã khoản, mã danh mục, cập nhật, xóa, tổng hợp)
// thành dòng của trang GiaoDich. Cột Nội dung chỉ giữ ghi chú bạn đã gõ.
function toSheetRow_(r) {
  var del = isTrue_(r[12]);
  return [r[0], r[1], r[5], r[6], r[7], (del ? DEL_PREFIX : '') + text_(r[8]), r[3], r[4], r[9], r[10], r[11], r[12], r[13]];
}

function noteOf_(v) {
  var s = text_(v);
  return s.indexOf(DEL_PREFIX) === 0 ? s.slice(DEL_PREFIX.length) : s;
}

function formatTx_(sh) {
  sh.getRange(1, 1, 1, TX_N).setValues([TX_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  // Giữ nguyên chữ, không để Sheets tự đổi ngày giờ hay mã thành kiểu khác.
  sh.getRange('A:B').setNumberFormat('@');
  sh.getRange('I:J').setNumberFormat('@');
  sh.getRange('K:K').setNumberFormat('0');
  sh.getRange('G:H').setNumberFormat('#,##0');
  sh.setColumnWidth(6, 300);
  // Các cột mã kỹ thuật nằm bên phải và được ẩn đi; app vẫn dùng để khôi phục.
  sh.hideColumns(9, 5);
}

function txSheet_(ss) {
  var sh = ss.getSheetByName(TX_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TX_SHEET);
    formatTx_(sh);
  }
  return sh;
}

function sortTx_(sh) {
  var last = sh.getLastRow();
  if (last < 3) return;
  sh.getRange(2, 1, last - 1, TX_N).sort([{ column: 1, ascending: false }, { column: 2, ascending: false }]);
}

// Bản cũ của trang GiaoDich có cột C là "Nội dung" gộp. Đổi sang bố cục mới một lần, có giữ bản sao lưu trước khi đổi.
function migrate_(ss) {
  var sh = ss.getSheetByName(TX_SHEET);
  if (!sh || sh.getLastRow() < 1) return;
  if (text_(sh.getRange(1, 3, 1, 1).getValues()[0][0]) !== 'Nội dung') return;
  var last = sh.getLastRow();
  var old = last >= 2 ? sh.getRange(2, 1, last - 1, IN_LEN).getValues() : [];
  var rows = [];
  for (var i = 0; i < old.length; i++) {
    var r = old[i];
    if (!text_(r[9])) continue;
    r[0] = dateText_(ss, r[0]);
    r[1] = timeText_(ss, r[1]);
    rows.push(toSheetRow_(r));
  }
  if (!ss.getSheetByName('GiaoDich_saoluu_cu')) {
    var bak = sh.copyTo(ss);
    bak.setName('GiaoDich_saoluu_cu');
    bak.hideSheet();
  }
  sh.clear();
  formatTx_(sh);
  if (rows.length) sh.getRange(2, 1, rows.length, TX_N).setValues(rows);
  sortTx_(sh);
}

function catSheet_(ss) {
  var sh = ss.getSheetByName(CAT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CAT_SHEET);
    sh.getRange(1, 1, 1, CAT_HEADERS.length).setValues([CAT_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:D').setNumberFormat('@');
    sh.hideSheet();
  }
  return sh;
}

function ping_(ss) {
  var sh = ss.getSheetByName(TX_SHEET);
  var rows = sh && sh.getLastRow() >= 2 ? sh.getLastRow() - 1 : 0;
  return { ok: true, rows: rows };
}

// Ghi các dòng: có mã khoản rồi thì cập nhật dòng đó, chưa có thì thêm vào cuối. Gửi lại nhiều lần không bị trùng.
// Sau khi ghi, sắp lại theo ngày rồi giờ và dựng lại Bảng tháng.
function upsert_(ss, rows, cats, catalog) {
  var sh = txSheet_(ss);
  var last = sh.getLastRow();

  var index = {};
  if (last >= 2) {
    var ids = sh.getRange(2, ID_COL, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) index[String(ids[i][0])] = i + 2;
  }

  // Trong cùng một lần gửi, mã nào lặp lại thì lấy dòng cuối.
  var batch = {};
  var order = [];
  for (var k = 0; k < rows.length; k++) {
    var r = rows[k];
    if (!r || r.length !== IN_LEN) continue;
    var id = String(r[9]);
    if (!id) continue;
    if (!(id in batch)) order.push(id);
    batch[id] = r;
  }

  var appendRows = [];
  var updated = 0;
  for (var j = 0; j < order.length; j++) {
    var key = order[j];
    if (index[key]) {
      sh.getRange(index[key], 1, 1, TX_N).setValues([toSheetRow_(batch[key])]);
      updated++;
    } else {
      appendRows.push(toSheetRow_(batch[key]));
    }
  }
  if (appendRows.length) {
    sh.getRange(last + 1, 1, appendRows.length, TX_N).setValues(appendRows);
  }
  sortTx_(sh);

  upsertCats_(ss, cats);
  if (catalog) writeCatalog_(ss, catalog);
  buildMonthly_(ss, catalog);
  return { ok: true, added: appendRows.length, updated: updated };
}

function upsertCats_(ss, cats) {
  if (!cats.length) return;
  var sh = catSheet_(ss);
  var last = sh.getLastRow();
  var index = {};
  if (last >= 2) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) index[String(ids[i][0])] = i + 2;
  }
  var appendRows = [];
  for (var k = 0; k < cats.length; k++) {
    var c = cats[k];
    if (!c || c.length !== CAT_HEADERS.length) continue;
    var id = String(c[0]);
    if (index[id]) sh.getRange(index[id], 1, 1, CAT_HEADERS.length).setValues([c]);
    else {
      appendRows.push(c);
      index[id] = last + appendRows.length;
    }
  }
  if (appendRows.length) sh.getRange(last + 1, 1, appendRows.length, CAT_HEADERS.length).setValues(appendRows);
}

// Bảng danh mục để đọc: mỗi dòng một mục, gồm Loại (Thu/Chi), Nhóm lớn, Mục. Ghi lại toàn bộ mỗi lần app gửi.
function writeCatalog_(ss, catalog) {
  var sh = ss.getSheetByName(CAT_VIEW_SHEET) || ss.insertSheet(CAT_VIEW_SHEET);
  sh.clear();
  var rows = [];
  for (var i = 0; i < catalog.length; i++) {
    var c = catalog[i];
    if (c && c.length === 3) rows.push([text_(c[0]), text_(c[1]), text_(c[2])]);
  }
  sh.getRange(1, 1, 1, 3).setValues([['Loại', 'Nhóm lớn', 'Mục']]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('A:C').setNumberFormat('@');
  if (rows.length) sh.getRange(2, 1, rows.length, 3).setValues(rows);
  sh.setColumnWidth(2, 220);
  sh.setColumnWidth(3, 260);
}

function monthAdd_(ym, n) {
  var y = Number(ym.slice(0, 4));
  var m = Number(ym.slice(5, 7)) - 1 + n;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return y + '-' + (m < 9 ? '0' : '') + (m + 1);
}

function colLetter_(n) {
  var s = '';
  while (n > 0) {
    var k = (n - 1) % 26;
    s = String.fromCharCode(65 + k) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Trang đầu tiên: bảng cộng theo tháng giống file Excel cũ. Chỉ hiện dòng có số; mỗi ô là công thức đọc từ GiaoDich.
// Tên dòng ở BangThang: tiền ăn cho bố mẹ và cho vợ con tách riêng khỏi "Ăn uống".
function grp_(group, item) {
  if (/^Tiền ăn gia đình/.test(item)) return 'Chi tiêu bố mẹ';
  if (/^Tiền ăn cho con/.test(item)) return 'Chi tiêu vợ con';
  return group;
}

function buildMonthly_(ss, catalog) {
  var tx = ss.getSheetByName(TX_SHEET);
  if (!tx || tx.getLastRow() < 2) return;
  var vals = tx.getRange(2, 1, tx.getLastRow() - 1, TX_N).getValues();
  var monthSet = {};
  var seen = {};
  var items = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!text_(r[ID_COL - 1]) || isTrue_(r[11])) continue;
    var ym = dateText_(ss, r[0]).slice(0, 7);
    if (ym.length !== 7) continue;
    monthSet[ym] = true;
    var gname = grp_(text_(r[3]), text_(r[4]));
    var key = text_(r[2]) + '|' + gname;
    if (!seen[key]) {
      seen[key] = true;
      items.push([text_(r[2]), gname]);
    }
  }
  var months = Object.keys(monthSet).sort();
  if (!months.length) return;
  var thisMonth = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd').slice(0, 7);
  var lastM = months[months.length - 1] > thisMonth ? months[months.length - 1] : thisMonth;
  var list = [];
  for (var m = months[0]; m <= lastM; m = monthAdd_(m, 1)) list.push(m);
  list.reverse(); // tháng mới nhất ở bên trái

  // Thứ tự dòng: Thu trước Chi, trong mỗi loại theo thứ tự danh mục của app (mục lạ xếp cuối).
  var pos = {};
  if (catalog) {
    for (var c = 0; c < catalog.length; c++) {
      var pk = text_(catalog[c][0]) + '|' + grp_(text_(catalog[c][1]), text_(catalog[c][2]));
      if (pos[pk] === undefined) pos[pk] = c;
    }
  }
  items.sort(function (a, b) {
    if (a[0] !== b[0]) return a[0] === 'Thu' ? -1 : 1;
    var pa = pos[a.join('|')];
    var pb = pos[b.join('|')];
    if (pa === undefined) pa = 100000;
    if (pb === undefined) pb = 100000;
    return pa - pb;
  });

  var sh = ss.getSheetByName(MONTH_SHEET);
  if (!sh) sh = ss.insertSheet(MONTH_SHEET, 0);
  sh.clear();
  var cols = 2 + list.length;
  var first5 = 5;
  sh.getRange(1, 3, 1, list.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, cols).setValues([['Loại', 'Nhóm lớn'].concat(list)]).setFontWeight('bold');

  // Tính sẵn bằng mã (không dùng công thức để khỏi phụ thuộc kiểu gõ công thức của từng ngôn ngữ Google Sheets).
  // Bảng được dựng lại sau mỗi lần app đồng bộ.
  var sums = {};
  for (var k = 0; k < vals.length; k++) {
    var v = vals[k];
    if (!text_(v[ID_COL - 1]) || isTrue_(v[11])) continue;
    var key2 = dateText_(ss, v[0]).slice(0, 7) + '|' + text_(v[2]) + '|' + grp_(text_(v[3]), text_(v[4]));
    sums[key2] = (sums[key2] || 0) + (Number(v[6]) || 0);
  }
  var thuRow = ['THU', ''];
  var chiRow = ['CHI', ''];
  var conRow = ['CÒN LẠI (Thu − Chi)', ''];
  var d = [];
  var kinds = [];
  var gapAt = -1;
  for (var n = 0; n < items.length; n++) {
    if (n > 0 && items[n][0] !== items[n - 1][0]) {
      gapAt = d.length;
      d.push(['', '']);
      kinds.push('');
    }
    d.push([items[n][0], items[n][1]]);
    kinds.push(items[n][0]);
  }
  for (var q = 0; q < list.length; q++) {
    var tT = 0;
    var tC = 0;
    for (var n2 = 0; n2 < d.length; n2++) {
      if (!kinds[n2]) {
        d[n2].push('');
        continue;
      }
      var amt = sums[list[q] + '|' + d[n2][0] + '|' + d[n2][1]] || 0;
      d[n2].push(amt === 0 ? '' : amt);
      if (kinds[n2] === 'Thu') tT += amt;
      else tC += amt;
    }
    thuRow.push(tT);
    chiRow.push(tC);
    conRow.push(tT - tC);
  }
  sh.getRange(1, cols + 2).setValue('Bản mã: số tính sẵn v6 (tháng mới ở bên trái), cập nhật ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM HH:mm'));
  sh.getRange(2, 1, 3, cols).setValues([thuRow, chiRow, conRow]);
  if (d.length) sh.getRange(first5, 1, d.length, cols).setValues(d);
  sh.getRange(2, 3, 3 + d.length, list.length).setNumberFormat('#,##0;-#,##0;');
  sh.getRange(2, 1, 3, cols).setFontWeight('bold');
  // Tô màu: Thu xanh lá, Chi cam đỏ, Còn lại xám; dòng chi tiết nhạt hơn dòng tổng.
  sh.getRange(1, 1, 1, cols).setBackground('#d9d9d9');
  sh.getRange(2, 1, 1, cols).setBackground('#a8d5a2');
  sh.getRange(3, 1, 1, cols).setBackground('#f4b6a6');
  sh.getRange(4, 1, 1, cols).setBackground('#cfe2f3');
  for (var z = 0; z < kinds.length; z++) {
    if (kinds[z] === 'Thu') sh.getRange(first5 + z, 1, 1, cols).setBackground('#e6f4e3');
    else if (kinds[z] === 'Chi') sh.getRange(first5 + z, 1, 1, cols).setBackground('#fbe5df');
  }
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  sh.setColumnWidth(2, 180);
}

// Trả toàn bộ dữ liệu gốc về cho app (dùng khi khôi phục sang điện thoại mới).
function pull_(ss) {
  var txns = [];
  var sh = ss.getSheetByName(TX_SHEET);
  if (sh && sh.getLastRow() >= 2) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, TX_N).getValues();
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      var id = text_(r[ID_COL - 1]);
      if (!id) continue;
      txns.push({
        id: id,
        date: dateText_(ss, r[0]),
        time: timeText_(ss, r[1]),
        amount: Number(r[6]) || 0,
        categoryId: text_(r[9]),
        note: noteOf_(r[5]),
        updatedAt: Number(r[10]) || 0,
        deleted: isTrue_(r[11]),
        summary: isTrue_(r[12])
      });
    }
  }
  var categories = [];
  var cs = ss.getSheetByName(CAT_SHEET);
  if (cs && cs.getLastRow() >= 2) {
    var cv = cs.getRange(2, 1, cs.getLastRow() - 1, CAT_HEADERS.length).getValues();
    for (var j = 0; j < cv.length; j++) {
      if (!text_(cv[j][0])) continue;
      categories.push({ id: text_(cv[j][0]), name: text_(cv[j][1]), kind: text_(cv[j][2]), parentId: text_(cv[j][3]) });
    }
  }
  return { ok: true, txns: txns, categories: categories };
}
