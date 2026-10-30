/**
 * Wave 11.9 — PdfPlayer font-pipeline contract (task book part I.2.E).
 *
 * Asserts the getDocument option flip that the whole Ghostscript pipeline
 * feeds: disableFontFace must be TRUE (R19 path rendering) for every file the
 * server did NOT re-embed, and FALSE (standard @font-face pipeline) ONLY when
 * the DTO carries fontPipelineFixed — the "{key}-fixed" Ghostscript output.
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

describe('PdfPlayer disableFontFace (Wave 11.9 font pipeline contract)', () => {
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

  it('flips to the standard @font-face pipeline (disableFontFace: false) ONLY for Ghostscript-fixed files', async () => {
    render(renderPlayer(true));
    await waitFor(() => expect(getDocumentMock).toHaveBeenCalled());

    const options = getDocumentMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options.disableFontFace).toBe(false);
  });
});
