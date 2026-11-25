import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * Wave 3 (UX 2A) — offline exam player regression suite.
 *
 * Locks:
 *  1. Wrapper (native-offline-exam.ts): feature-detect in a plain browser,
 *     ready/loading/denied phase parsing, malformed payloads and throwing
 *     bridges → null (fail closed), arg validation on capture/submit, the
 *     exact Arabic sync-message map.
 *  2. OfflineExamPage: honest browser state without the bridge; a ready
 *     payload renders the shared QuestionRow rows; selection captures through
 *     the bridge with the right ids + a non-negative duration; a deny reverts
 *     the selection; the submit flow polls the sync status and surfaces the
 *     Arabic success message; denied/malformed payloads fail closed.
 */

type MutableGlobal = Record<string, unknown>;

function installExamBridge(overrides: Record<string, unknown> = {}): void {
  (globalThis as unknown as MutableGlobal).CmsOfflineExam = {
    getOfflineExamPayload: () => '{"phase":"loading"}',
    captureOfflineAnswer: () => 'recorded',
    submitOfflineExam: () => 'submitting',
    getOfflineExamSyncStatus: () => 'idle',
    ...overrides,
  };
}

function removeExamBridge(): void {
  delete (globalThis as unknown as MutableGlobal).CmsOfflineExam;
}

const PACKAGE_ID = '55555555-5555-5555-5555-555555555555';
const QUESTION_ID = '11111111-2222-4333-8444-555555555555';
const OPTION_A = 'aaaaaaaa-1111-4222-8333-444444444444';
const OPTION_B = 'bbbbbbbb-1111-4222-8333-444444444444';

function readyPayloadJson(payloadOverrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    phase: 'ready',
    payload: {
      packageId: PACKAGE_ID,
      subjectIds: ['sub-1'],
      expiresAt: '2027-01-01T00:00:00Z',
      questions: [
        {
          id: QUESTION_ID,
          text: 'ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟',
          type: 'Mcq',
          difficulty: 'medium',
          tags: ['cardiology'],
          options: [
            { id: OPTION_A, letter: 'A', text: 'ألم صدري ضاغط' },
            { id: OPTION_B, letter: 'B', text: 'طنين في الأذن' },
          ],
        },
      ],
      pendingAnswers: [],
      ...payloadOverrides,
    },
  });
}

// ---- sonner toast spy (hoisted so the page sees the mock) ----
const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { message: vi.fn(), error: toastErrorMock, success: toastSuccessMock, info: vi.fn(), warning: vi.fn() },
}));

import OfflineExamPage from '@/features/offline/OfflineExamPage';

function renderPage(packageId: string = PACKAGE_ID): void {
  render(
    <MemoryRouter initialEntries={[`/offline-exam/${packageId}`]}>
      <Routes>
        <Route path="/offline-exam/:packageId" element={<OfflineExamPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  removeExamBridge();
  vi.clearAllMocks();
});

afterEach(() => {
  removeExamBridge();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------
// 1) wrapper — feature-detect + phase parsing + fail-closed validation
// ---------------------------------------------------------------------
describe('offline exam wrapper (native-offline-exam.ts)', () => {
  it('stays inactive in a plain browser — every helper answers null', async () => {
    const {
      isOfflineExamBridgeActive,
      getOfflineExamPayload,
      captureOfflineAnswer,
      submitOfflineExam,
      getOfflineExamSyncStatus,
    } = await import('@/utils/native-offline-exam');
    expect(isOfflineExamBridgeActive()).toBe(false);
    expect(getOfflineExamPayload()).toBeNull();
    expect(captureOfflineAnswer(QUESTION_ID, OPTION_A, 0)).toBeNull();
    expect(submitOfflineExam()).toBeNull();
    expect(getOfflineExamSyncStatus()).toBeNull();
  });

  it('parses the loading and denied phases verbatim', async () => {
    installExamBridge({ getOfflineExamPayload: () => '{"phase":"loading"}' });
    const { getOfflineExamPayload } = await import('@/utils/native-offline-exam');
    expect(getOfflineExamPayload()).toEqual({ phase: 'loading' });

    installExamBridge({ getOfflineExamPayload: () => '{"phase":"denied","code":"denied_session"}' });
    expect(getOfflineExamPayload()).toEqual({ phase: 'denied', code: 'denied_session' });
  });

  it('parses a ready payload with every validated field', async () => {
    installExamBridge({
      getOfflineExamPayload: () =>
        readyPayloadJson({ subjectIds: ['  sub-1  ', 'sub-2'], pendingAnswers: [{ questionId: QUESTION_ID, selectedOptionId: OPTION_B }] }),
    });
    const { getOfflineExamPayload } = await import('@/utils/native-offline-exam');
    const result = getOfflineExamPayload();
    expect(result).not.toBeNull();
    expect(result!.phase).toBe('ready');
    if (result!.phase !== 'ready') return;
    // subjectIds are trimmed; every required field survives validation.
    expect(result!.payload).toMatchObject({
      packageId: PACKAGE_ID,
      subjectIds: ['sub-1', 'sub-2'],
      expiresAt: '2027-01-01T00:00:00Z',
      pendingAnswers: [{ questionId: QUESTION_ID, selectedOptionId: OPTION_B }],
    });
    expect(result!.payload.questions).toHaveLength(1);
    expect(result!.payload.questions[0]).toMatchObject({
      id: QUESTION_ID,
      text: 'ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟',
      type: 'Mcq',
      difficulty: 'medium',
      tags: ['cardiology'],
    });
    expect(result!.payload.questions[0].options).toEqual([
      { id: OPTION_A, letter: 'A', text: 'ألم صدري ضاغط' },
      { id: OPTION_B, letter: 'B', text: 'طنين في الأذن' },
    ]);
  });

  it('fails closed on malformed payloads (broken JSON, bad fields, junk phases)', async () => {
    const { getOfflineExamPayload } = await import('@/utils/native-offline-exam');
    const malformed = [
      '{not-json',                                        // broken JSON
      '""',                                               // not an object
      '{"phase":"weird"}',                                // unknown phase
      '{"phase":"ready"}',                                // missing payload
      '{"phase":"ready","payload":{}}',                   // missing packageId/questions
      '{"phase":"ready","payload":{"packageId":"p","expiresAt":"not-a-date","questions":[]}}', // junk expiry + no questions
      readyPayloadJson({ packageId: '   ' }),             // blank id
      readyPayloadJson({ questions: [] }),                // empty question list
      readyPayloadJson({                                  // blank question text
        questions: [{ id: QUESTION_ID, text: '   ', type: 'Mcq', options: [{ id: OPTION_A, letter: 'A', text: 'x' }] }],
      }),
      readyPayloadJson({                                  // empty options
        questions: [{ id: QUESTION_ID, text: 'سؤال', type: 'Mcq', options: [] }],
      }),
      readyPayloadJson({                                  // malformed option (no text)
        questions: [{ id: QUESTION_ID, text: 'سؤال', type: 'Mcq', options: [{ id: OPTION_A, letter: 'A' }] }],
      }),
    ];
    for (const raw of malformed) {
      installExamBridge({ getOfflineExamPayload: () => raw });
      expect(getOfflineExamPayload(), `payload must fail closed: ${raw.slice(0, 60)}`).toBeNull();
    }
  });

  it('treats a throwing bridge as absent (never propagates)', async () => {
    installExamBridge({
      getOfflineExamPayload: () => { throw new Error('boom'); },
      captureOfflineAnswer: () => { throw new Error('boom'); },
      submitOfflineExam: () => { throw new Error('boom'); },
      getOfflineExamSyncStatus: () => { throw new Error('boom'); },
    });
    const {
      isOfflineExamBridgeActive,
      getOfflineExamPayload,
      captureOfflineAnswer,
      submitOfflineExam,
      getOfflineExamSyncStatus,
    } = await import('@/utils/native-offline-exam');
    expect(isOfflineExamBridgeActive()).toBe(true); // feature-detected present…
    expect(getOfflineExamPayload()).toBeNull();     // …but every call fails closed
    expect(captureOfflineAnswer(QUESTION_ID, OPTION_A, 0)).toBeNull();
    expect(submitOfflineExam()).toBeNull();
    expect(getOfflineExamSyncStatus()).toBeNull();
  });

  it('capture passes trimmed ids and floors the duration; bad args never reach the bridge', async () => {
    const captureSpy = vi.fn(() => 'recorded');
    installExamBridge({ captureOfflineAnswer: captureSpy });
    const { captureOfflineAnswer } = await import('@/utils/native-offline-exam');
    expect(captureOfflineAnswer(`  ${QUESTION_ID} `, `\t${OPTION_A}`, 2.9)).toBe('recorded');
    expect(captureSpy).toHaveBeenCalledWith(QUESTION_ID, OPTION_A, 2);
    // Our own arg bugs fail closed without a native call.
    expect(captureOfflineAnswer('x'.repeat(300), OPTION_A, 0)).toBeNull();
    expect(captureOfflineAnswer(QUESTION_ID, '', 0)).toBeNull();
    expect(captureOfflineAnswer(QUESTION_ID, OPTION_A, -1)).toBeNull();
    expect(captureOfflineAnswer(QUESTION_ID, OPTION_A, 86_401)).toBeNull();
    expect(captureSpy).toHaveBeenCalledTimes(1);
    // Unknown native codes degrade to null (the page treats non-recorded as deny).
    installExamBridge({ captureOfflineAnswer: () => 'unexpected' });
    expect((await import('@/utils/native-offline-exam')).captureOfflineAnswer(QUESTION_ID, OPTION_A, 0)).toBeNull();
  });

  it('submit and sync status pass through their contract codes', async () => {
    const { submitOfflineExam, getOfflineExamSyncStatus } = await import('@/utils/native-offline-exam');
    installExamBridge({ submitOfflineExam: () => 'submitting', getOfflineExamSyncStatus: () => 'auth_rejected' });
    expect(submitOfflineExam()).toBe('submitting');
    expect(getOfflineExamSyncStatus()).toBe('auth_rejected');
    installExamBridge({ submitOfflineExam: () => 'denied' });
    expect(submitOfflineExam()).toBeNull();
  });

  it('carries the exact Arabic sync message map (spot-check)', async () => {
    const { OFFLINE_EXAM_SYNC_MESSAGES } = await import('@/utils/native-offline-exam');
    expect(OFFLINE_EXAM_SYNC_MESSAGES.synced).toBe('تمت مزامنة الإجابات بنجاح.');
    expect(OFFLINE_EXAM_SYNC_MESSAGES.no_pending_answers).toBe('لا توجد إجابات بانتظار المزامنة.');
    expect(OFFLINE_EXAM_SYNC_MESSAGES.auth_rejected).toBe('انتهت الجلسة؛ سجّل الدخول مجدداً.');
    expect(OFFLINE_EXAM_SYNC_MESSAGES.forbidden).toBe('تم رفض الحزمة أو تم إبطالها.');
    expect(OFFLINE_EXAM_SYNC_MESSAGES.conflict).toBe('تعارض في المزامنة؛ لم تُفقد الإجابات المحلية.');
    expect(OFFLINE_EXAM_SYNC_MESSAGES.rate_limited).toBe('تم تقييد المزامنة مؤقتاً؛ أعد المحاولة لاحقاً.');
    expect(OFFLINE_EXAM_SYNC_MESSAGES.network_failure).toBe('لا توجد شبكة؛ بقيت الإجابات مشفرة محلياً للمحاولة اللاحقة.');
    expect(OFFLINE_EXAM_SYNC_MESSAGES.retryable_failure).toBe('تعذر إكمال المزامنة؛ بقيت الإجابات المحلية محفوظة.');
  });
});

// ---------------------------------------------------------------------
// 2) OfflineExamPage — the 2A player
// ---------------------------------------------------------------------
describe('OfflineExamPage', () => {
  it('shows the honest browser state without the bridge (no faked exam)', async () => {
    renderPage();
    expect(await screen.findByTestId('offline-exam-browser')).toBeInTheDocument();
    expect(screen.getByText('هذه الصفحة تعمل داخل تطبيق أندرويد فقط بعد تحميل حزمة أسئلة.')).toBeInTheDocument();
    expect(screen.getByTestId('offline-exam-root')).toBeInTheDocument();
    expect(screen.queryByTestId('offline-exam-list')).not.toBeInTheDocument();
  });

  it('renders a ready payload as shared QuestionRow rows with options', async () => {
    installExamBridge({ getOfflineExamPayload: () => readyPayloadJson() });
    renderPage();
    expect(await screen.findByTestId('offline-exam-list')).toBeInTheDocument();
    expect(screen.getByText('ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟')).toBeInTheDocument();
    expect(screen.getByTestId(`offline-exam-row-${QUESTION_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId(`offline-exam-option-${OPTION_A}`)).toHaveTextContent('ألم صدري ضاغط');
    expect(screen.getByTestId(`offline-exam-option-${OPTION_B}`)).toHaveTextContent('طنين في الأذن');
    // Header chrome: answered count + the Arabic expiry window.
    expect(screen.getByText(/مجاب:/)).toBeInTheDocument();
    expect(screen.getByText(/صالحة حتى:/)).toBeInTheDocument();
  });

  it('restores pendingAnswers into the selection map on ready', async () => {
    installExamBridge({
      getOfflineExamPayload: () => readyPayloadJson({ pendingAnswers: [{ questionId: QUESTION_ID, selectedOptionId: OPTION_B }] }),
    });
    renderPage();
    await screen.findByTestId('offline-exam-list');
    expect(screen.getByTestId(`offline-exam-option-${OPTION_B}`)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId(`offline-exam-option-${OPTION_A}`)).toHaveAttribute('aria-checked', 'false');
  });

  it('selection captures through the bridge with the right ids and a non-negative duration', async () => {
    const captureSpy = vi.fn<(questionId: string, optionId: string, durationSeconds: number) => string>(() => 'recorded');
    installExamBridge({ getOfflineExamPayload: () => readyPayloadJson(), captureOfflineAnswer: captureSpy });
    renderPage();
    await screen.findByTestId('offline-exam-list');
    fireEvent.click(screen.getByTestId(`offline-exam-option-${OPTION_A}`));
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const [questionId, optionId, durationSeconds] = captureSpy.mock.calls[0];
    expect(questionId).toBe(QUESTION_ID);
    expect(optionId).toBe(OPTION_A);
    expect(durationSeconds).toBeGreaterThanOrEqual(0);
    expect(screen.getByTestId(`offline-exam-option-${OPTION_A}`)).toHaveAttribute('aria-checked', 'true');
  });

  it('a deny reverts the optimistic selection and toasts the Arabic message', async () => {
    installExamBridge({
      getOfflineExamPayload: () => readyPayloadJson(),
      captureOfflineAnswer: () => 'denied',
    });
    renderPage();
    await screen.findByTestId('offline-exam-list');
    fireEvent.click(screen.getByTestId(`offline-exam-option-${OPTION_A}`));
    expect(screen.getByTestId(`offline-exam-option-${OPTION_A}`)).toHaveAttribute('aria-checked', 'false');
    expect(toastErrorMock).toHaveBeenCalledWith('تعذر حفظ الإجابة لأن الحزمة لم تعد صالحة.');
  });

  it('submit flow polls the sync status and surfaces the Arabic success message', async () => {
    let syncStatus = 'submitting';
    installExamBridge({
      getOfflineExamPayload: () => readyPayloadJson(),
      submitOfflineExam: () => {
        syncStatus = 'synced';
        return 'submitting';
      },
      getOfflineExamSyncStatus: () => syncStatus,
    });
    renderPage();
    await screen.findByTestId('offline-exam-list');

    // Confirm dialog → final submit.
    fireEvent.click(screen.getByTestId('offline-exam-submit'));
    expect(screen.getByTestId('offline-exam-submit-confirm')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('offline-exam-submit-final'));

    // The 700ms poll lands on the terminal 'synced' disposition.
    const banner = await screen.findByTestId('offline-exam-result', {}, { timeout: 4000 });
    expect(banner).toHaveTextContent('تمت مزامنة الإجابات بنجاح.');
    expect(toastSuccessMock).toHaveBeenCalledWith('تمت مزامنة الإجابات بنجاح.');
    // The exam stays browsable after submit.
    expect(screen.getByTestId('offline-exam-list')).toBeInTheDocument();
    expect(screen.getByText('ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟')).toBeInTheDocument();
  });

  it('a denied payload renders its dedicated Arabic message', async () => {
    installExamBridge({ getOfflineExamPayload: () => '{"phase":"denied","code":"denied_session"}' });
    renderPage();
    const denied = await screen.findByTestId('offline-exam-denied');
    expect(denied).toHaveTextContent('الجلسة غير متاحة؛ لا يمكن فتح محتوى Offline محمي.');
    expect(screen.queryByTestId('offline-exam-list')).not.toBeInTheDocument();
  });

  it('a malformed payload fails closed to the honest error screen', async () => {
    installExamBridge({ getOfflineExamPayload: () => '{not-json' });
    renderPage();
    const denied = await screen.findByTestId('offline-exam-denied');
    expect(denied).toHaveTextContent('تعذر فتح الامتحان دون اتصال.');
    expect(screen.queryByTestId('offline-exam-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('offline-exam-loading')).not.toBeInTheDocument();
  });
});
