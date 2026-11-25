/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
  css: {
    postcss: false, // Disable PostCSS to avoid parent project config conflicts
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // W1 (admin-ui) — mirror vite.config.ts so components importing @cms/ui
      // resolve identically in the vitest pipeline.
      '@cms/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@cms/types': path.resolve(__dirname, '../../packages/types/src'),
      '@cms/utils': path.resolve(__dirname, '../../packages/utils/src'),
    },
  },
});
