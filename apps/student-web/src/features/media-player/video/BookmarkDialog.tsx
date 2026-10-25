import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Bookmark, LoaderCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { mediaApi, type MediaAssetType } from '../services/media-api';
import { formatMediaDuration } from './time';

/**
 * Push 10.2 — "Save clip" dialog (dark, matches the player shell).
 * Start defaults to the current playback position, end to +30s, label is
 * required. Submit → POST {assetType}/{assetId}/bookmarks; the response's
 * X-Duration-Warning: unknown (asset duration unknown server-side) surfaces
 * as a soft note on the success toast.
 */
export function BookmarkDialog({
  open,
  onOpenChange,
  assetType,
  assetId,
  currentTime,
  duration,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetType: MediaAssetType;
  assetId: string;
  currentTime: number;
  duration: number | null;
}) {
  const CLIP_SECONDS = 30;
  const maxEnd = duration != null && Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : null;

  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest values via refs: the dialog must snapshot the CURRENT position the
  // moment it opens — depending on the props directly would re-seed the form
  // on every timeupdate (~4×/s while playing) and wipe what the user typed.
  const timeRef = useRef(currentTime);
  timeRef.current = currentTime;
  const maxEndRef = useRef(maxEnd);
  maxEndRef.current = maxEnd;

  // Re-seed the defaults exactly once per open.
  useEffect(() => {
    if (!open) return;
    const s = Math.max(0, Math.floor(timeRef.current));
    let e = s + CLIP_SECONDS;
    if (maxEndRef.current !== null) e = Math.min(e, maxEndRef.current);
    setStart(s);
    setEnd(Math.max(s + 1, e));
    setLabel('');
    setNote('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startValid = Number.isFinite(start) && start >= 0;
  const endValid = Number.isFinite(end) && end > start && (maxEnd === null || end <= maxEnd);

  const submit = async () => {
    if (!label.trim()) {
      setError('العنوان مطلوب');
      return;
    }
    if (!startValid || !endValid) {
      setError(maxEnd !== null ? 'نهاية المقطع يجب أن تكون بعد بدايته وداخل مدة الفيديو' : 'نهاية المقطع يجب أن تكون بعد بدايته');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { bookmark, durationWarning } = await mediaApi.createBookmark(assetType, assetId, {
        startSeconds: start,
        endSeconds: end,
        label: label.trim(),
        note: note.trim() || null,
      });
      toast.success(`تم حفظ المقطع «${bookmark.label}»`, {
        description: `${formatMediaDuration(bookmark.startSeconds)} → ${formatMediaDuration(bookmark.endSeconds)}${durationWarning ? ' — تحقق من نهاية المقطع لاحقاً' : ''}`,
        duration: 3500,
      });
      onOpenChange(false);
    } catch {
      setError('تعذّر حفظ المقطع. تحقق من اتصالك وحاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          dir="rtl"
          data-testid="bookmark-dialog"
          className="fixed left-1/2 top-1/2 z-[80] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#0b1120]/95 p-6 shadow-2xl outline-none backdrop-blur-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-teal-400/20 bg-teal-400/10 text-teal-300">
                <Bookmark className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div>
                <DialogPrimitive.Title className="text-base font-bold text-white">حفظ مقطع</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-slate-400">
                  حدد بداية المقطع ونهايته بعنوان يذكرك به لاحقاً
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close
              aria-label="إغلاق"
              data-testid="bookmark-close"
              className="press flex h-10 w-10 items-center justify-center rounded-2xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
            </DialogPrimitive.Close>
          </div>

          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">البداية (ثانية)</span>
                <input
                  type="number"
                  min={0}
                  max={maxEnd ?? undefined}
                  value={start}
                  onChange={(e) => setStart(Math.max(0, Number(e.target.value)))}
                  data-testid="bookmark-start"
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-3 font-mono text-sm tabular-nums text-white outline-none transition-colors focus:border-teal-400/60"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-300">النهاية (ثانية)</span>
                <input
                  type="number"
                  min={0}
                  max={maxEnd ?? undefined}
                  value={end}
                  onChange={(e) => setEnd(Number(e.target.value))}
                  data-testid="bookmark-end"
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-3 font-mono text-sm tabular-nums text-white outline-none transition-colors focus:border-teal-400/60"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-300">
                العنوان <span className="text-teal-300">*</span>
              </span>
              <input
                type="text"
                maxLength={100}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="مثال: شرح الرسم البياني"
                data-testid="bookmark-label"
                className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 outline-none transition-colors focus:border-teal-400/60"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-300">ملاحظة (اختياري)</span>
              <input
                type="text"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="أي تفاصيل إضافية"
                data-testid="bookmark-note"
                className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 outline-none transition-colors focus:border-teal-400/60"
              />
            </label>

            {error && (
              <p role="alert" data-testid="bookmark-error" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              data-testid="bookmark-submit"
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 px-4 text-sm font-bold text-[#0b1120] transition-colors hover:bg-teal-400 disabled:opacity-60"
            >
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" strokeWidth={2} />}
              {submitting ? 'جارٍ الحفظ…' : 'حفظ المقطع'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
