import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered by hand in main.tsx so the Android build skips it — a service
      // worker inside the WebView serves stale assets after an app update.
      injectRegister: null,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'ajuba scanner',
        short_name: 'ajuba',
        description: 'Scan, edit and export PDFs. Everything stays on your device.',
        theme_color: '#0b0f17',
        background_color: '#0b0f17',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell is precached; the 22 MB OCR model is not, or every
        // visitor would pay for it before ever pressing OCR.
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        globIgnores: ['**/tesseract/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/tesseract\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-assets',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // Relative asset paths so the build also works from the Android WebView.
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('tesseract.js')) return 'ocr';
          if (id.includes('pdf-lib') || id.includes('pdfjs-dist')) return 'pdf';
        },
      },
    },
  },
  // Pinned off Vite's default 5173, which another project on this machine owns.
  // strictPort makes a clash fail loudly instead of silently drifting to
  // another port or binding a second address on the same one.
  server: { host: true, port: 5180, strictPort: true },
  preview: { host: true, port: 5181, strictPort: true },
});
