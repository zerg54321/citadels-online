import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') return;
  console.error('Uncaught:', err);
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,webp}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Citadels Online',
        short_name: 'Citadels',
        description: '在线桌游 - 城堡',
        theme_color: '#0d0b08',
        background_color: '#0d0b08',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            // 'any maskable': serves both the regular icon and Android's
            // home-screen maskable icon. Maskable icons must be square — the
            // old separate 192x512 file was non-square (undefined cropping
            // behavior on Android launchers) and has been removed.
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      includeAssets: ['icon-*.png'],
    }),
  ],
  server: {
    port: 3010,
    proxy: {
      // Object form + ws:true is REQUIRED: the string shorthand only proxies
      // HTTP requests, not the WebSocket Upgrade handshake. Socket.IO opens
      // with HTTP polling (gets a sid) then upgrades to websocket reusing that
      // sid — without ws:true the Upgrade hits the Vite server (which has no
      // /s/ ws handler) and fails. The client silently falls back to polling
      // so the game still works, but the console spams "WebSocket connection
      // ... failed" on every reconnect. ws:true lets Vite forward the Upgrade
      // to the backend on :8081. target is a bare host (no path): the request
      // already carries /s/ and the server is configured with path:'/s/'.
      '/s/': {
        target: 'http://localhost:8081',
        ws: true,
      },
      '/api': 'http://localhost:8081',
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Project SCSS still uses `@import` throughout (18 files). Dart Sass
        // 3.0 will remove it; migrating to @use/@forward is tracked as a
        // separate task. Only `import` is silenced — the other BS4-only
        // deprecations (global-builtin / color-functions / if-function /
        // abs-percent) left with Bootstrap and are NOT re-added.
        silenceDeprecations: ['import'],
      },
    },
  },
  define: { 'process.env': {} },
  resolve: {
    alias: {
      // Point to common source so Vite does not hit package exports
      'citadels-common': path.resolve(__dirname, '../common/src/index.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
