import { useEffect, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ChevronLeft, ChevronRight, Images, MoveHorizontal, Wrench, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * Wave 12.3.A (A.2) — the mobile bottom action bar (`< lg` ONLY).
 *
 * Supervisor-locked contents, single h-14 row docked to the bottom of the
 * PLAYER column (inside the PdfPlayer root flow — never position:fixed to
 * the window, so the shell padding and the status bar stay honest):
 *
 *   [ Thumbnails toggle | Page x/y (tap → jump popover) | Zoom % (tap →
 *     zoom menu) | Study Tools toggle ]
 *
 * The floating Thumbnails/Study-Tools toggles are REMOVED below `lg`
 * (A.3) — this bar is their only trigger; on `lg:`+ it is display:none
 * and the docked rails + floating toggles keep their 12.2 behavior.
 * Focus-mode access on mobile stays in the TOP bar (locked A.1 wording:
 * "keep search + focus in the TOP BAR") — the Study Tools panel also
 * carries a focus button as a secondary reach.
 *
 * §13: every target ≥ 44px (h-12/h-13), aria-pressed + labels, logical
 * properties only, ramp tokens (#0b1120 surface / #1e293b border /
 * #25C7E8 focus ring), tabular numerals, Radix popovers portal+trap.
 */

export interface MobileActionBarProps {
  page: number;
  pageCount: number;
  onGoToPage: (page: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  /** Thumbnails drawer state (controlled — the drawer lives in ThumbnailsRail). */
  thumbsOpen: boolean;
  onThumbsToggle: () => void;
  /** Study-tools drawer state (controlled — the drawer lives in StudyToolsPanel). */
  toolsOpen: boolean;
  onToolsToggle: () => void;
}

const TRIGGER_CLASS = 'press inline-flex h-12 min-w-14 items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors duration-200 ease-out hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]';

export function MobileActionBar({
  page, pageCount, onGoToPage, onPrevPage, onNextPage,
  zoomPercent, onZoomIn, onZoomOut, onZoomFit, canZoomIn, canZoomOut,
  thumbsOpen, onThumbsToggle, toolsOpen, onToolsToggle,
}: MobileActionBarProps) {
  const [pageJumpOpen, setPageJumpOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [pageInput, setPageInput] = useState(String(page));

  // Keep the jump input in sync with the live page (scroll/prev/next).
  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const commitPage = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isFinite(parsed) && pageInput !== '') {
      onGoToPage(Math.max(1, Math.min(pageCount || 1, parsed)));
    } else {
      setPageInput(String(page));
    }
    setPageJumpOpen(false);
  };

  return (
    <div
      data-testid="pdf-mobile-action-bar"
      className="flex h-14 shrink-0 items-stretch justify-around gap-1 rounded-2xl border border-[#1e293b] bg-[#0b1120] px-1 py-0.5 lg:hidden"
    >
      {/* Thumbnails toggle — opens the inline-end drawer (ThumbnailsRail). */}
      <button
        type="button"
        onClick={onThumbsToggle}
        aria-pressed={thumbsOpen}
        aria-label="مصغرات الصفحات"
        title="مصغرات الصفحات"
        data-testid="pdf-mobile-thumbs"
        className={`${TRIGGER_CLASS} w-14 flex-col ${thumbsOpen ? 'border-[#1685F8] text-[#25C7E8] ring-2 ring-[#1685F8]' : ''}`}
      >
        <Images className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        <span className="text-[9px] font-bold leading-none">المصغرات</span>
      </button>

      {/* Page jump — tap opens a numeric-input popover; arrows flank it. */}
      <div dir="ltr" className="flex items-center gap-0.5">
        <button
          type="button" onClick={onPrevPage} disabled={page <= 1}
          aria-label="الصفحة السابقة" data-testid="pdf-mobile-page-prev"
          className="press inline-flex h-12 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <PopoverPrimitive.Root open={pageJumpOpen} onOpenChange={setPageJumpOpen}>
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              aria-label="الانتقال إلى صفحة"
              title="الانتقال إلى صفحة"
              data-testid="pdf-mobile-page"
              className={`${TRIGGER_CLASS} px-1`}
            >
              <span lang="en" className="text-sm font-bold tabular-nums">
                {page} / {pageCount || '–'}
              </span>
            </button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              side="top"
              sideOffset={10}
              align="center"
              dir="rtl"
              data-testid="pdf-mobile-page-popover"
              className="z-[70] flex w-44 flex-col gap-2 rounded-2xl border border-white/10 bg-[#0b1120] p-3 shadow-2xl"
            >
              <p className="text-[11px] font-bold text-slate-400">الانتقال إلى صفحة</p>
              <input
                dir="ltr" lang="en" inputMode="numeric"
                autoFocus
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitPage(); } }}
                aria-label="رقم الصفحة"
                data-testid="pdf-mobile-page-input"
                className="h-11 rounded-xl border border-white/10 bg-white/10 text-center text-sm font-bold tabular-nums text-white outline-none focus:ring-2 focus:ring-[#25C7E8]/40"
              />
              <button
                type="button"
                onClick={commitPage}
                data-testid="pdf-mobile-page-go"
                className="press inline-flex h-11 items-center justify-center rounded-xl bg-[#1685F8] text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-[#1685F8]/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]"
              >
                انتقال
              </button>
              <PopoverPrimitive.Arrow className="fill-[#0b1120]" />
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
        <button
          type="button" onClick={onNextPage} disabled={page >= pageCount}
          aria-label="الصفحة التالية" data-testid="pdf-mobile-page-next"
          className="press inline-flex h-12 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {/* Zoom menu — tap opens zoom in / fit / zoom out (48px rows). */}
      <PopoverPrimitive.Root open={zoomMenuOpen} onOpenChange={setZoomMenuOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label="مستوى التكبير"
            title="مستوى التكبير"
            data-testid="pdf-mobile-zoom"
            className={`${TRIGGER_CLASS} px-1`}
          >
            <span lang="en" className="text-sm font-bold tabular-nums">{Math.round(zoomPercent)}%</span>
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side="top"
            sideOffset={10}
            align="center"
            dir="rtl"
            data-testid="pdf-mobile-zoom-menu"
            className="z-[70] flex w-44 flex-col gap-1 rounded-2xl border border-white/10 bg-[#0b1120] p-2 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => { onZoomIn(); }}
              disabled={!canZoomIn}
              aria-label="تكبير"
              data-testid="pdf-mobile-zoom-in"
              className="press inline-flex h-12 items-center justify-start gap-2 rounded-xl px-3 text-sm font-bold text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              <ZoomIn className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" /> تكبير
            </button>
            <button
              type="button"
              onClick={() => { onZoomFit(); setZoomMenuOpen(false); }}
              aria-label="ملاءمة العرض"
              data-testid="pdf-mobile-zoom-fit"
              className="press inline-flex h-12 items-center justify-start gap-2 rounded-xl px-3 text-sm font-bold text-slate-200 transition-colors hover:bg-white/10"
            >
              <MoveHorizontal className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" /> ملاءمة العرض
            </button>
            <button
              type="button"
              onClick={() => { onZoomOut(); }}
              disabled={!canZoomOut}
              aria-label="تصغير"
              data-testid="pdf-mobile-zoom-out"
              className="press inline-flex h-12 items-center justify-start gap-2 rounded-xl px-3 text-sm font-bold text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              <ZoomOut className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" /> تصغير
            </button>
            <PopoverPrimitive.Arrow className="fill-[#0b1120]" />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      {/* Study tools toggle — opens the inline-start drawer (StudyToolsPanel). */}
      <button
        type="button"
        onClick={onToolsToggle}
        aria-pressed={toolsOpen}
        aria-label="أدوات الدراسة"
        title="أدوات الدراسة"
        data-testid="pdf-mobile-tools"
        className={`${TRIGGER_CLASS} w-14 flex-col ${toolsOpen ? 'border-[#1685F8] text-[#25C7E8] ring-2 ring-[#1685F8]' : ''}`}
      >
        <Wrench className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        <span className="text-[9px] font-bold leading-none">الأدوات</span>
      </button>
    </div>
  );
}
