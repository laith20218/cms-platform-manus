module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  // Push 11.1-REWRITE — the e2e HLS ladders under public/ are ffmpeg BINARY
  // artifacts (.ts MPEG-TS segments); --ext ts,tsx would try to parse them as
  // TypeScript and explode with syntax errors. They are gitignored regenerables,
  // never source. (Covers the legacy e2e-hls/ and the Option C e2e-hls-optionc/.)
  ignorePatterns: ['dist', 'node_modules', 'coverage', 'public/e2e-hls', 'public/e2e-hls-optionc'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
};
