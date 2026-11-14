import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Chỉ khi chạy `npm run dev`: phục vụ file lịch sử cá nhân trong data/ để xem thử.
// Bản build không chứa thư mục này, nên dữ liệu không bao giờ lên GitHub Pages.
function devHistory(): Plugin {
  return {
    name: 'dev-history',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__data/history.json', (_req, res) => {
        const file = resolve(process.cwd(), 'data/history.json')
        if (!existsSync(file)) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('Content-Type', 'application/json')
        createReadStream(file).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), devHistory()],
})
