/**
 * Wave 3 (UX 2A) — feature-detected access to the DEDICATED offline-exam bridge
 * `window.CmsOfflineExam`. Unlike `window.CmsNative` (the shell WebView), this
 * interface is injected ONLY into the offline exam player WebView
 * (OfflineExamWebActivity) — a different WebView whose only interface it is.
 * The method names and payload fields are the cross-platform CONTRACT and must
 * stay exact:
 *
 *   getOfflineExamPayload(): string
 *     -> {"phase":"loading"} | {"phase":"denied","code":…}
 *     -> {"phase":"ready","payload":{ packageId, subjectIds, expiresAt,
 *          questions:[{ id, text, type, difficulty, tags, options:[{ id, letter, text }] }],
 *          pendingAnswers:[{ questionId, selectedOptionId }] }}
 *   captureOfflineAnswer(questionId, optionId, durationSeconds): string -> recorded|denied|invalid_args
 *   submitOfflineExam(): string                -> submitting
 *   getOfflineExamSyncStatus(): string         -> idle|submitting|<sync disposition lowercase>
 *
 * Everything is feature-detected exactly like native-packages.ts: in a plain
 * browser (or a player WebView whose bridge lacks a method) every helper
 * returns null and the page keeps its honest fail-closed states — nothing fakes
 * an exam. The native side re-checks the HTTPS origin allowlist per call.
 */

/** Typed shape of the exam bridge — mirrors the Kotlin @JavascriptInterface surface. */
interface CmsOfflineExamBridge {
  getOfflineExamPayload(): string;
  captureOfflineAnswer(questionId: string, optionId: string, durationSeconds: number): string;
  submitOfflineExam(): string;
  getOfflineExamSyncStatus(): string;
}

const OFFLINE_EXAM_BRIDGE_NAME = 'CmsOfflineExam';
const OFFLINE_EXAM_METHODS: Array<keyof CmsOfflineExamBridge> = [
  'getOfflineExamPayload',
  'captureOfflineAnswer',
  'submitOfflineExam',
  'getOfflineExamSyncStatus',
];

// ---- defensive bounds (display-only data; hostile payloads stop here) ----
/** Opaque id bound — UUID-shaped ids are NOT required, just non-blank and capped. */
const MAX_ID_LENGTH = 256;
const MAX_CODE_LENGTH = 256;
const MAX_TEXT_LENGTH = 8_192;
const MAX_TYPE_LENGTH = 64;
const MAX_LETTER_LENGTH = 8;
const MAX_TAG_LENGTH = 128;
/** Hard ceilings on the lists the page renders/polls (defensive, display only). */
const MAX_QUESTIONS = 500;
const MAX_OPTIONS_PER_QUESTION = 64;
const MAX_SUBJECTS = 64;
const MAX_PENDING_ANSWERS = 5_000;
/** Answer-duration bound — mirrors the native bridge validation (seconds). */
export const OFFLINE_EXAM_MAX_DURATION_SECONDS = 86_400;

/** One decrypted question exactly as the native side reports it (display fields only). */
export interface OfflineExamQuestionPayload {
  id: string;
  text: string;
  type: string;
  difficulty?: string;
  tags?: string[];
  options: Array<{ id: string; letter: string; text: string }>;
}

/** Restoration map for answers captured in a previous visit (encrypted store). */
export interface OfflineExamPendingAnswer {
  questionId: string;
  selectedOptionId: string;
}

/** The full exam payload — the `payload` object of the ready phase. */
export interface OfflineExamPayload {
  packageId: string;
  subjectIds: string[];
  expiresAt: string;
  questions: OfflineExamQuestionPayload[];
  pendingAnswers: OfflineExamPendingAnswer[];
}

/** Phase union returned by [getOfflineExamPayload] — null means fail closed. */
export type OfflineExamPayloadResult =
  | { phase: 'loading' }
  | { phase: 'denied'; code: string }
  | { phase: 'ready'; payload: OfflineExamPayload };

function readOfflineExamBridge(): CmsOfflineExamBridge | null {
  const candidate = (globalThis as unknown as Record<string, unknown>)[OFFLINE_EXAM_BRIDGE_NAME];
  if (!candidate || typeof candidate !== 'object') return null;
  const bridge = candidate as unknown as Record<string, unknown>;
  if (OFFLINE_EXAM_METHODS.some((method) => typeof bridge[method] !== 'function')) return null;
  return candidate as unknown as CmsOfflineExamBridge;
}

/**
 * True only inside the exam player WebView AND when the bridge carries the full
 * four-method surface. A plain browser (or an older player) degrades to the
 * honest "Android app only" state via this check.
 */
export function isOfflineExamBridgeActive(): boolean {
  return readOfflineExamBridge() !== null;
}

/** Validates one opaque id: non-blank, trimmed, length-capped. */
function validId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.length > MAX_ID_LENGTH) return null;
  return id;
}

/** Validates a required bounded text field (trimmed, non-empty, capped). */
function requiredText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

/** Validates an optional bounded text field: undefined when absent or junk. */
function optionalText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > max) return undefined;
  return text;
}

function parseQuestion(raw: unknown): OfflineExamQuestionPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const id = validId(source.id);
  const text = requiredText(source.text, MAX_TEXT_LENGTH);
  const type = requiredText(source.type, MAX_TYPE_LENGTH);
  if (!id || !text || !type) return null;
  if (!Array.isArray(source.options) || source.options.length === 0 || source.options.length > MAX_OPTIONS_PER_QUESTION) return null;
  const options: Array<{ id: string; letter: string; text: string }> = [];
  for (const optionRaw of source.options) {
    if (!optionRaw || typeof optionRaw !== 'object') return null;
    const option = optionRaw as Record<string, unknown>;
    const optionId = validId(option.id);
    const letter = requiredText(option.letter, MAX_LETTER_LENGTH);
    const optionText = requiredText(option.text, MAX_TEXT_LENGTH);
    if (!optionId || !letter || !optionText) return null; // malformed option fails the payload
    options.push({ id: optionId, letter, text: optionText });
  }
  let tags: string[] | undefined;
  if (Array.isArray(source.tags)) {
    const parsed = source.tags.map((tag) => optionalText(tag, MAX_TAG_LENGTH)).filter((tag): tag is string => tag != null);
    tags = parsed.length > 0 ? parsed : undefined;
  }
  return { id, text, type, difficulty: optionalText(source.difficulty, MAX_TYPE_LENGTH), tags, options };
}

/**
 * Reads the phase JSON. Returns null outside the player WebView, on a throwing
 * bridge, or on a malformed payload — callers keep their honest fail-closed
 * error screen, never a half-rendered exam.
 */
export function getOfflineExamPayload(): OfflineExamPayloadResult | null {
  const bridge = readOfflineExamBridge();
  if (!bridge) return null;
  try {
    const raw = bridge.getOfflineExamPayload();
    if (typeof raw !== 'string' || raw.length === 0) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const root = parsed as Record<string, unknown>;
    if (root.phase === 'loading') return { phase: 'loading' };
    if (root.phase === 'denied') {
      const code = requiredText(root.code, MAX_CODE_LENGTH);
      return code ? { phase: 'denied', code } : null;
    }
    if (root.phase === 'ready') {
      const payload = parsePayload(root.payload);
      return payload ? { phase: 'ready', payload } : null;
    }
    return null;
  } catch {
    return null;
  }
}

function parsePayload(raw: unknown): OfflineExamPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const packageId = validId(source.packageId);
  if (!packageId) return null;
  if (typeof source.expiresAt !== 'string' || Number.isNaN(new Date(source.expiresAt).getTime())) return null;
  if (!Array.isArray(source.questions) || source.questions.length === 0 || source.questions.length > MAX_QUESTIONS) return null;
  const questions: OfflineExamQuestionPayload[] = [];
  for (const questionRaw of source.questions) {
    const question = parseQuestion(questionRaw);
    if (!question) return null; // malformed question fails the WHOLE payload
    questions.push(question);
  }
  const subjectIds = Array.isArray(source.subjectIds)
    ? source.subjectIds.map(validId).filter((id): id is string => id !== null).slice(0, MAX_SUBJECTS)
    : [];
  const pendingAnswers: OfflineExamPendingAnswer[] = [];
  if (Array.isArray(source.pendingAnswers)) {
    for (const answerRaw of source.pendingAnswers.slice(0, MAX_PENDING_ANSWERS)) {
      if (!answerRaw || typeof answerRaw !== 'object') continue; // restoration data — a junk entry is dropped
      const answer = answerRaw as Record<string, unknown>;
      const questionId = validId(answer.questionId);
      const selectedOptionId = validId(answer.selectedOptionId);
      if (questionId && selectedOptionId) pendingAnswers.push({ questionId, selectedOptionId });
    }
  }
  return { packageId, subjectIds, expiresAt: source.expiresAt, questions, pendingAnswers };
}

/**
 * Records one option selection. Trims the ids, validates the duration bound
 * (our own bug fails closed), and returns the native code — or null outside the
 * player WebView / on a call failure / for an unexpected code.
 */
export function captureOfflineAnswer(
  questionId: string,
  optionId: string,
  durationSeconds: number,
): 'recorded' | 'denied' | 'invalid_args' | null {
  const bridge = readOfflineExamBridge();
  if (!bridge) return null;
  const question = questionId.trim();
  const option = optionId.trim();
  if (!question || question.length > MAX_ID_LENGTH || !option || option.length > MAX_ID_LENGTH) return null;
  if (
    typeof durationSeconds !== 'number' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0 ||
    durationSeconds > OFFLINE_EXAM_MAX_DURATION_SECONDS
  ) {
    return null;
  }
  try {
    const code = bridge.captureOfflineAnswer(question, option, Math.floor(durationSeconds));
    if (code === 'recorded' || code === 'denied' || code === 'invalid_args') return code;
    return null;
  } catch {
    return null;
  }
}

/** Enqueues the package sync; 'submitting' or null outside the player / on failure. */
export function submitOfflineExam(): 'submitting' | null {
  const bridge = readOfflineExamBridge();
  if (!bridge) return null;
  try {
    const code = bridge.submitOfflineExam();
    return code === 'submitting' ? 'submitting' : null;
  } catch {
    return null;
  }
}

/** Reads the sync status code ("idle" | "submitting" | dispositions); null outside the player. */
export function getOfflineExamSyncStatus(): string | null {
  const bridge = readOfflineExamBridge();
  if (!bridge) return null;
  try {
    const code = bridge.getOfflineExamSyncStatus();
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/**
 * Arabic-first sync result messages — mirrors the native OfflineExamActivity
 * strings one-to-one (keyed by the lowercase disposition names).
 */
export const OFFLINE_EXAM_SYNC_MESSAGES: Record<string, string> = {
  synced: 'تمت مزامنة الإجابات بنجاح.',
  no_pending_answers: 'لا توجد إجابات بانتظار المزامنة.',
  auth_rejected: 'انتهت الجلسة؛ سجّل الدخول مجدداً.',
  forbidden: 'تم رفض الحزمة أو تم إبطالها.',
  conflict: 'تعارض في المزامنة؛ لم تُفقد الإجابات المحلية.',
  rate_limited: 'تم تقييد المزامنة مؤقتاً؛ أعد المحاولة لاحقاً.',
  network_failure: 'لا توجد شبكة؛ بقيت الإجابات مشفرة محلياً للمحاولة اللاحقة.',
  retryable_failure: 'تعذر إكمال المزامنة؛ بقيت الإجابات المحلية محفوظة.',
};
