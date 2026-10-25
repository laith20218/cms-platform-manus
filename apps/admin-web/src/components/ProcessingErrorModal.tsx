import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, LoaderCircle, RotateCcw } from 'lucide-react';
import { AccessibleModal } from './AccessibleModal';

/**
 * Push 10.4 (1.C) — the dual-language processing failure modal.
 *
 * Opens when:
 *  - an episode's ProcessingStatus resolves to `Failed` (the 10.3 pipeline
 *    could not transcode it), or
 *  - an API call in the upload/edit flow fails (ApiError carrying the
 *    ProblemDetails extensions `humanMessage` + `technicalDetails`).
 *
 * Two reading levels, one dialog:
 *  - HUMAN (Arabic, always visible): «عذراً، تعذر معالجة الفيديو.» + the
 *    API's simplified humanMessage (or a curated fallback).
 *  - TECHNICAL (English, collapsible): the raw `technicalDetails` payload —
 *    FFmpeg stderr, error codes — in an LTR monospace block with a Copy
 *    Error button (clipboard API with execCommand fallback for locked-down
 *    browsers).
 *
 * Retry is caller-defined: the upload panel resumes its multipart session,
 * the processing watcher re-polls. When no retry makes sense the button is
 * simply not rendered.
 */

export interface ProcessingErrorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isArabic: boolean;
  /** The API's Arabic humanMessage — falls back to a curated sentence. */
  humanMessage?: string | null;
  /** English technical payload (FFmpeg logs / ProblemDetails technicalDetails). */
  technicalDetails?: string | null;
  /** Retry action — omitted → no retry button. */
  onRetry?: () => void;
  /** While the retry is running (spinner + dismiss guard). */
  retrying?: boolean;
  testId?: string;
}

export function ProcessingErrorModal({
  open,
  onOpenChange,
  isArabic,
  humanMessage,
  technicalDetails,
  onRetry,
  retrying = false,
  testId = 'processing-error-modal',
}: ProcessingErrorModalProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyError = async () => {
    const blob = [
      `CMS media processing failure`,
      humanMessage ? `humanMessage: ${humanMessage}` : null,
      technicalDetails ? `technicalDetails:\n${technicalDetails}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(blob);
      setCopied(true);
    } catch {
      // Clipboard API denied (permissions policy / non-secure context) —
      // execCommand still works in Chromium-derived browsers.
      try {
        const textarea = document.createElement('textarea');
        textarea.value = blob;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
    window.setTimeout(() => setCopied(false), 2200);
  };

  const hasTechnical = Boolean(technicalDetails && technicalDetails.trim().length > 0);

  return (
    <AccessibleModal
      open={open}
      onOpenChange={onOpenChange}
      isArabic={isArabic}
      dismissGuard={retrying}
      testId={testId}
      title={isArabic ? 'تعذّرت معالجة الفيديو' : 'Video processing failed'}
      description={isArabic ? 'الرسائل المبسّطة أولاً، والتفاصيل التقنية عند الحاجة' : 'Human message first, technical details on demand'}
    >
      <div className="space-y-4 px-5 py-5">
        {/* Human level — Arabic, always visible. */}
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
            style={{ background: 'rgba(239, 68, 68, 0.08)', borderColor: 'var(--cms-red-200)', color: 'var(--cms-red-600)' }}
          >
            <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }} data-testid="processing-error-headline">
              {isArabic ? 'عذراً، تعذر معالجة الفيديو.' : 'Sorry — the video could not be processed.'}
            </p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--cms-text-soft)' }} data-testid="processing-error-human">
              {humanMessage?.trim() || (isArabic
                ? 'تعذّر تحويل الفيديو إلى صيغ المشاهدة. حاول إعادة المحاولة، وإن استمرت المشكلة فتواصل مع الدعم الفني مع رقم الحلقة.'
                : 'The video could not be converted into watchable formats. Try again; if it keeps failing, contact support with the episode id.')}
            </p>
          </div>
        </div>

        {/* Technical level — English, collapsible, LTR monospace. */}
        {hasTechnical && (
          <div className="rounded-xl border" style={{ borderColor: 'var(--cms-line)' }}>
            <button
              type="button"
              onClick={() => setDetailsOpen((value) => !value)}
              aria-expanded={detailsOpen}
              aria-controls="processing-error-technical"
              data-testid="processing-error-details-toggle"
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start text-sm font-medium transition-colors hover:bg-slate-50"
              style={{ color: 'var(--cms-text-soft)' }}
            >
              <span dir="ltr" className="font-mono text-xs">{isArabic ? 'Technical details' : 'Technical details'}</span>
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
                style={{ color: 'var(--cms-text-muted)' }}
              />
            </button>
            {detailsOpen && (
              <div id="processing-error-technical" className="border-t px-4 py-3" style={{ borderColor: 'var(--cms-line)' }}>
                <pre
                  dir="ltr"
                  data-testid="processing-error-technical-body"
                  className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950/95 p-3 text-left font-mono text-[11px] leading-relaxed text-slate-200"
                >
                  {technicalDetails}
                </pre>
                <button
                  type="button"
                  onClick={() => void copyError()}
                  data-testid="processing-error-copy"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50"
                  style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                >
                  {copied
                    ? <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2} />
                    : <Copy className="w-3.5 h-3.5" strokeWidth={2} />}
                  {copied
                    ? (isArabic ? 'تم النسخ ✓' : 'Copied ✓')
                    : (isArabic ? 'نسخ الخطأ' : 'Copy error')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--cms-line)' }}>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              data-testid="processing-error-retry"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--cms-teal-700)' }}
            >
              {retrying
                ? <LoaderCircle className="w-4 h-4 animate-spin" strokeWidth={2} />
                : <RotateCcw className="w-4 h-4" strokeWidth={2} />}
              {retrying
                ? (isArabic ? 'جارٍ إعادة المحاولة…' : 'Retrying…')
                : (isArabic ? 'إعادة المحاولة' : 'Retry')}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={retrying}
            data-testid="processing-error-close"
            className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-50 disabled:opacity-50"
            style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
          >
            {isArabic ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}
