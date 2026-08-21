/** Style reminder — غرفة القيادة السريرية: ivory workspace, navy authority, restrained clinical teal signals. */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@cms/ui': path.resolve(__dirname, '../../packages/ui/src'),
        '@cms/types': path.resolve(__dirname, '../../packages/types/src'),
        '@cms/utils': path.resolve(__dirname, '../../packages/utils/src'),
      },
    },
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'terser',
      terserOptions: { compress: { drop_console: true, drop_debugger: true } },
      chunkSizeWarningLimit: 500,
      cssCodeSplit: true,
      assetsInlineLimit: 4096,
    },
  };
});
