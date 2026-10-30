import { GlobalWorkerOptions } from 'pdfjs-dist';
// Vite `?url` import — the worker ships as its own emitted asset, loaded once
// by the pdf.js engine (never bundled into the main graph).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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
