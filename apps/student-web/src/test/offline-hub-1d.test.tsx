import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 1 (UX 1D) — offline hub + contextual download CTA regression suite.
 *
 * Locks:
 *  1. Packages wrapper (native-packages.ts): feature-detect in a plain
 *     browser, safe-row parsing, malformed rows dropped / broken JSON and
 *     throwing bridges → null (fail closed), trimmed ids, the exact Arabic
 *     deny-message map.
 *  2. Courses wrapper (native-courses.ts): same rigor (parse + malformed)
 *     plus the YOUTUBE_EPISODE_OFFLINE_NOTE honesty export.
 *  3. OfflinePanel hub: three tabs render, media stays the DEFAULT tab (the
 *     Night Task 3 media testids surface WITHOUT switching), the packages and
 *     courses tabs carry honest unavailable states when the surfaces are
 *     absent, and active surfaces list rows with open/remove actions.
 *  4. OfflineDownloadCta: invisible in a plain browser, honest update toast
 *     on older shells, started/deny/ready toasts via the toast spy.
 *  5. ExamPage integration: the exam-phase header carries the CTA inside the
 *     shell and hides it in a plain browser.
 */

type MutableGlobal = Record<string, unknown>;

function installFullBridge(overrides: Record<string, unknown> = {}): void {
  (globalThis as unknown as MutableGlobal).CmsNative = {
    hasNativeShell: () => true,
    getPlatform: () => 'android',
    getAppVersion: () => '0.3.0',
    getInstallationId: () => '11111111-2222-4333-8444-555555555555',
    // Batch-4 media cache + Night Task 3 catalog
    listCached: () => '[]',
    ensureLocal: () => 'ready',
    openLocal: () => 'opened',
    cacheStatus: () => 'ready',
    removeCached: () => 'removed',
    // Wave 2 packages contract
    listOfflinePackages: () => '[]',
    downloadOfflinePackage: () => 'started',
    offlinePackageStatus: () => 'absent',
    removeOfflinePackage: () => 'removed',
    openOfflineExam: () => 'opened',
    // Wave 5 courses contract
    listOfflineCourseEpisodes: () => '[]',
    ensureCourseEpisodeLocal: () => 'started',
    courseEpisodeStatus: () => 'absent',
    removeOfflineCourseEpisode: () => 'removed',
    openOfflineCourseEpisode: () => 'opened',
    ...overrides,
  };
}

/** An older app build: shell + media cache, but NEITHER new surface (pre-Wave-2/5). */
function installOlderShell(): void {
  installFullBridge({
    listOfflinePackages: undefined,
    downloadOfflinePackage: undefined,
    offlinePackageStatus: undefined,
    removeOfflinePackage: undefined,
    openOfflineExam: undefined,
    listOfflineCourseEpisodes: undefined,
    ensureCourseEpisodeLocal: undefined,
    courseEpisodeStatus: undefined,
    removeOfflineCourseEpisode: undefined,
    openOfflineCourseEpisode: undefined,
  });
}

function removeBridge(): void {
  delete (globalThis as unknown as MutableGlobal).CmsNative;
}

const PACKAGE_ID = 'pkg-11111111-2222-4333-8444-555555555555';
const EPISODE_ID = 'epi-11111111-2222-4333-8444-555555555555';
const CONTENT_A = 'aaaaaaaa-1111-4222-8333-444444444444';

// ---- sonner toast spy (hoisted so the CTA + ExamPage see the mock) ----
const { toastMessageMock, toastErrorMock } = vi.hoisted(() => ({
  toastMessageMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { message: toastMessageMock, error: toastErrorMock, success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ---- ExamPage mount mock: the minimal DTO the page loads on open ----
const { examApiMock } = vi.hoisted(() => {
  const session = {
    sessionId: 'es1',
    examId: 'ex1',
    examTitle: 'اختبار القلب',
    status: 'InProgress',
    totalQuestions: 1,
    durationMinutes: 30,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    currentQuestionOrder: 0,
    questions: [
      {
        id: 'sq1',
        sourceQuestionId: 'q1',
        number: 1,
        type: 'Mcq',
        text: 'ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟',
        textHtml: null,
        options: [
          { id: 'so1', letter: 'A', text: 'ألم صدري ضاغط', textHtml: null, imageUrl: null },
          { id: 'so2', letter: 'B', text: 'طنين في الأذن', textHtml: null, imageUrl: null },
        ],
        images: [],
        savedAnswer: null,
      },
    ],
  };
  return {
    examApiMock: {
      start: vi.fn(async () => session),
      getSession: vi.fn(async () => session),
      saveAnswer: vi.fn(async () => ({
        sessionId: 'es1',
        questionId: 'sq1',
        savedAnswer: null,
        answeredQuestions: 1,
        currentQuestionOrder: 0,
        expiresAt: session.expiresAt,
        status: 'InProgress',
      })),
      saveProgress: vi.fn(async () => undefined),
      submit: vi.fn(async () => ({ data: {} })),
      cancel: vi.fn(async () => ({})),
      getResults: vi.fn(async () => ({})),
      getReview: vi.fn(async () => ({})),
      getById: vi.fn(async () => ({})),
      getBySubject: vi.fn(async () => ({})),
    },
  };
});

vi.mock('@/features/exams/services/exam-api', () => ({ examApi: examApiMock }));

beforeEach(() => {
  removeBridge();
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  removeBridge();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------
// 1) packages wrapper — feature-detect + parsing + deny map
// ---------------------------------------------------------------------
describe('offline packages wrapper (native-packages.ts)', () => {
  it('stays inactive in a plain browser — no rows, no downloads, no deletes', async () => {
    const {
      isNativePackagesSurfaceActive,
      nativeListOfflinePackages,
      nativeRemoveOfflinePackage,
      nativeDownloadOfflinePackage,
    } = await import('@/utils/native-packages');
    expect(isNativePackagesSurfaceActive()).toBe(false);
    expect(nativeListOfflinePackages()).toBeNull();
    expect(nativeRemoveOfflinePackage(PACKAGE_ID)).toBeNull();
    expect(nativeDownloadOfflinePackage({ subjectId: 'sub-1' })).toBeNull();
  });

  it('is active with the full bridge and parses safe metadata rows', async () => {
    installFullBridge({
      listOfflinePackages: () =>
        JSON.stringify([
          {
            packageId: PACKAGE_ID,
            subjectIds: ['sub-1', '  sub-2  '],
            title: 'حزمة القلب',
            status: 'active',
            expiresAt: '2027-01-01T00:00:00Z',
            questionCount: 40,
            pendingAnswerCount: 2,
            downloadedAt: '2026-11-23T00:00:00Z',
          },
        ]),
    });
    const { isNativePackagesSurfaceActive, nativeListOfflinePackages } = await import('@/utils/native-packages');
    expect(isNativePackagesSurfaceActive()).toBe(true);
    const rows = nativeListOfflinePackages();
    expect(rows).not.toBeNull();
    expect(rows!).toHaveLength(1);
    // subjectIds are trimmed; every safe field survives.
    expect(rows![0]).toMatchObject({
      packageId: PACKAGE_ID,
      subjectIds: ['sub-1', 'sub-2'],
      title: 'حزمة القلب',
      status: 'active',
      expiresAt: '2027-01-01T00:00:00Z',
      questionCount: 40,
      pendingAnswerCount: 2,
    });
  });

  it('drops malformed rows and returns null for broken JSON (fail closed)', async () => {
    installFullBridge({
      listOfflinePackages: () =>
        JSON.stringify([
          { subjectIds: [], status: 'active', expiresAt: '2027-01-01T00:00:00Z' }, // no packageId — dropped
          { packageId: '   ', status: 'active', expiresAt: '2027-01-01T00:00:00Z' }, // blank id — dropped
          { packageId: 'x'.repeat(300), status: 'active', expiresAt: '2027-01-01T00:00:00Z' }, // oversized — dropped
          { packageId: 'p2', status: 'weird', expiresAt: '2027-01-01T00:00:00Z' }, // bad status — dropped
          { packageId: 'p3', status: 'active' }, // missing expiry — dropped
          { packageId: 'p4', status: 'active', expiresAt: 'not-a-date' }, // unparseable expiry — dropped
          { packageId: PACKAGE_ID, status: 'revoked', expiresAt: '2027-01-01T00:00:00Z' }, // kept
        ]),
    });
    const { nativeListOfflinePackages } = await import('@/utils/native-packages');
    expect(nativeListOfflinePackages()).toEqual([expect.objectContaining({ packageId: PACKAGE_ID, status: 'revoked' })]);

    installFullBridge({ listOfflinePackages: () => '{not-json' });
    expect((await import('@/utils/native-packages')).nativeListOfflinePackages()).toBeNull();
  });

  it('treats a throwing packages bridge as absent (never propagates)', async () => {
    installFullBridge({
      listOfflinePackages: () => { throw new Error('boom'); },
      removeOfflinePackage: () => { throw new Error('boom'); },
      downloadOfflinePackage: () => { throw new Error('boom'); },
    });
    const {
      nativeListOfflinePackages,
      nativeRemoveOfflinePackage,
      nativeDownloadOfflinePackage,
    } = await import('@/utils/native-packages');
    expect(nativeListOfflinePackages()).toBeNull();
    expect(nativeRemoveOfflinePackage(PACKAGE_ID)).toBeNull();
    expect(nativeDownloadOfflinePackage({ subjectId: 'sub-1' })).toBeNull();
  });

  it('removeOfflinePackage passes the trimmed id and returns the native code', async () => {
    const removeSpy = vi.fn(() => 'removed');
    installFullBridge({ removeOfflinePackage: removeSpy });
    const { nativeRemoveOfflinePackage } = await import('@/utils/native-packages');
    expect(nativeRemoveOfflinePackage(`  ${PACKAGE_ID}  `)).toBe('removed');
    expect(removeSpy).toHaveBeenCalledWith(PACKAGE_ID);
  });

  it('serializes the download request itself and fails closed without any scope id', async () => {
    const downloadSpy = vi.fn<(requestJson: string) => string>(() => 'started');
    installFullBridge({ downloadOfflinePackage: downloadSpy });
    const { nativeDownloadOfflinePackage } = await import('@/utils/native-packages');
    const code = nativeDownloadOfflinePackage({ subjectId: '  sub-1  ', examId: 'ex-1', accessToken: ' tok ', title: ' حزمة القلب ' });
    expect(code).toBe('started');
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(downloadSpy.mock.calls[0][0])).toEqual({
      subjectId: 'sub-1',
      examId: 'ex-1',
      accessToken: 'tok',
      title: 'حزمة القلب',
    });
    // No subjectId AND no examId → our own bug, null without a native call.
    expect(nativeDownloadOfflinePackage({ title: 'x' })).toBeNull();
    expect(downloadSpy).toHaveBeenCalledTimes(1);
  });

  it('deny message map hits the exact Arabic strings (spot-check)', async () => {
    const { nativePackageDenyMessage } = await import('@/utils/native-packages');
    expect(nativePackageDenyMessage('denied_disabled')).toBe('ميزة الحزم دون اتصال غير مفعّلة في هذا الإصدار من التطبيق.');
    expect(nativePackageDenyMessage('denied_offline')).toBe('لا يوجد اتصال بالإنترنت — تحميل الحزم يحتاج اتصالاً مرة واحدة.');
    expect(nativePackageDenyMessage('denied_native_session')).toBe('لتخزين الحزم دون اتصال سجّل الدخول أولاً ثم أعد المحاولة.');
    expect(nativePackageDenyMessage('quota')).toBe('مساحة التخزين دون اتصال ممتلئة — احذف بعض الحزم أو الملفات من «وضع بدون إنترنت».');
    expect(nativePackageDenyMessage('invalid_args')).toBeNull();
    expect(nativePackageDenyMessage('error:disk')).toBe('حدث خطأ أثناء تجهيز الحزمة دون اتصال.');
  });
});

// ---------------------------------------------------------------------
// 2) courses wrapper — same rigor + the YouTube honesty export
// ---------------------------------------------------------------------
describe('offline courses wrapper (native-courses.ts)', () => {
  it('stays inactive in a plain browser', async () => {
    const {
      isNativeCoursesSurfaceActive,
      nativeListOfflineCourseEpisodes,
      nativeRemoveOfflineCourseEpisode,
      nativeEnsureCourseEpisodeLocal,
    } = await import('@/utils/native-courses');
    expect(isNativeCoursesSurfaceActive()).toBe(false);
    expect(nativeListOfflineCourseEpisodes()).toBeNull();
    expect(nativeRemoveOfflineCourseEpisode(EPISODE_ID)).toBeNull();
    expect(nativeEnsureCourseEpisodeLocal({ episodeId: EPISODE_ID })).toBeNull();
  });

  it('parses safe rows, drops malformed ones, and passes trimmed ids', async () => {
    const removeSpy = vi.fn(() => 'removed');
    installFullBridge({
      removeOfflineCourseEpisode: removeSpy,
      listOfflineCourseEpisodes: () =>
        JSON.stringify([
          { title: 'no id' }, // dropped
          { episodeId: '   ', title: 'blank id' }, // dropped
          {
            episodeId: EPISODE_ID,
            courseId: '  c1  ',
            title: 'الحلقة الأولى',
            type: 'video',
            bytes: 5 * 1024 * 1024,
            status: 'ready',
            downloadedAt: '2026-11-23T00:00:00Z',
          },
          { episodeId: 'ep2', type: 'weird', bytes: -5 }, // kept; junk optional fields become undefined
        ]),
    });
    const { isNativeCoursesSurfaceActive, nativeListOfflineCourseEpisodes, nativeRemoveOfflineCourseEpisode } = await import('@/utils/native-courses');
    expect(isNativeCoursesSurfaceActive()).toBe(true);
    const rows = nativeListOfflineCourseEpisodes();
    expect(rows).not.toBeNull();
    expect(rows!).toHaveLength(2);
    expect(rows![0]).toMatchObject({ episodeId: EPISODE_ID, courseId: 'c1', title: 'الحلقة الأولى', type: 'video', bytes: 5 * 1024 * 1024 });
    expect(rows![1].type).toBeUndefined();
    expect(rows![1].bytes).toBeUndefined();
    expect(nativeRemoveOfflineCourseEpisode(`  ${EPISODE_ID}  `)).toBe('removed');
    expect(removeSpy).toHaveBeenCalledWith(EPISODE_ID);

    installFullBridge({ listOfflineCourseEpisodes: () => '{not-json' });
    expect((await import('@/utils/native-courses')).nativeListOfflineCourseEpisodes()).toBeNull();
  });

  it('exports the exact YouTube honesty note and tailored deny texts', async () => {
    const { YOUTUBE_EPISODE_OFFLINE_NOTE, nativeCourseDenyMessage } = await import('@/utils/native-courses');
    expect(YOUTUBE_EPISODE_OFFLINE_NOTE).toBe('حلقات يوتيوب تُشاهَد من الويب فقط عند توفر الاتصال — لا تُحمَّل للعرض دون اتصال.');
    expect(nativeCourseDenyMessage('denied_offline')).toBe('لا يوجد اتصال — تحميل حلقات الكورس يحتاج اتصالاً مرة واحدة.');
    expect(nativeCourseDenyMessage('invalid_args')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// 3) OfflinePanel — the three-tab offline hub
// ---------------------------------------------------------------------
import { OfflinePanel } from '@/features/offline/OfflinePanel';

function renderPanel(): void {
  render(<OfflinePanel open onClose={() => undefined} />);
}

describe('OfflinePanel hub (three tabs)', () => {
  it('renders three tabs with media selected by default', () => {
    installFullBridge();
    renderPanel();
    expect(screen.getByRole('tablist', { name: 'أقسام وضع بدون إنترنت' })).toBeInTheDocument();
    expect(screen.getByTestId('offline-panel-tab-media')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('offline-panel-tab-packages')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('offline-panel-tab-courses')).toHaveAttribute('aria-selected', 'false');
  });

  it('keeps the media list as the default tab — Night Task 3 testids surface without switching', async () => {
    installFullBridge({
      listCached: () => JSON.stringify([{ contentId: CONTENT_A, type: 'pdf', title: 'ملف القلب', bytes: 4096 }]),
    });
    renderPanel();
    // NO tab switch: the media rows, meter and uncacheable note are the default view.
    expect(await screen.findByTestId(`offline-item-${CONTENT_A}`)).toBeInTheDocument();
    expect(screen.getByTestId('offline-panel-list')).toBeInTheDocument();
    expect(screen.getByTestId('offline-panel-meter')).toBeInTheDocument();
    expect(screen.getByTestId('offline-panel-uncacheable-note')).toBeInTheDocument();
  });

  it('supports arrow-key tab navigation', () => {
    installFullBridge();
    renderPanel();
    fireEvent.keyDown(screen.getByTestId('offline-panel-tabs'), { key: 'ArrowRight' });
    expect(screen.getByTestId('offline-panel-tab-packages')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('offline-panel-tab-media')).toHaveAttribute('aria-selected', 'false');
  });

  it('packages tab: honest browser state when no bridge exists at all', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('offline-panel-tab-packages'));
    const state = screen.getByTestId('offline-packages-unavailable');
    expect(state).toBeInTheDocument();
    expect(state).toHaveTextContent('حزم الأسئلة دون اتصال تعمل داخل تطبيق أندرويد فقط.');
  });

  it('packages tab: older shell explains the app update path', () => {
    installOlderShell();
    renderPanel();
    fireEvent.click(screen.getByTestId('offline-panel-tab-packages'));
    expect(screen.getByTestId('offline-packages-unavailable')).toHaveTextContent(
      'حزم الأسئلة دون اتصال تتوفر بعد تحديث التطبيق إلى الإصدار الأحدث.',
    );
  });

  it('packages tab: lists rows with Arabic labels, question count, status badge and open action', async () => {
    const openSpy = vi.fn(() => 'opened');
    installFullBridge({
      openOfflineExam: openSpy,
      listOfflinePackages: () =>
        JSON.stringify([
          {
            packageId: PACKAGE_ID,
            subjectIds: ['sub-1'],
            title: 'حزمة القلب',
            status: 'active',
            expiresAt: '2027-01-01T00:00:00Z',
            questionCount: 40,
            pendingAnswerCount: 2,
          },
        ]),
    });
    renderPanel();
    fireEvent.click(screen.getByTestId('offline-panel-tab-packages'));
    const row = await screen.findByTestId(`offline-package-${PACKAGE_ID}`);
    expect(screen.getByText('حزمة القلب')).toBeInTheDocument();
    expect(within(row).getByText(/40 سؤال/)).toBeInTheDocument();
    expect(within(row).getByText(/إجابات بانتظار المزامنة: 2/)).toBeInTheDocument();
    expect(within(row).getByText(/تنتهي:/)).toBeInTheDocument();
    expect(screen.getByTestId(`offline-package-status-${PACKAGE_ID}`)).toHaveTextContent('صالحة');

    fireEvent.click(screen.getByTestId(`offline-package-open-${PACKAGE_ID}`));
    expect(openSpy).toHaveBeenCalledWith(PACKAGE_ID);
  });

  it('packages tab: remove calls the wrapper and refreshes into the empty state', async () => {
    const rows = [
      {
        packageId: PACKAGE_ID,
        subjectIds: ['sub-1'],
        status: 'active',
        expiresAt: '2027-01-01T00:00:00Z',
        questionCount: 5,
      },
    ];
    let list = rows;
    const removeSpy = vi.fn(() => 'removed');
    installFullBridge({
      removeOfflinePackage: removeSpy,
      listOfflinePackages: () => JSON.stringify(list),
    });
    renderPanel();
    fireEvent.click(screen.getByTestId('offline-panel-tab-packages'));
    expect(await screen.findByTestId(`offline-package-${PACKAGE_ID}`)).toBeInTheDocument();

    list = [];
    fireEvent.click(screen.getByTestId(`offline-package-remove-${PACKAGE_ID}`));
    expect(removeSpy).toHaveBeenCalledWith(PACKAGE_ID);
    await waitFor(() => expect(screen.getByTestId('offline-packages-empty')).toBeInTheDocument());
    expect(screen.getByText(/لم تُحمَّل أي حزمة بعد/)).toBeInTheDocument();
  });

  it('packages tab: active surface with no rows shows the guidance empty state', async () => {
    installFullBridge({ listOfflinePackages: () => '[]' });
    renderPanel();
    fireEvent.click(screen.getByTestId('offline-panel-tab-packages'));
    await waitFor(() => expect(screen.getByTestId('offline-packages-empty')).toBeInTheDocument());
    expect(screen.getByText(/«تحميل دون اتصال»/)).toBeInTheDocument();
  });

  it('courses tab: honest state on an older shell', () => {
    installOlderShell();
    renderPanel();
    fireEvent.click(screen.getByTestId('offline-panel-tab-courses'));
    expect(screen.getByTestId('offline-courses-unavailable')).toHaveTextContent(
      'تحميل حلقات الكورس دون اتصال يتوفر بعد تحديث التطبيق.',
    );
  });

  it('courses tab: lists downloaded episodes with open/remove actions', async () => {
    const openSpy = vi.fn(() => 'opened');
    installFullBridge({
      openOfflineCourseEpisode: openSpy,
      listOfflineCourseEpisodes: () =>
        JSON.stringify([{ episodeId: EPISODE_ID, title: 'حلقة التشريح', type: 'video', bytes: 5 * 1024 * 1024 }]),
    });
    renderPanel();
    fireEvent.click(screen.getByTestId('offline-panel-tab-courses'));
    const row = await screen.findByTestId(`offline-course-episode-${EPISODE_ID}`);
    expect(screen.getByText('حلقة التشريح')).toBeInTheDocument();
    expect(within(row).getByText(/فيديو/)).toBeInTheDocument();
    expect(screen.getByTestId('offline-panel-uncacheable-note')).toBeInTheDocument(); // YouTube note rides the courses tab

    fireEvent.click(screen.getByTestId(`offline-course-open-${EPISODE_ID}`));
    expect(openSpy).toHaveBeenCalledWith(EPISODE_ID);
  });
});

// ---------------------------------------------------------------------
// 4) OfflineDownloadCta — the shared contextual CTA
// ---------------------------------------------------------------------
import { OfflineDownloadCta } from '@/features/offline/OfflineDownloadCta';

describe('OfflineDownloadCta', () => {
  it('renders NOTHING in a plain browser (zero noise outside the shell)', () => {
    const { container } = render(
      <>
        <OfflineDownloadCta kind="package" subjectId="sub-1" testId="cta-package" />
        <OfflineDownloadCta kind="episode" episodeId="ep-1" testId="cta-episode" />
      </>,
    );
    expect(screen.queryByTestId('cta-package')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cta-episode')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('package CTA: honest update toast when the shell lacks the packages surface', () => {
    installOlderShell();
    render(<OfflineDownloadCta kind="package" subjectId="sub-1" testId="cta-package" />);
    fireEvent.click(screen.getByTestId('cta-package'));
    expect(toastMessageMock).toHaveBeenCalledWith('تحميل الحزم دون اتصال يتوفر بعد تحديث التطبيق.');
  });

  it('episode CTA: honest update toast when the shell lacks the courses surface', () => {
    installOlderShell();
    render(<OfflineDownloadCta kind="episode" episodeId="ep-1" testId="cta-episode" />);
    fireEvent.click(screen.getByTestId('cta-episode'));
    expect(toastMessageMock).toHaveBeenCalledWith('تحميل حلقات الكورس دون اتصال يتوفر بعد تحديث التطبيق.');
  });

  it('package CTA: serializes the request (token included) and toasts the started copy', () => {
    const downloadSpy = vi.fn<(requestJson: string) => string>(() => 'started');
    installFullBridge({ downloadOfflinePackage: downloadSpy });
    window.localStorage.setItem('cms-access-token', 'tok-abc');
    window.localStorage.setItem('cms-refresh-token', 'tok-ref');
    render(<OfflineDownloadCta kind="package" subjectId="sub-1" examId="ex-1" title="اختبار القلب" testId="cta-package" />);
    fireEvent.click(screen.getByTestId('cta-package'));
    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(downloadSpy.mock.calls[0][0])).toEqual({
      subjectId: 'sub-1',
      examId: 'ex-1',
      accessToken: 'tok-abc',
      title: 'اختبار القلب',
    });
    expect(toastMessageMock).toHaveBeenCalledWith('بدأ تحميل حزمة الأسئلة… تابع التقدم من لوحة «وضع بدون إنترنت».');
  });

  it('package CTA: deny code surfaces the exact Arabic deny message as an error toast', () => {
    installFullBridge({ downloadOfflinePackage: () => 'denied_offline' });
    render(<OfflineDownloadCta kind="package" subjectId="sub-1" testId="cta-package" />);
    fireEvent.click(screen.getByTestId('cta-package'));
    expect(toastErrorMock).toHaveBeenCalledWith('لا يوجد اتصال بالإنترنت — تحميل الحزم يحتاج اتصالاً مرة واحدة.');
  });

  it('package CTA: ready code means the package was saved earlier', () => {
    installFullBridge({ downloadOfflinePackage: () => 'ready' });
    render(<OfflineDownloadCta kind="package" subjectId="sub-1" testId="cta-package" />);
    fireEvent.click(screen.getByTestId('cta-package'));
    expect(toastMessageMock).toHaveBeenCalledWith('الحزمة محفوظة مسبقاً.');
  });

  it('episode CTA: ensure request serialized, started + ready toasts', () => {
    const ensureSpy = vi.fn<(episodeJson: string) => string>(() => 'ready');
    installFullBridge({ ensureCourseEpisodeLocal: ensureSpy });
    render(
      <OfflineDownloadCta
        kind="episode"
        variant="icon"
        episodeId="ep-1"
        courseId="c-1"
        title="الحلقة الأولى"
        assetType="video"
        label="تحميل الحلقة دون اتصال"
        testId="cta-episode"
      />,
    );
    const button = screen.getByTestId('cta-episode');
    expect(button).toHaveAttribute('aria-label', 'تحميل الحلقة دون اتصال');
    fireEvent.click(button);
    expect(JSON.parse(ensureSpy.mock.calls[0][0])).toEqual({
      episodeId: 'ep-1',
      courseId: 'c-1',
      title: 'الحلقة الأولى',
      assetType: 'video',
    });
    expect(toastMessageMock).toHaveBeenCalledWith('الحلقة محفوظة مسبقاً.');
  });
});

// ---------------------------------------------------------------------
// 5) ExamPage integration — the exam-phase header CTA
// ---------------------------------------------------------------------
import ExamPage from '@/features/exams/pages/ExamPage';

function renderExamPage(): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/exams/ex1']}>
        <Routes>
          <Route path="/exams/:examId" element={<ExamPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ExamPage — «تحميل دون اتصال» CTA', () => {
  it('hides the CTA in a plain browser (queryByTestId null)', async () => {
    renderExamPage();
    // The exam phase mounts (question text renders) and the CTA stays absent.
    expect(await screen.findByText('ألم صدري ضاغط')).toBeInTheDocument();
    expect(screen.queryByTestId('exam-offline-download-cta')).not.toBeInTheDocument();
  });

  it('carries the CTA in the exam-phase header inside the shell and starts the package download', async () => {
    const downloadSpy = vi.fn<(requestJson: string) => string>(() => 'started');
    installFullBridge({ downloadOfflinePackage: downloadSpy });
    renderExamPage();
    expect(await screen.findByText('ألم صدري ضاغط')).toBeInTheDocument();
    const cta = screen.getByTestId('exam-offline-download-cta');
    expect(cta).toHaveTextContent('تحميل دون اتصال');
    fireEvent.click(cta);
    // The exam CTA passes examId only (the session DTO carries no subjectId).
    expect(JSON.parse(downloadSpy.mock.calls[0][0])).toEqual({ examId: 'ex1', title: 'اختبار القلب' });
    expect(toastMessageMock).toHaveBeenCalledWith('بدأ تحميل حزمة الأسئلة… تابع التقدم من لوحة «وضع بدون إنترنت».');
  });
});
