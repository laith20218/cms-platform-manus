/**
 * Wave 12.2.C.5 — the player status bar (single h-9 row, bottom of the
 * player column).
 *
 * Content (E4): صفحة س/ص · تكبير % · مؤشر الحفظ · عداد البحث i/n (the match
 * counter only while search is open). Mobile < sm hides the SECONDARY
 * indicators (match count + the verbose saving label) and keeps page x/y +
 * zoom % — the always-readable minimum.
 *
 * Focus mode hides the bar through the SAME keep-mounted animation as the
 * top bar (max-h + opacity + translate — never display:none, never unmount).
 *
 * §13: logical properties only (no left/right), ramp tokens (#0b1120 surface,
 * #1e293b border, slate-400 muted), tabular numerals for the counters.
 */

export interface PdfStatusBarProps {
  page: number;
  pageCount: number;
  zoomPercent: number;
  saving: boolean;
  searchOpen: boolean;
  matchCount: number;
  /** 0-based active match index (rendered as i+1/n). */
  activeMatchIndex: number;
  /** Wave 12.2.C.5 — animate away (keep mounted) in focus mode. */
  focusMode: boolean;
}

export function PdfStatusBar({ page, pageCount, zoomPercent, saving, searchOpen, matchCount, activeMatchIndex, focusMode }: PdfStatusBarProps) {
  return (
    <div
      aria-hidden={focusMode || undefined}
      /* Wave 12.3.A (A.6) — the collapsed bar is ALSO `invisible`: visibility:
       * hidden drops its content from the tab order, so aria-hidden and
       * focusability never conflict (axe aria-hidden-focus), and the e2e
       * focus gate asserts both the attribute and the visual hiding. */
      className={`shrink-0 overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none ${
        focusMode ? 'max-h-0 translate-y-2 opacity-0 invisible' : 'max-h-12 translate-y-0 opacity-100'
      }`}
    >
      <div
        data-testid="pdf-status-bar"
        className="flex h-9 items-center justify-center gap-4 rounded-2xl border border-[#1e293b] bg-[#0b1120] px-4 text-[11px] font-bold text-slate-400"
      >
        <span className="flex items-center gap-1.5">
          صفحة
          <span lang="en" data-testid="pdf-status-page" className="tabular-nums text-slate-300">
            {page} / {pageCount || '–'}
          </span>
        </span>
        <span aria-hidden="true" className="h-3 w-px bg-[#1e293b]" />
        <span className="flex items-center gap-1.5">
          تكبير
          <span lang="en" data-testid="pdf-status-zoom" className="tabular-nums text-slate-300">
            {Math.round(zoomPercent)}%
          </span>
        </span>
        {saving && (
          <span data-testid="pdf-status-saving" className="hidden items-center gap-1 text-slate-400 sm:flex">
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#25C7E8]" />
            يتم الحفظ تلقائياً
          </span>
        )}
        {searchOpen && (
          <span data-testid="pdf-status-search" className="hidden items-center gap-1.5 sm:flex">
            <span aria-hidden="true" className="h-3 w-px bg-[#1e293b]" />
            البحث
            <span lang="en" className="tabular-nums text-slate-300">
              {matchCount > 0 ? `${Math.min(activeMatchIndex + 1, matchCount)} / ${matchCount}` : '0 / 0'}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
