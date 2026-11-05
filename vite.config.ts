import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon-192.png'],
      manifest: {
        name: 'Tweaked',
        short_name: 'Tweaked',
        description: 'Your version of every dish, with every tweak remembered.',
        theme_color: '#f5f4ef',
        background_color: '#f5f4ef',
        display: 'standalone',
        orientation: 'portrait',
        id: '/',
        scope: '/',
        lang: 'en',
        categories: ['food', 'lifestyle'],
        start_url: '/',
        shortcuts: [
          { name: 'Add a recipe', short_name: 'Add', url: '/new', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Shopping list', short_name: 'Shopping', url: '/shopping', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Discover dishes', short_name: 'Discover', url: '/discover', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        // Lets you Share a Facebook/Instagram/TikTok post straight into Tweaked (Android, once installed).
        share_target: { action: '/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Fonts and icons are part of the app shell; without these the app falls back to system fonts offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // Recipes stay viewable offline: try the network first, fall back to the last response.
        runtimeCaching: [
          {
            // The bundled dish catalog (~900 dishes): serve the cached copy instantly, refresh quietly in the background.
            urlPattern: ({ url }) => url.pathname === '/catalog.json',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'catalog', cacheableResponse: { statuses: [200] } },
          },
          {
            // Wikibooks search results, so a dish you opened once still opens offline.
            urlPattern: ({ url }) => url.hostname === 'en.wikibooks.org',
            handler: 'NetworkFirst',
            options: { cacheName: 'wikibooks', networkTimeoutSeconds: 5, cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 14 } },
          },
          {
            // Suggestion photos from the open recipe sources: show the cached one instantly, refresh quietly.
            urlPattern: ({ url }) => /(themealdb\.com|thecocktaildb\.com|cdn\.dummyjson\.com)$/.test(url.hostname) && /\.(jpg|jpeg|png|webp)(\/\w+)?$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'dish-photos', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 14 } },
          },
          {
            // Suggestion data: prefer fresh, but keep the last copy so Home still fills in offline.
            urlPattern: ({ url }) => /(^|\.)(themealdb\.com|thecocktaildb\.com|dummyjson\.com)$/.test(url.hostname) && !/\.(jpg|jpeg|png|webp)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: { cacheName: 'dish-data', networkTimeoutSeconds: 5, cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'recipes-api', networkTimeoutSeconds: 4, expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
})
