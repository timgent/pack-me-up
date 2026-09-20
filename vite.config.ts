import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // We register the service worker ourselves (src/services/pwaUpdate.ts),
      // gated on Capacitor.isNativePlatform(): the native shell already ships
      // its assets and has no use for a browser service worker, and this is
      // the same "web vs. native" guard main.tsx already uses.
      injectRegister: false,
      registerType: 'prompt',
      manifest: {
        id: '/',
        name: 'Pack Me Up',
        short_name: 'Pack Me Up',
        description: 'Generate customised packing lists for your trips, synced to your own Solid Pod.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Same dark teal as the meta theme-color in index.html, kept in step
        // by hand since one is HTML and the other JSON.
        theme_color: '#042f2e',
        background_color: '#042f2e',
        categories: ['travel', 'utilities', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precaches only the app's own build output (JS/CSS/HTML/icons), so
        // it makes the app shell open offline (docs/offline.md, "An app shell
        // that survives a cold start") without touching Solid pod requests —
        // those are cross-origin and generateSW never routes them absent an
        // explicit runtimeCaching rule, which this deliberately has none of.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: '/index.html',
        // pod-auth-callback.html is a real navigation target (the OIDC
        // redirect URI) that must load as itself, not the SPA shell. It's
        // precached under its own URL so this is belt-and-braces.
        navigateFallbackDenylist: [/^\/pod-auth-callback\.html$/],
      },
    }),
  ],
  define: { global: "window" }
})
