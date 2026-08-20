import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
