/* Push handling for step timers. Loaded into the app's service worker (see vite.config.ts importScripts). */
self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    (async () => {
      // If the app is open and on screen it rings by itself; do not ring twice.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return
      await self.registration.showNotification(d.title || 'Timer done', {
        body: d.body || 'Time to check your dish.',
        tag: d.tag || 'tweaked-timer',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [400, 150, 400, 150, 400],
        requireInteraction: true,
        renotify: true,
        data: { url: d.url || '/' },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if ('focus' in w) {
          await w.focus()
          if ('navigate' in w) await w.navigate(url).catch(() => {})
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
