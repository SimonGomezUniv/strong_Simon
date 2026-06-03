const CACHE_NAME = 'strong-simon-cache-v2'
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '')

function withBasePath(resource) {
  const normalized = resource.startsWith('/') ? resource : `/${resource}`
  return `${SCOPE_PATH}${normalized}`
}

const APP_SHELL = [
  withBasePath('/'),
  withBasePath('/manifest.webmanifest'),
  withBasePath('/favicon.svg'),
  withBasePath('/logo_simon_strong.png'),
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(event.request.url)
  const isSameOrigin = requestUrl.origin === self.location.origin
  const isNavigation = event.request.mode === 'navigate'

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(withBasePath('/index.html'), copy))
          return response
        })
        .catch(() =>
          caches
            .match(withBasePath('/index.html'))
            .then((cached) => cached || caches.match(withBasePath('/'))),
        ),
    )
    return
  }

  if (!isSameOrigin) {
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }

          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          return response
        })
        .catch(() => cached)
    }),
  )
})
