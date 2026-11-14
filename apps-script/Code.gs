/**
 * THU CHI - HỘP THƯ SAO LƯU
 *
 * Đoạn mã này chạy trong Google Sheets của bạn. App Thu Chi trên iPhone gửi các khoản thu chi
 * tới đây, và mã này ghi chúng thành từng dòng trong Sheet.
 *
 * VIỆC DUY NHẤT BẠN PHẢI SỬA: đặt mã bí mật ở dòng SECRET bên dưới (một câu dài ít nhất 20 ký tự,
 * ví dụ gồm chữ, số và dấu gạch). Cùng mã này sẽ được nhập vào màn Cài đặt của app.
 * Không dùng lại mật khẩu của chỗ khác và không gửi mã này cho ai.
 */
var SECRET = 'DOI-CHUOI-NAY-THANH-MA-BI-MAT-CUA-BAN';

var TX_SHEET = 'GiaoDich';
var CAT_SHEET = 'DanhMuc';

// Thứ tự cột của sheet GiaoDich. Cột D đến E và C do app tính sẵn; các cột F trở đi là dữ liệu gốc.
var TX_HEADERS = [
  'Ngày', 'Giờ', 'Nội dung', 'Số tiền', 'Số tiền (+/−)',
  'Loại', 'Nhóm lớn', 'Mục', 'Ghi chú gốc',
  'Mã khoản', 'Mã danh mục', 'Cập nhật lúc', 'Đã xóa', 'Tổng hợp tháng'
];
var CAT_HEADERS = ['Mã danh mục', 'Tên', 'Loại', 'Nhóm cha'];
var ID_COL = 10; // cột J: Mã khoản
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
      if (req.action === 'ping') return out_(ping_(ss));
      if (req.action === 'upsert') return out_(upsert_(ss, req.rows || [], req.categories || []));
      if (req.action === 'pull') return out_(pull_(ss));
      return out_({ ok: false, error: 'Yêu cầu không hợp lệ.' });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function txSheet_(ss) {
  var sh = ss.getSheetByName(TX_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TX_SHEET);
    sh.getRange(1, 1, 1, TX_HEADERS.length).setValues([TX_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Giữ nguyên chữ, không để Sheets tự đổi ngày giờ hay mã thành kiểu khác.
    sh.getRange('A:B').setNumberFormat('@');
    sh.getRange('J:K').setNumberFormat('@');
    sh.getRange('L:L').setNumberFormat('0');
    sh.getRange('D:E').setNumberFormat('#,##0');
    sh.setColumnWidth(3, 380);
  }
  return sh;
}

function catSheet_(ss) {
  var sh = ss.getSheetByName(CAT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CAT_SHEET);
    sh.getRange(1, 1, 1, CAT_HEADERS.length).setValues([CAT_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:D').setNumberFormat('@');
  }
  return sh;
}

function ping_(ss) {
  var sh = ss.getSheetByName(TX_SHEET);
  var rows = sh && sh.getLastRow() >= 2 ? sh.getLastRow() - 1 : 0;
  return { ok: true, rows: rows };
}

// Ghi các dòng: có mã khoản rồi thì cập nhật dòng đó, chưa có thì thêm vào cuối. Gửi lại nhiều lần không bị trùng.
function upsert_(ss, rows, cats) {
  var sh = txSheet_(ss);
  var n = TX_HEADERS.length;
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
    if (!r || r.length !== n) continue;
    var id = String(r[ID_COL - 1]);
    if (!id) continue;
    if (!(id in batch)) order.push(id);
    batch[id] = r;
  }

  var appendRows = [];
  var updated = 0;
  for (var j = 0; j < order.length; j++) {
    var key = order[j];
    if (index[key]) {
      sh.getRange(index[key], 1, 1, n).setValues([batch[key]]);
      updated++;
    } else {
      appendRows.push(batch[key]);
    }
  }
  if (appendRows.length) {
    sh.getRange(last + 1, 1, appendRows.length, n).setValues(appendRows);
  }

  upsertCats_(ss, cats);
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

// Trả toàn bộ dữ liệu gốc về cho app (dùng khi khôi phục sang điện thoại mới).
function pull_(ss) {
  var txns = [];
  var sh = ss.getSheetByName(TX_SHEET);
  if (sh && sh.getLastRow() >= 2) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, TX_HEADERS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      var id = text_(r[ID_COL - 1]);
      if (!id) continue;
      txns.push({
        id: id,
        date: dateText_(ss, r[0]),
        time: timeText_(ss, r[1]),
        amount: Number(r[3]) || 0,
        categoryId: text_(r[10]),
        note: text_(r[8]),
        updatedAt: Number(r[11]) || 0,
        deleted: isTrue_(r[12]),
        summary: isTrue_(r[13])
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
