/**
 * R22 — PdfPlayer font-pipeline contract (task book part R22.1).
 *
 * Path rendering is UNIVERSAL again: disableFontFace must be TRUE for EVERY
 * file — legacy rows, over-ceiling skips, failed runs AND Ghostscript-fixed
 * files alike. The Wave 11.9 per-file @font-face exception (fontPipelineFixed
 * → disableFontFace: false) is rolled back: production showed Word-generated
 * PDFs with pre-shaped/broken text streams that the font pipeline still
 * mis-maps. Ghostscript keeps running server-side for font hygiene and the
 * diagnostics report, but the canvas never trusts @font-face.
 *
 * The ONLY escape hatch is the ?pdfFonts=embedded diagnostic override
 * (pdf-debug.ts) which forces disableFontFace: false for field A/B.
 *
 * The pdf.js module is mocked: no canvas painting, no worker, no real parsing —
 * the test pins the EXACT options object the player hands to getDocument.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

// vi.hoisted: the mock factories below run at IMPORT time (before the module
// body initializes consts) — the spy must exist in the hoisted scope.
const { getDocumentMock } = vi.hoisted(() => ({ getDocumentMock: vi.fn() }));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: (options: unknown) => {
    getDocumentMock(options);
    return {
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 612, height: 792 }),
          render: () => ({ promise: Promise.resolve() }),
          getTextContent: async () => ({ items: [] }),
        }),
        destroy: async () => {},
      }),
      destroy: async () => {},
    };
  },
  // The TextLayer import must exist (the player constructs it per page — it
  // never runs here because no page becomes visible in jsdom).
  TextLayer: class {},
}));

vi.mock('@/features/media-player/pdf/pdf-worker', () => ({ ensurePdfWorker: () => {} }));
vi.mock('@/features/library/services/library-api', () => ({
  libraryApi: {
    // jsdom's Blob predates .arrayBuffer() — hand the player a blob-shaped
    // object (the exact contract getContentBlob must honour).
    getContentBlob: async () =>
      ({ arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer }) as unknown as Blob,
  },
}));
vi.mock('@/features/media-player/pdf/usePdfAnnotations', () => ({
  usePdfAnnotations: () => ({ annotations: new Map(), upsert: vi.fn(), saving: false }),
}));

import { PdfPlayer } from '../PdfPlayer';

// jsdom lacks IntersectionObserver — the page-visibility effect registers one
// on mount; a never-intersecting stub keeps pages unrendered (light test).
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    observe() { /* no-op */ }
    unobserve() { /* no-op */ }
    disconnect() { /* no-op */ }
    takeRecords() { return []; }
  }
  (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserverStub }).IntersectionObserver =
    IntersectionObserverStub;
}

function renderPlayer(fontPipelineFixed?: boolean): ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <PdfPlayer assetType="library-file" assetId="file-1" fontPipelineFixed={fontPipelineFixed} />
    </QueryClientProvider>
  );
}

describe('PdfPlayer disableFontFace (R22 universal path rendering)', () => {
  beforeEach(() => {
    getDocumentMock.mockClear();
  });

  it('keeps R19 path rendering (disableFontFace: true) when the prop is absent/undefined — legacy rows, skipped and failed runs', async () => {
    render(renderPlayer(undefined));
    await waitFor(() => expect(getDocumentMock).toHaveBeenCalled());

    const options = getDocumentMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options.disableFontFace).toBe(true);
    expect(options.cMapPacked).toBe(true);
    expect(options.useSystemFonts).toBe(true);
  });

  it('explicit false stays path rendering (the safe default)', async () => {
    render(renderPlayer(false));
    await waitFor(() => expect(getDocumentMock).toHaveBeenCalled());

    const options = getDocumentMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options.disableFontFace).toBe(true);
  });

  it('R22 rollback: Ghostscript-fixed files (fontPipelineFixed=true) ALSO stay on path rendering', async () => {
    // The Wave 11.9 contract flipped to disableFontFace: false here; production
    // proved pre-shaped Word PDFs still break, so the flip is rolled back.
    render(renderPlayer(true));
    await waitFor(() => expect(getDocumentMock).toHaveBeenCalled());

    const options = getDocumentMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options.disableFontFace).toBe(true);
  });

  it('honors the ?pdfFonts=embedded diagnostic override (disableFontFace: false)', async () => {
    // pdf-debug reads window.location.search ONCE per module instance — spin a
    // fresh PdfPlayer module graph with the override in the URL.
    window.history.replaceState(null, '', '/?pdfFonts=embedded');
    vi.resetModules();
    try {
      const { PdfPlayer: FreshPlayer } = await import('../PdfPlayer');
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <FreshPlayer assetType="library-file" assetId="file-1" />
        </QueryClientProvider>,
      );
      await waitFor(() => expect(getDocumentMock).toHaveBeenCalled());

      const options = getDocumentMock.mock.calls[0][0] as Record<string, unknown>;
      expect(options.disableFontFace).toBe(false);
    } finally {
      window.history.replaceState(null, '', '/');
      vi.resetModules();
    }
  });
});
