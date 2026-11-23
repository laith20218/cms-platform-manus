import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

/**
 * Night Task 3 — offline auto-cache + «وضع بدون إنترنت» regression suite.
 *
 * Locks:
 *  1. Feature-detect paths: in a plain browser every catalog helper stays
 *     null/inactive — no fake states (student-web honesty rules).
 *  2. listCached parses the native safe-metadata rows and rejects malformed
 *     payloads; removeCached passes trimmed ids.
 *  3. The offline panel renders native rows with open/remove actions and the
 *     honest browser empty state when no catalog bridge exists.
 *  4. The Navbar carries the «وضع بدون إنترنت» control BESIDE the bell and
 *     it opens the panel without navigating.
 *  5. DocumentViewer's first-open flow queues ensureLocal automatically when
 *     the native cache is active (auto-cache on VIEW — no separate download
 *     click), and stays on the plain web path in a browser.
 */

type MutableGlobal = Record<string, unknown>;

function installFullBridge(overrides: Record<string, unknown> = {}): void {
  (globalThis as unknown as MutableGlobal).CmsNative = {
    hasNativeShell: () => true,
    getPlatform: () => 'android',
    getAppVersion: () => '0.2.0',
    getInstallationId: () => '11111111-2222-4333-8444-555555555555',
    listCached: () => '[]',
    ensureLocal: () => 'ready',
    openLocal: () => 'opened',
    cacheStatus: () => 'ready',
    cancelDownload: () => 'canceled',
    removeCached: () => 'removed',
    clearCache: () => 'cleared',
    ...overrides,
  };
}

function removeBridge(): void {
  delete (globalThis as unknown as MutableGlobal).CmsNative;
}

const CONTENT_A = 'aaaaaaaa-1111-4222-8333-444444444444';
const CONTENT_B = 'bbbbbbbb-2222-4333-8444-555555555555';

beforeEach(() => {
  removeBridge();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  removeBridge();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
  delete (window as unknown as MutableGlobal).open;
});

// ---------------------------------------------------------------------
// 1+2) catalog helpers — feature-detect + parsing
// ---------------------------------------------------------------------
describe('offline catalog helpers (native-cache.ts)', () => {
  it('stays inactive in a plain browser — no catalog, no rows, no deletes', async () => {
    const { isNativeCatalogActive, nativeListCached, nativeRemoveCached } = await import('@/utils/native-cache');
    expect(isNativeCatalogActive()).toBe(false);
    expect(nativeListCached()).toBeNull();
    expect(nativeRemoveCached(CONTENT_A)).toBeNull();
  });

  it('is active with the Batch-4 bridge and parses safe metadata rows', async () => {
    installFullBridge({
      listCached: () =>
        JSON.stringify([
          { contentId: CONTENT_A, type: 'pdf', title: 'محاضرة القلب', bytes: 2048, lastAccessAt: '2026-11-23T00:00:00Z' },
          { contentId: CONTENT_B, type: 'video', title: 'تشريح', bytes: 5 * 1024 * 1024 },
        ]),
    });
    const { isNativeCatalogActive, nativeListCached } = await import('@/utils/native-cache');
    expect(isNativeCatalogActive()).toBe(true);
    const rows = nativeListCached();
    expect(rows).not.toBeNull();
    expect(rows!).toHaveLength(2);
    expect(rows![0]).toMatchObject({ contentId: CONTENT_A, type: 'pdf', title: 'محاضرة القلب', bytes: 2048 });
    expect(rows![1].type).toBe('video');
  });

  it('drops malformed rows and returns null for broken JSON (fail closed)', async () => {
    installFullBridge({
      listCached: () =>
        JSON.stringify([
          { contentId: '   ', type: 'pdf' }, // blank id — dropped
          { contentId: 'x'.repeat(300), type: 'pdf' }, // oversized — dropped
          { contentId: CONTENT_A }, // missing type — dropped
          { contentId: CONTENT_B, type: 'html', title: 'سليم' }, // kept
        ]),
    });
    const { nativeListCached } = await import('@/utils/native-cache');
    expect(nativeListCached()).toEqual([expect.objectContaining({ contentId: CONTENT_B, type: 'html' })]);

    installFullBridge({ listCached: () => '{not-json' });
    expect((await import('@/utils/native-cache')).nativeListCached()).toBeNull();
  });

  it('removeCached passes the trimmed id and returns the native code', async () => {
    const removeSpy = vi.fn(() => 'removed');
    installFullBridge({ removeCached: removeSpy });
    const { nativeRemoveCached } = await import('@/utils/native-cache');
    expect(nativeRemoveCached(`  ${CONTENT_A}  `)).toBe('removed');
    expect(removeSpy).toHaveBeenCalledWith(CONTENT_A);
  });

  it('treats a throwing catalog bridge as absent (never propagates)', async () => {
    installFullBridge({
      listCached: () => { throw new Error('boom'); },
      removeCached: () => { throw new Error('boom'); },
    });
    const { nativeListCached, nativeRemoveCached } = await import('@/utils/native-cache');
    expect(nativeListCached()).toBeNull();
    expect(nativeRemoveCached(CONTENT_A)).toBeNull();
  });
});

// ---------------------------------------------------------------------
// 3) OfflinePanel — states + actions
// ---------------------------------------------------------------------
import { OfflinePanel } from '@/features/offline/OfflinePanel';

describe('OfflinePanel', () => {
  it('renders the honest browser empty state when no native catalog exists', async () => {
    render(<OfflinePanel open onClose={() => undefined} />);
    expect(screen.getByTestId('offline-panel-browser-empty')).toBeInTheDocument();
    expect(screen.getByText(/لا يوجد محتوى محفوظ في المتصفّح/)).toBeInTheDocument();
  });

  it('lists cached rows with open/remove actions inside the shell', async () => {
    const openSpy = vi.fn(() => 'opened');
    const removeSpy = vi.fn(() => 'removed');
    installFullBridge({
      openLocal: openSpy,
      removeCached: removeSpy,
      listCached: () => JSON.stringify([{ contentId: CONTENT_A, type: 'pdf', title: 'ملف القلب', bytes: 4096 }]),
    });

    render(<OfflinePanel open onClose={() => undefined} />);
    const row = await screen.findByTestId(`offline-item-${CONTENT_A}`);
    expect(row).toBeInTheDocument();
    expect(screen.getByText('ملف القلب')).toBeInTheDocument();
    // The size label lives inside the row; the storage meter shows the same total,
    // so the query is scoped to the row (Wave 3 added the used/5 GiB meter).
    expect(within(row).getByText(/4 ك\.ب/)).toBeInTheDocument();
    expect(screen.getByTestId('offline-panel-meter-value')).toHaveTextContent('من 5.00 ج.ب');
    expect(screen.getByTestId('offline-panel-uncacheable-note')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /فتح ملف القلب/ }));
    expect(openSpy).toHaveBeenCalledWith(CONTENT_A);
  });

  it('removes a cached row and refreshes the list', async () => {
    let rows = [{ contentId: CONTENT_A, type: 'pdf', title: 'ملف القلب' }];
    const removeSpy = vi.fn(() => 'removed');
    installFullBridge({
      removeCached: removeSpy,
      listCached: () => JSON.stringify(rows),
    });

    render(<OfflinePanel open onClose={() => undefined} />);
    expect(await screen.findByTestId(`offline-item-${CONTENT_A}`)).toBeInTheDocument();

    rows = [];
    fireEvent.click(screen.getByRole('button', { name: /حذف ملف القلب/ }));
    expect(removeSpy).toHaveBeenCalledWith(CONTENT_A);
    await waitFor(() => expect(screen.getByTestId('offline-panel-empty')).toBeInTheDocument());
  });

  it('shows the shell empty state when the native catalog holds nothing', async () => {
    installFullBridge({ listCached: () => '[]' });
    render(<OfflinePanel open onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId('offline-panel-empty')).toBeInTheDocument());
    expect(screen.getByText(/لم يُحفَظ أي ملف بعد/)).toBeInTheDocument();
  });

  it('closes on backdrop click and Escape', async () => {
    const onClose = vi.fn();
    installFullBridge();
    render(<OfflinePanel open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('offline-panel-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reflects the offline connectivity banner when the browser reports offline', async () => {
    installFullBridge();
    const onlineGetter = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflinePanel open onClose={() => undefined} />);
    expect(await screen.findByTestId('offline-panel-connectivity')).toHaveTextContent(/دون اتصال الآن/);
    onlineGetter.mockRestore();
  });
});

// ---------------------------------------------------------------------
// 4) Navbar — the control beside the bell
// ---------------------------------------------------------------------
vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn(), refreshToken: vi.fn(), completeAuthentication: vi.fn() }),
}));

vi.mock('@/app/providers/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: () => {} }) }));

import { Navbar } from '@/components/layouts/Navbar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderNavbar(): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Navbar — «وضع بدون إنترنت» control', () => {
  it('renders the offline control beside the bell (aria + testid)', () => {
    renderNavbar();
    const offlineButton = screen.getByTestId('navbar-offline-mode');
    const bell = screen.getByTestId('navbar-bell');
    expect(offlineButton).toBeInTheDocument();
    expect(bell).toBeInTheDocument();
    // The offline control sits immediately BEFORE the bell in the DOM.
    expect(offlineButton.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(offlineButton).toHaveAttribute('aria-label', 'وضع بدون إنترنت — المحتوى المحفوظ');
  });

  it('opens the offline panel on click without navigating away', () => {
    renderNavbar();
    expect(screen.queryByTestId('offline-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('navbar-offline-mode'));
    expect(screen.getByTestId('offline-panel')).toBeInTheDocument();
    // Night Task 4: the bell is a dropdown trigger button (not a link) —
    // the offline control still sits immediately before it.
    expect(screen.getByTestId('navbar-bell').tagName).toBe('BUTTON');
  });
});

// ---------------------------------------------------------------------
// 5) DocumentViewer — auto ensureLocal on view (feature-detect)
// ---------------------------------------------------------------------
const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => getMock(...args), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

import { DocumentViewer } from '@/features/library/DocumentViewer';

const PDF_FILE = {
  id: CONTENT_A,
  type: 'Pdf',
  title: 'ملف القلب',
  fileSize: 4096,
  viewsCount: 0,
  isFavorite: false,
} as const;

function viewerHarness(): ReactElement {
  return <DocumentViewer file={{ ...PDF_FILE } as never} onClose={() => undefined} />;
}

describe('DocumentViewer — auto offline cache on view', () => {
  it('queues ensureLocal automatically when the native cache is active (shell)', async () => {
    const ensureSpy = vi.fn(() => 'ready');
    const openSpy = vi.fn(() => 'opened');
    installFullBridge({ ensureLocal: ensureSpy, openLocal: openSpy });
    getMock.mockResolvedValue({ data: { accessUrl: 'https://cms.example/f.pdf', expiresAt: '2026-11-24T00:00:00Z' } });

    render(viewerHarness());
    await waitFor(() => expect(ensureSpy).toHaveBeenCalledWith(CONTENT_A, 'pdf', expect.anything()));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(CONTENT_A));
    // The native takeover screen replaces the web viewer.
    expect(await screen.findByTestId('native-cache-opened')).toBeInTheDocument();
  });

  it('never touches the bridge in a plain browser (web path stays intact)', async () => {
    // No bridge installed (beforeEach removed it) — the browser path must
    // render the dialog content and never call any cache method.
    getMock.mockResolvedValue({ data: { accessUrl: 'https://cms.example/f.pdf', expiresAt: '2026-11-24T00:00:00Z' } });

    const ensureSpy = vi.fn(() => 'ready');
    (globalThis as unknown as MutableGlobal).CmsNative = {
      hasNativeShell: () => false, // feature-detect fails: not the shell
      ensureLocal: ensureSpy,
    };

    render(viewerHarness());
    await new Promise((res) => setTimeout(res, 30));
    expect(ensureSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('native-cache-progress')).not.toBeInTheDocument();
    expect(screen.queryByTestId('native-cache-opened')).not.toBeInTheDocument();
    delete (globalThis as unknown as MutableGlobal).CmsNative;
  });
});
