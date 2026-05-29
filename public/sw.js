const CACHE = 'fieldday-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // Only handle GET requests over HTTP(S)
  if (request.method !== 'GET') return
  if (!url.protocol.startsWith('http')) return

  // Skip Supabase API calls — these must always go to network
  if (url.hostname.includes('supabase.co')) return

  // Never intercept auth routes — serving stale content here breaks sign-in
  if (url.pathname.startsWith('/login') || url.pathname.startsWith('/auth')) return

  // Cache-first for Next.js static assets (JS, CSS, fonts)
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(request, clone))
          }
          return res
        })
      )
    )
    return
  }

  // Network-first for navigation (HTML) — fall back to cached shell
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(request, clone))
          }
          return res
        })
        .catch(() => caches.match(request).then(c => c || caches.match('/')))
    )
  }
})
