# Thu Chi

Ứng dụng web (PWA) theo dõi thu chi cá nhân, dùng trên iPhone. Dữ liệu lưu trên máy, không có máy chủ.

## Chạy thử

```bash
npm install
npm run dev
```

## Dữ liệu cá nhân

Thư mục `data/` chứa file Excel và `history.json` cá nhân, đã được `.gitignore`, không đưa lên GitHub.
Để chuyển lịch sử từ file Sheet: `node scripts/convert-xlsx.mjs "data/<file>.xlsx" 2026-01`.

## Đưa lên mạng

Đẩy lên nhánh `main`, GitHub Actions tự build và đăng lên GitHub Pages.
