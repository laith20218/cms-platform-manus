import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
// Vite `?url` import — the worker ships as its own emitted asset, loaded once
// by the pdf.js engine (never bundled into the main graph). The LEGACY build
// is deliberate: pdf.js v6's modern build assumes bleeding-edge JS baseline
// (Map.prototype.getOrInsertComputed) that real student browsers — and the
// e2e Chromium — lack; the legacy build ships core-js polyfills for exactly
// this class of gap.
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

let configured = false;

/**
 * Point pdf.js at its module worker exactly once per app session. Called at
 * PdfPlayer module scope (the player is code-split, so the worker URL asset
 * only materializes when the PDF feature chunk is actually requested).
 */
export function ensurePdfWorker(): void {
  if (configured) return;
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  configured = true;
}
