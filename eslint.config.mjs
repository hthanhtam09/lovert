import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/out/**', '**/out-prodcheck/**', 'apps/web/public/vendor/**', 'apps/web/next-env.d.ts', 'test-results/**', 'playwright-report/**', 'reports/**', 'test-results-*/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals.map((c) => ({ ...c, files: ['apps/web/**/*.{ts,tsx}'] })),
  {
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      '@next/next/no-img-element': 'off', // previews are blob: URLs; next/image does not apply
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Core must stay runtime-neutral.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react/*', 'next', 'next/*', 'node:*', 'fs', 'path', '@supabase/*', 'pdf-lib', 'pdfjs-dist'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'OffscreenCanvas', 'createImageBitmap'],
    },
  },
  { files: ['scripts/**/*.mjs', 'apps/web/scripts/**/*.mjs', 'tests/**/*.ts', '*.config.*'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly', setTimeout: 'readonly' } } },
);
