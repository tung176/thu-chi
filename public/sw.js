// Service worker: cho app chạy được khi không có mạng.
// - Trang chính: ưu tiên mạng (để nhận bản mới), mất mạng thì dùng bản đã lưu.
// - Tệp tĩnh (js, css, ảnh): ưu tiên bản đã lưu cho nhanh.
// Dữ liệu thu chi nằm trong IndexedDB, không đi qua service worker này.
const CACHE = 'thu-chi-v2'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

// Lần mở đầu tiên, trang gửi danh sách tệp đã tải để lưu sẵn cho lần sau không có mạng.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache') return
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(event.data.urls).catch(() => undefined)),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(
          async () =>
            (await caches.match(req, { ignoreSearch: true, ignoreVary: true })) ||
            (await caches.match(self.registration.scope, { ignoreVary: true })) ||
            Response.error(),
        ),
    )
    return
  }

  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
