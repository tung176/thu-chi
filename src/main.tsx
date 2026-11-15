import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Bản đã đưa lên mạng: đăng ký service worker để dùng được khi không có mạng.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      const reg = await navigator.serviceWorker.ready
      const urls = [
        location.href,
        ...performance
          .getEntriesByType('resource')
          .map((r) => r.name)
          .filter((n) => n.startsWith(location.origin)),
      ]
      reg.active?.postMessage({ type: 'cache', urls })
    } catch {
      // Không đăng ký được thì app vẫn chạy bình thường khi có mạng.
    }
  })
}
