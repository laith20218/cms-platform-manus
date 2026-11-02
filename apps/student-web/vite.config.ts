import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icons/icon-192.png', 'icons/icon-512.png'],
        manifest: {
          name: 'CMS - College Medical System', short_name: 'CMS', description: 'منصة تعليمية طبية متكاملة',
          lang: 'ar', dir: 'rtl', start_url: '/', display: 'standalone', orientation: 'portrait-primary',
          theme_color: '#0b2235', background_color: '#f7f4ec',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*$/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
            },
            {
              // R62 §2.B.3 — API responses are NEVER served from or added to the SW cache.
              // The old NetworkFirst handler could serve a stale cached 200 after a 10 s
              // timeout (masking 403/auth failures with old data — a documented DIAG 12.4
              // hazard) and made the service worker the apparent initiator of failing API
              // calls in DevTools. NetworkOnly keeps the SW in the request path for
              // bookkeeping but always hits the network and never stores a response.
              // Preflight OPTIONS requests are never intercepted here regardless —
              // browsers do not route CORS preflights through service workers.
              urlPattern: /^https:\/\/.*\.onrender\.com\/api\/.*$/i,
              handler: 'NetworkOnly',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 10
              }
            }
          ]
        },
      }),
    ],
    resolve: { alias: { '@': path.resolve(__dirname, './src'), '@cms/ui': path.resolve(__dirname, '../../packages/ui/src'), '@cms/types': path.resolve(__dirname, '../../packages/types/src'), '@cms/utils': path.resolve(__dirname, '../../packages/utils/src') } },
    server: {
      port: 5173,
      proxy: { '/api': { target: env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:8080', changeOrigin: true } },
    },
    build: {
      outDir: 'dist', sourcemap: false,
      rollupOptions: { output: { manualChunks: { 'react-vendor': ['react', 'react-dom', 'react-router-dom'], 'query-vendor': ['@tanstack/react-query'], 'ui-vendor': ['framer-motion', 'lucide-react', 'sonner'], 'pdfjs': ['pdfjs-dist/legacy/build/pdf.mjs'] } } },
      minify: 'terser', terserOptions: { compress: { drop_console: true, drop_debugger: true } }, chunkSizeWarningLimit: 500, cssCodeSplit: true, assetsInlineLimit: 4096,
    },
    optimizeDeps: { include: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'axios', 'framer-motion', 'lucide-react', 'sonner', 'clsx', 'tailwind-merge', 'pdfjs-dist/legacy/build/pdf.mjs'] },
  };
});
