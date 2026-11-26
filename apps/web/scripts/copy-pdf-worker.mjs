// Copies the PDF.js worker into public/vendor so the static export serves it
// from the same origin (no CDN, no third-party request).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const src = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'vendor');
mkdirSync(outDir, { recursive: true });
copyFileSync(src, join(outDir, 'pdf.worker.min.mjs'));
console.log('Copied PDF.js worker →', outDir);
