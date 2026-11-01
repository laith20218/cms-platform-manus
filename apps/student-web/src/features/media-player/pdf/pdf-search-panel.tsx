import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Search, TriangleAlert, X } from 'lucide-react';

/**
 * Wave 11.11 / F2 Phase 3 — the floating search panel.
 *
 * Floating (not a toolbar cluster) by design: search needs input + live count
 * + prev/next + close, which would overflow the wrapping toolbar at mobile
 * widths; the toolbar keeps only the entry button. Anchored to the inline-end
 * edge of the player's scroll column, INSIDE the player (a portal-free
 * sibling of the pages) so it inherits the shell's glass aesthetic with zero
 * portal plumbing.
 *
 * Wave 12.3.D (M3) — the resolver's nullCount surfaces as a subtle info row
 * BELOW the controls, ONLY when > 0: some matches could not be pinned to the
 * text layer (unrendered pages / span divergence) and use the approximate
 * data-only boxes. DEV keeps the console.warn (PdfPlayer); PROD is silent —
 * the stats ride the onSearchRectsResolved callback exclusively.
 *
 * Escape contract (mirrors the sticky-note editor): the input stops
 * propagation AND the shell suppresses Radix dismissal for keydowns
 * originating inside [data-pdf-search-panel] (PlayerShell.onEscapeKeyDown) —
 * Escape closes the PANEL, never the whole player dialog.
 */

export interface PdfSearchPanelProps {
  query: string;
  onQueryChange: (query: string) => void;
  matchCount: number;
  /** 0-based index of the active match. */
  activeIndex: number;
  /** Whole-document sweep progress (null when idle/done). */
  progress: { done: number; total: number } | null;
  /** Wave 12.3.D (M3) — matches resolved ONLY by the data-only fallback this
   *  query. The approximation banner renders when > 0. */
  fallbackCount?: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function PdfSearchPanel({
  query, onQueryChange, matchCount, activeIndex, progress, fallbackCount = 0, onNext, onPrev, onClose,
}: PdfSearchPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus once on mount — the panel is unmounted on close, so a fresh
  // mount always means a fresh search session.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buttonClass = 'press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div
      data-pdf-search-panel="true"
      data-testid="pdf-search-panel"
      className="absolute end-3 top-3 z-30 flex flex-col items-stretch gap-1.5 rounded-2xl border border-white/10 bg-[#0b1120]/95 p-2 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-1.5">
      <Search className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
      <input
        ref={inputRef}
        dir="rtl"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key === 'Enter' && matchCount > 0) {
            event.preventDefault();
            onNext();
          }
        }}
        placeholder="ابحث في المستند…"
        aria-label="بحث في المستند"
        data-testid="pdf-search-input"
        className="h-10 w-44 rounded-xl border border-white/10 bg-white/10 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/20 sm:w-60"
      />
      <span
        data-testid="pdf-search-count"
        lang="en"
        className="min-w-16 text-center text-xs font-bold tabular-nums text-slate-300"
      >
        {matchCount > 0
          ? `${activeIndex + 1} / ${matchCount}`
          : progress
            ? `${progress.done} / ${progress.total}`
            : '0 / 0'}
      </span>
      {progress && matchCount === 0 && (
        <span className="hidden text-[11px] text-slate-400 sm:inline">جارٍ البحث…</span>
      )}
      <button
        type="button"
        onClick={onPrev}
        disabled={matchCount === 0}
        aria-label="النتيجة السابقة"
        title="النتيجة السابقة"
        data-testid="pdf-search-prev"
        className={buttonClass}
      >
        <ChevronUp className="h-4 w-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={matchCount === 0}
        aria-label="النتيجة التالية"
        title="النتيجة التالية"
        data-testid="pdf-search-next"
        className={buttonClass}
      >
        <ChevronDown className="h-4 w-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="إغلاق البحث"
        title="إغلاق البحث (Esc)"
        data-testid="pdf-search-close"
        className={buttonClass}
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
      </div>

      {/* Wave 12.3.D (M3) — approximation banner: visible ONLY when the DOM
          resolver left matches unpinned this query (nullCount > 0). Subtle
          by contract — the results are still position-anchored and usable,
          the banner explains WHY the boxes are approximate and that they
          sharpen as pages render. */}
      {fallbackCount > 0 && (
        <p
          data-testid="pdf-search-fallback-banner"
          title="هذه الصفحات لم تُعرض بعد، لذا الإحداثيات تقريبية. ستتحسن بمجرد عرضها."
          className="flex items-start gap-1.5 rounded-xl bg-amber-400/10 px-2 py-1.5 text-[10px] font-bold leading-relaxed text-amber-300"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            بعض النتائج تعتمد على تقدير تقريبي ({'\u200F'}
            <span lang="en" className="tabular-nums">{fallbackCount}</span>)
          </span>
          <span className="sr-only">
            هذه الصفحات لم تُعرض بعد، لذا الإحداثيات تقريبية. ستتحسن بمجرد عرضها.
          </span>
        </p>
      )}
    </div>
  );
}
