import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';

/**
 * Wave 11.11 / F2 Phase 3 — the floating search panel.
 *
 * Floating (not a toolbar cluster) by design: search needs input + live count
 * + prev/next + close, which would overflow the wrapping toolbar at mobile
 * widths; the toolbar keeps only the entry button. Anchored to the top-right
 * of the player's scroll column, INSIDE the player (a portal-free sibling of
 * the pages) so it inherits the shell's glass aesthetic with zero portal
 * plumbing.
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
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function PdfSearchPanel({
  query, onQueryChange, matchCount, activeIndex, progress, onNext, onPrev, onClose,
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
      className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#0b1120]/95 p-2 shadow-2xl backdrop-blur"
    >
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
  );
}
