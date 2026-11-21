import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 20.4 (owner decision 2) — the file-open loading layer + size hiding.
 *
 * Locks:
 *  1. File size is NOT shown on the library card anymore.
 *  2. Clicking a (non-streaming) card opens the loading LAYER (progressbar +
 *     percent + cancel) — progress comes from the wrapper-level content fetch
 *     in LibraryHub, NOT from any player core (C2).
 *  3. When the wrapper fetch resolves, the layer hands off to the unchanged
 *     DocumentViewer (library-file-viewer).
 *  4. A failed open shows the Arabic retry state — never a silent blank;
 *     retry re-runs the load and hands off on success.
 *  5. Streaming kinds (video) hand off directly — no fake byte-% layer.
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({ user: { fullName: 'طالب تجريبي' } }),
}));

// The DocumentViewer mounts inside Radix portals and fetches its own data —
// stub it to a lightweight marker so the handoff is observable without its I/O.
vi.mock('@/features/library/DocumentViewer', () => ({
  DocumentViewer: ({ file }: { file: { title: string } }) => (
    <div data-testid="document-viewer-stub">{file.title}</div>
  ),
}));

import { LibraryHub } from '@/features/my-studies/components/LibraryHub';

const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['LecturesText'] },
];

function file(id: string, type: string, title: string) {
  return {
    id, type, title, description: null, fileSize: 2048, viewsCount: 3,
    isFavorite: false, category: 'Lecture', createdAt: '2026-01-01', publicCode: '001234',
  };
}

const PDF = file('file-1', 'Pdf', 'ملف القلب');
const VIDEO = file('file-2', 'Video', 'فيديو القلب');

function stubLibrary(opts?: { contentFails?: boolean }) {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url.includes('/library/subject/s1')) {
      return { data: { items: [PDF, VIDEO], total: 2, page: 1, pageSize: 100, totalPages: 1 } };
    }
    if (url.includes('/library/file-1/content')) {
      if (opts?.contentFails) throw new Error('Network Error');
      return { data: new Blob(['pdf-bytes']) };
    }
    return { data: [] };
  });
}

function renderHub() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/study?tab=library']}>
        <LibraryHub />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('W20.4 — file size hidden on cards', () => {
  it('renders no KB/MB/GB size anywhere on the library cards', async () => {
    stubLibrary();
    renderHub();

    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(2), { timeout: 4000 });
    for (const card of screen.getAllByTestId('library-card')) {
      expect(card.textContent).not.toMatch(/\d+\s*(KB|MB|GB|B)/);
    }
  });
});

describe('W20.4 — the file-open loading layer', () => {
  it('a non-streaming card opens the LAYER (bar + percent + cancel), then hands off to the viewer', async () => {
    // Hold the content fetch open until the layer assertions ran — the mock
    // resolving instantly would flash the layer away before it can be locked.
    const gate: { release: () => void } = { release: () => {} };
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
      if (url.includes('/library/subject/s1')) {
        return { data: { items: [PDF, VIDEO], total: 2, page: 1, pageSize: 100, totalPages: 1 } };
      }
      if (url.includes('/library/file-1/content')) {
        await new Promise<void>((resolve) => { gate.release = resolve; });
        return { data: new Blob(['pdf-bytes']) };
      }
      return { data: [] };
    });
    renderHub();

    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(2), { timeout: 4000 });
    const pdfCard = screen.getAllByTestId('library-card').find((card) => card.textContent?.includes('ملف القلب'));
    expect(pdfCard).toBeTruthy();
    fireEvent.click(pdfCard!);

    // The layer appears on the open path with the progress affordances.
    const layer = await screen.findByTestId('file-open-layer');
    expect(layer).toBeInTheDocument();
    expect(screen.getByTestId('file-open-progress')).toBeInTheDocument();
    expect(screen.getByTestId('file-open-percent')).toBeInTheDocument();
    expect(screen.getByTestId('file-open-cancel')).toBeInTheDocument();

    // The wrapper-level content fetch fired (progress source outside player cores).
    await waitFor(() => {
      expect(getMock.mock.calls.some(([url]) => String(url).includes('/library/file-1/content'))).toBe(true);
    });

    // Release the fetch → handoff: the layer clears and the unchanged
    // DocumentViewer mounts.
    gate.release();
    await waitFor(() => expect(screen.queryByTestId('file-open-layer')).toBeNull(), { timeout: 4000 });
    expect(screen.getByTestId('document-viewer-stub').textContent).toBe('ملف القلب');
  });

  it('a failed open shows the Arabic retry state and recovers on retry', async () => {
    let fails = true;
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
      if (url.includes('/library/subject/s1')) {
        return { data: { items: [PDF], total: 1, page: 1, pageSize: 100, totalPages: 1 } };
      }
      if (url.includes('/library/file-1/content')) {
        if (fails) throw new Error('Network Error');
        return { data: new Blob(['pdf-bytes']) };
      }
      return { data: [] };
    });
    renderHub();

    const pdfCard = await waitFor(() => {
      const card = screen.getAllByTestId('library-card').find((c) => c.textContent?.includes('ملف القلب'));
      expect(card).toBeTruthy();
      return card!;
    }, { timeout: 4000 });
    fireEvent.click(pdfCard);

    await waitFor(() => expect(screen.getByTestId('file-open-layer').textContent).toContain('تعذّر تحميل الملف'), { timeout: 4000 });
    expect(screen.getByTestId('file-open-retry')).toBeInTheDocument();

    // Retry: the next load succeeds → layer clears → viewer mounts.
    fails = false;
    fireEvent.click(screen.getByTestId('file-open-retry'));
    await waitFor(() => expect(screen.queryByTestId('file-open-layer')).toBeNull(), { timeout: 4000 });
    expect(screen.getByTestId('document-viewer-stub').textContent).toBe('ملف القلب');
  });

  it('cancel aborts the open and returns to the grid without a viewer', async () => {
    const never = () => new Promise(() => { /* hangs until aborted */ });
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
      if (url.includes('/library/subject/s1')) {
        return { data: { items: [PDF], total: 1, page: 1, pageSize: 100, totalPages: 1 } };
      }
      if (url.includes('/library/file-1/content')) return never();
      return { data: [] };
    });
    renderHub();

    const pdfCard = await waitFor(() => {
      const card = screen.getAllByTestId('library-card').find((c) => c.textContent?.includes('ملف القلب'));
      expect(card).toBeTruthy();
      return card!;
    }, { timeout: 4000 });
    fireEvent.click(pdfCard);

    expect(await screen.findByTestId('file-open-layer')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('file-open-cancel'));

    await waitFor(() => expect(screen.queryByTestId('file-open-layer')).toBeNull());
    expect(screen.queryByTestId('document-viewer-stub')).toBeNull();
    // The grid is still there — the cancel is a clean exit, not a dead end.
    expect(screen.getAllByTestId('library-card').length).toBe(1);
  });

  it('streaming (video) and token-gated (html) kinds hand off directly — no byte-% layer', async () => {
    const HTML = file('file-3', 'Html', 'درس تفاعلي');
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
      if (url.includes('/library/subject/s1')) {
        return { data: { items: [VIDEO, HTML], total: 2, page: 1, pageSize: 100, totalPages: 1 } };
      }
      return { data: [] };
    });
    renderHub();

    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(2), { timeout: 4000 });

    // Video — streamed by its player.
    const videoCard = screen.getAllByTestId('library-card').find((card) => card.textContent?.includes('فيديو القلب'));
    fireEvent.click(videoCard!);
    await waitFor(() => expect(screen.getByTestId('document-viewer-stub').textContent).toBe('فيديو القلب'), { timeout: 4000 });
    expect(screen.queryByTestId('file-open-layer')).toBeNull();

    // HTML — the HtmlPlayer owns its loading state and reads the token-gated
    // /html-view channel (R51); the /content channel is never fetched for it.
    const htmlCard = screen.getAllByTestId('library-card').find((card) => card.textContent?.includes('درس تفاعلي'));
    fireEvent.click(htmlCard!);
    await waitFor(() => expect(screen.getByTestId('document-viewer-stub').textContent).toBe('درس تفاعلي'), { timeout: 4000 });
    expect(screen.queryByTestId('file-open-layer')).toBeNull();
    expect(getMock.mock.calls.some(([url]) => String(url).includes('/content'))).toBe(false);
  });
});
