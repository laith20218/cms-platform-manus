import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Provide an inline empty PostCSS config so Vite does NOT walk up the
  // directory tree to discover one. The student-web app uses
  // @tailwindcss/vite (not PostCSS) for Tailwind, so it has no postcss.config
  // of its own. Without this inline override, Vite may pick up an unrelated
  // postcss.config from a parent project (e.g. when this repo is nested
  // inside another workspace), crashing test startup with
  // "Invalid PostCSS Plugin found".
  css: { postcss: { plugins: [] } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@cms/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@cms/types': path.resolve(__dirname, '../../packages/types/src'),
      '@cms/utils': path.resolve(__dirname, '../../packages/utils/src'),
    },
  },
});
