/// <reference lib="webworker" />
// Xpenses's service worker: the precached app shell, a network-first cache
// for API reads, and the Web Share Target that lets a payment screenshot be
// shared straight into the add screen.
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { SHARE_PARAM, storeSharedFile } from './lib/share'

declare let self: ServiceWorkerGlobalScope

// registerType 'prompt': the app asks before a new version takes over.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting()
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/share$/] }),
)

registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'xpenses-api',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
)

// Share target: the share sheet POSTs the image here. Park it and open the add
// screen with its id; the form collects the file from IndexedDB.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/share') return
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        const file = form.get('screenshot')
        if (file instanceof File && file.size > 0) {
          const id = await storeSharedFile(file)
          return Response.redirect(`/add?${SHARE_PARAM}=${encodeURIComponent(id)}`, 303)
        }
      } catch {
        // fall through: open the add screen without a file
      }
      return Response.redirect(`/add?${SHARE_PARAM}=missing`, 303)
    })(),
  )
})
