import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, Clock, CloudOff, Flag, Loader2, XCircle } from 'lucide-react';
import { QuestionRow, type QuestionRowData } from '@/components/QuestionRow';
// D-24 parity — the submit confirm rides the shared Radix CenteredDialog
// (focus-trapped + ESC), exactly like the online ExamPage.
import { CenteredDialog } from '@/components/ui/Overlays';
import {
  captureOfflineAnswer,
  getOfflineExamPayload,
  getOfflineExamSyncStatus,
  isOfflineExamBridgeActive,
  OFFLINE_EXAM_MAX_DURATION_SECONDS,
  OFFLINE_EXAM_SYNC_MESSAGES,
  submitOfflineExam,
  type OfflineExamPayload,
  type OfflineExamQuestionPayload,
} from '@/utils/native-offline-exam';
import { formatDate } from '@/utils';

/**
 * W3 (UX 2A) — the offline exam player page. It renders the SAME shared
 * [QuestionRow] the online ExamPage renders, inside a mirrored exam-phase
 * chrome, but its ONLY data source is the dedicated `window.CmsOfflineExam`
 * bridge of OfflineExamWebActivity (never the web session, never storage):
 *
 *  - 'loading'  → polls the bridge every 600ms (up to 20s) for the decrypted
 *                 payload; the native runner resolves openOnline/continueOffline.
 *  - 'denied'   → the honest Arabic message per deny code (denied_session /
 *                 denied_package / absent / default).
 *  - 'ready'    → the exam: pendingAnswers restore the selection map, selections
 *                 capture through the encrypted store (deny → revert + toast),
 *                 submit enqueues the package sync and polls its status.
 *  - 'browser'  → no bridge: this page works only inside the Android exam
 *                 webview after downloading a question package.
 *
 * Memory only: NOTHING is written to localStorage/sessionStorage — answers
 * live in the encrypted native store, restored via pendingAnswers.
 */

type Phase = 'loading' | 'timeout' | 'denied' | 'ready' | 'browser';
type SyncPhase = 'idle' | 'submitting' | 'done';

/** Bridge poll cadence + the honest 20s ceiling for the native payload resolution. */
const PAYLOAD_POLL_MS = 600;
const PAYLOAD_TIMEOUT_MS = 20_000;
/** Sync status poll cadence + ceiling (network syncs may be slow). */
const SYNC_POLL_MS = 700;
const SYNC_TIMEOUT_MS = 60_000;

const DENY_MESSAGES: Record<string, string> = {
  denied_session: 'الجلسة غير متاحة؛ لا يمكن فتح محتوى Offline محمي.',
  denied_package: 'تم رفض الحزمة أو انتهت نافذة الاستخدام المسموح بها.',
  absent: 'لا توجد حزمة محفوظة بهذا المعرف.',
};

const DEFAULT_DENY_MESSAGE = 'تعذر فتح الامتحان دون اتصال.';
const BROWSER_MESSAGE = 'هذه الصفحة تعمل داخل تطبيق أندرويد فقط بعد تحميل حزمة أسئلة.';
const CAPTURE_DENY_MESSAGE = 'تعذر حفظ الإجابة لأن الحزمة لم تعد صالحة.';
const SYNC_FALLBACK_MESSAGE = 'تعذّر تأكيد حالة المزامنة؛ بقيت الإجابات المحلية محفوظة.';
const SYNC_SUCCESS_CODES = new Set(['synced', 'no_pending_answers']);

export default function OfflineExamPage() {
  // The route param is display/context only — the bridge owns the package identity.
  const { packageId: routePackageId } = useParams<{ packageId: string }>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [denyCode, setDenyCode] = useState('');
  const [payload, setPayload] = useState<OfflineExamPayload | null>(null);
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  /** Per-question Date.now() accumulator — think-time since the last answer/reset. */
  const questionStartedAt = useRef<Record<string, number>>({});
  const syncTimer = useRef<number | null>(null);

  // ---- Phase machine: poll the bridge for the decrypted payload. ----
  useEffect(() => {
    if (phase !== 'loading') return;
    if (!isOfflineExamBridgeActive()) {
      setPhase('browser');
      return;
    }
    const startedAt = Date.now();
    let settled = false;
    const tick = () => {
      if (settled) return;
      const result = getOfflineExamPayload();
      if (result === null) {
        // Throwing bridge or malformed JSON — fail closed to the honest error.
        settled = true;
        setDenyCode('');
        setPhase('denied');
        return;
      }
      if (result.phase === 'loading') {
        if (Date.now() - startedAt > PAYLOAD_TIMEOUT_MS) {
          settled = true;
          setPhase('timeout');
        }
        return;
      }
      if (result.phase === 'denied') {
        settled = true;
        setDenyCode(result.code);
        setPhase('denied');
        return;
      }
      settled = true;
      const { payload: ready } = result;
      // Restore the encrypted store's pending answers into the selection map.
      setSelection(
        Object.fromEntries(ready.pendingAnswers.map((answer) => [answer.questionId, [answer.selectedOptionId]])),
      );
      const now = Date.now();
      questionStartedAt.current = Object.fromEntries(ready.questions.map((question) => [question.id, now]));
      setPayload(ready);
      setPhase('ready');
    };
    tick(); // first check without waiting a full interval
    const timer = window.setInterval(tick, PAYLOAD_POLL_MS);
    return () => {
      settled = true;
      window.clearInterval(timer);
    };
  }, [phase]);

  // Clear any live sync poll on unmount.
  useEffect(() => () => {
    if (syncTimer.current != null) window.clearInterval(syncTimer.current);
  }, []);

  const answeredCount = useMemo(
    () => Object.values(selection).filter((answer) => answer.length > 0).length,
    [selection],
  );
  const total = payload?.questions.length ?? 0;

  // ---- Selection: optimistic set + synchronous native capture (deny → revert). ----
  const handleSelect = useCallback((question: OfflineExamQuestionPayload, optionId: string) => {
    const previous = selection[question.id] ?? [];
    setSelection((prev) => ({ ...prev, [question.id]: [optionId] }));
    const startedAt = questionStartedAt.current[question.id] ?? Date.now();
    const durationSeconds = Math.min(
      OFFLINE_EXAM_MAX_DURATION_SECONDS,
      Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    );
    questionStartedAt.current[question.id] = Date.now();
    const code = captureOfflineAnswer(question.id, optionId, durationSeconds);
    if (code !== 'recorded') {
      toast.error(CAPTURE_DENY_MESSAGE);
      setSelection((prev) => ({ ...prev, [question.id]: previous }));
    }
  }, [selection]);

  // ---- Submit: confirm dialog → enqueue sync → poll the disposition. ----
  const submit = useCallback(() => {
    if (syncPhase === 'submitting') return;
    setShowSubmitConfirm(false);
    const code = submitOfflineExam();
    if (code !== 'submitting') {
      toast.error(SYNC_FALLBACK_MESSAGE);
      setResultMessage(SYNC_FALLBACK_MESSAGE);
      setSyncPhase('done');
      return;
    }
    setSyncPhase('submitting');
    setResultMessage(null);
    const startedAt = Date.now();
    const finish = (status: string) => {
      const message = OFFLINE_EXAM_SYNC_MESSAGES[status] ?? SYNC_FALLBACK_MESSAGE;
      if (SYNC_SUCCESS_CODES.has(status)) toast.success(message);
      else toast.error(message);
      setResultMessage(message);
      setSyncPhase('done');
    };
    const timer = window.setInterval(() => {
      const status = getOfflineExamSyncStatus();
      if (status == null || status === 'idle' || status === 'submitting') {
        if (Date.now() - startedAt > SYNC_TIMEOUT_MS) {
          window.clearInterval(timer);
          if (syncTimer.current === timer) syncTimer.current = null;
          finish('timeout');
        }
        return;
      }
      window.clearInterval(timer);
      if (syncTimer.current === timer) syncTimer.current = null;
      finish(status);
    }, SYNC_POLL_MS);
    syncTimer.current = timer;
  }, [syncPhase]);

  // ---- Screens ----
  if (phase === 'loading') {
    return (
      <main dir="rtl" data-testid="offline-exam-root" className="max-w-[880px] mx-auto px-4 py-6">
        <div data-testid="offline-exam-loading" className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)] mb-3" aria-hidden="true" />
          <p className="text-sm text-[var(--c-text-muted)]">جارٍ التحقق من الحزمة المحمية…</p>
          <span className="sr-only" lang="en">{routePackageId ?? ''}</span>
        </div>
      </main>
    );
  }

  if (phase === 'browser') {
    return (
      <main dir="rtl" data-testid="offline-exam-root" className="max-w-[880px] mx-auto px-4 py-6">
        <div data-testid="offline-exam-browser" className="max-w-lg mx-auto mt-12 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-7 text-center shadow-md">
          <CloudOff className="w-10 h-10 mx-auto mb-3 text-[var(--c-text-faint)]" aria-hidden="true" />
          <h2 className="font-bold text-lg mb-2 text-[var(--c-text)]">امتحان دون اتصال غير متاح</h2>
          <p className="text-sm leading-relaxed text-[var(--c-text-muted)]">{BROWSER_MESSAGE}</p>
        </div>
      </main>
    );
  }

  if (phase === 'denied' || phase === 'timeout') {
    const denyMessage = phase === 'timeout' ? DEFAULT_DENY_MESSAGE : DENY_MESSAGES[denyCode] ?? DEFAULT_DENY_MESSAGE;
    return (
      <main dir="rtl" data-testid="offline-exam-root" className="max-w-[880px] mx-auto px-4 py-6">
        <div data-testid="offline-exam-denied" className="max-w-lg mx-auto mt-12 rounded-2xl border border-[var(--c-danger-200)] bg-[var(--c-surface)] p-7 text-center shadow-md" role="alert">
          <XCircle className="w-9 h-9 mx-auto mb-3 text-[var(--c-danger-500)]" aria-hidden="true" />
          <h2 className="font-bold text-lg mb-2 text-[var(--c-text)]">تعذّر فتح الامتحان</h2>
          <p className="text-sm leading-relaxed text-[var(--c-text-muted)] mb-5">{denyMessage}</p>
        </div>
      </main>
    );
  }

  if (!payload || payload.questions.length === 0) return null;

  const rowData = (question: OfflineExamQuestionPayload, index: number): QuestionRowData => ({
    id: question.id,
    // «السؤال N من M» rides every row header (the shared row renders it), while
    // the page header carries the answered count + the package expiry window.
    number: index + 1,
    text: question.text,
    type: question.type,
    options: question.options.map((option) => ({ id: option.id, letter: option.letter, text: option.text })),
  });

  return (
    <main dir="rtl" data-testid="offline-exam-root" className="max-w-[880px] mx-auto px-4 py-6 space-y-4">
      {/* Exam-phase chrome (mirrors ExamPage's header bar + progress meter). */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border backdrop-blur-xl"
        style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)' }}
      >
        <div className="flex-1">
          <h2 className="text-sm font-bold text-[var(--c-text)]">امتحان دون اتصال</h2>
          <div className="text-xs text-[var(--c-text-muted)] mt-0.5">
            مجاب: <span className="font-bold text-[var(--c-primary-700)]" lang="en">{answeredCount}</span> من <span lang="en">{total}</span>
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--c-primary-50)] text-[var(--c-primary-700)] font-bold text-sm"
          aria-label="نافذة صلاحية الحزمة"
        >
          <Clock className="w-4 h-4" aria-hidden="true" />
          صالحة حتى: {formatDate(payload.expiresAt)}
        </div>
      </div>
      <div
        className="h-1.5 bg-[var(--c-neutral-200)] rounded-full overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answeredCount}
        aria-label="تقدم الاختبار"
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'var(--grad-primary)' }}
          animate={{ width: `${(answeredCount / Math.max(1, total)) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Sync result banner (inline, honest per disposition). */}
      {resultMessage && (
        <div
          role="status"
          data-testid="offline-exam-result"
          className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 text-center text-sm font-bold text-[var(--c-text)] shadow-sm"
        >
          {resultMessage}
        </div>
      )}
      {syncPhase === 'submitting' && (
        <div className="flex items-center justify-center gap-2 text-sm text-[var(--c-text-muted)]" role="status">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          جارٍ فحص حالة الإبطال ثم المزامنة…
        </div>
      )}

      {/* The question LIST — the exact shared QuestionRow the online exam renders. */}
      <div
        className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-1 shadow-md sm:px-6"
        data-testid="offline-exam-list"
      >
        {payload.questions.map((question, index) => (
          <QuestionRow
            key={question.id}
            testIdPrefix="offline-exam"
            question={rowData(question, index)}
            index={index}
            total={total}
            isAnswered={(selection[question.id] ?? []).length > 0}
            selected={selection[question.id] ?? []}
            onSelect={(optionId) => handleSelect(question, optionId)}
          />
        ))}
      </div>

      {/* Submit CTA — sticky under the list; the exam stays browsable after submit. */}
      <div className="sticky bottom-4 z-10 flex justify-center">
        <button
          type="button"
          onClick={() => setShowSubmitConfirm(true)}
          disabled={syncPhase === 'submitting'}
          data-testid="offline-exam-submit"
          className="press flex min-h-11 items-center gap-1.5 px-5 py-2.5 rounded-[10px] font-bold text-sm text-white transition-all disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-primary-700)]"
          style={{ background: 'var(--grad-success)', boxShadow: '0 4px 12px rgba(0,200,83,0.25)' }}
        >
          <Flag className="w-4 h-4" aria-hidden="true" />
          تسليم الاختبار
        </button>
      </div>

      <CenteredDialog
        open={showSubmitConfirm}
        onOpenChange={setShowSubmitConfirm}
        title="تأكيد التسليم"
        testId="offline-exam-submit-confirm"
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 mx-auto" style={{ background: 'rgba(255,179,0,0.10)' }}>
          <AlertTriangle className="w-6 h-6 text-[var(--c-warning-500)]" aria-hidden="true" />
        </div>
        <p className="text-sm text-[var(--c-text-muted)] text-center mb-1">
          أجبت على <strong className="text-[var(--c-text)]" lang="en">{answeredCount}</strong> من <strong className="text-[var(--c-text)]" lang="en">{total}</strong> سؤال.
        </p>
        {answeredCount < total && (
          <p className="text-xs text-[var(--c-danger-500)] text-center mb-4">
            هناك <span lang="en">{total - answeredCount}</span> سؤال غير مجاب.
          </p>
        )}
        <p className="text-xs text-[var(--c-text-muted)] text-center mb-2">
          تُزامَن الإجابات المشفّرة مع الخادم عند الاتصال — تبقى محفوظة محلياً إن تعذّر ذلك.
        </p>
        <div className="flex gap-2 justify-center mt-4">
          <button
            type="button"
            onClick={() => setShowSubmitConfirm(false)}
            className="press min-h-11 px-5 rounded-[10px] text-sm font-semibold text-[var(--c-text-muted)] hover:bg-[var(--c-neutral-100)] transition-colors"
          >
            متابعة الحل
          </button>
          <button
            type="button"
            onClick={() => submit()}
            data-testid="offline-exam-submit-final"
            className="press min-h-11 px-5 rounded-[10px] text-sm font-bold text-white bg-[var(--c-success-500)] hover:bg-[var(--c-success-600)] transition-colors"
          >
            تسليم نهائي
          </button>
        </div>
      </CenteredDialog>
    </main>
  );
}
