import { useEffect, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as SliderPrimitive from '@radix-ui/react-slider';
import {
  ArrowUpRight, Check, ChevronLeft, ChevronRight, Circle, Focus, MoveHorizontal,
  Redo, Search, Square, Star, Trash2, Undo, ZoomIn, ZoomOut,
} from 'lucide-react';
import { cn } from '@/utils';
import type { PdfTool, ShapeKind } from './pdf-types';
import { HIGHLIGHT_COLORS, NOTE_COLORS, PEN_COLORS, SHAPE_COLORS } from './pdf-palette';

/**
 * Wave 11.8 / F2 — the PDF player toolbar (supervisor D4: Phase 1 ships the
 * FULL polished UI, not just the engine).
 *
 * Matches the PlayerShell aesthetic (glass buttons on the dark stage) and the
 * ControlsBar conventions: 48px touch targets (supervisor floor for this
 * toolbar), Radix primitives, physical-LTR clusters for page/zoom numerals
 * (ControlsBar precedent) inside the app's RTL layout.
 *
 * Wave 11.10 (F2 Phase 2): 'shape' (diagram shapes — rect/ellipse/arrow/star
 * sub-picker + palette) and 'note' (sticky notes — palette) join the Phase 1
 * tools, and a delete button appears while a shape is selected.
 *
 * R30.2: undo/redo buttons for the annotation history (strokes, shapes,
 * notes, eraser gestures) — disabled at the stack edges, mirrored by
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y. Test ids deliberately sit OUTSIDE the
 * `pdf-tool-` prefix: that prefix is the 6-tool S1c e2e contract.
 *
 * R30.3: the fullscreen toggle lives ONLY in PlayerShell (native Fullscreen
 * API, stage-targeted by design). The old zoom-fit button carried lucide's
 * `Maximize` glyph and read as a second fullscreen control — it now uses
 * `MoveHorizontal` (fit WIDTH, what it actually does).
 *
 * Wave 12.2.C.4 — the six TOOL buttons moved to the StudyToolsPanel rail
 * (the rail now owns the canonical `pdf-tool-*` testids so the S1/S1c e2e
 * contract counts stay exact). This bar keeps everything else: the
 * contextual rows (pen thickness, palettes, shape kinds) driven by the
 * shared tool state, delete-selected, undo/redo, search-open, page nav and
 * zoom.
 */

/** Wave 11.10 — the shape-kind sub-picker shown while the shape tool is active. */
const SHAPE_KINDS: Array<{ id: ShapeKind; icon: typeof Square; label: string }> = [
  { id: 'rect', icon: Square, label: 'مستطيل' },
  { id: 'ellipse', icon: Circle, label: 'دائرة' },
  { id: 'arrow', icon: ArrowUpRight, label: 'سهم' },
  { id: 'star', icon: Star, label: 'نجمة' },
];

function Divider() {
  return <span aria-hidden="true" className="mx-1 hidden h-8 w-px bg-white/10 sm:block" />;
}

function ColorPicker({ label, colors, value, onChange, testId }: {
  label: string;
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          data-testid="pdf-color-trigger"
          className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
        >
          <span className="h-6 w-6 rounded-full border-2 border-white/30 shadow-inner" style={{ background: value }} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={10}
          align="center"
          dir="rtl"
          data-testid={testId}
          className="z-[70] rounded-2xl border border-white/10 bg-[#0b1120] p-3 shadow-2xl"
        >
          <p className="mb-2 text-[11px] font-bold text-slate-400">{label}</p>
          <div className="flex items-center gap-2">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => { onChange(color); setOpen(false); }}
                aria-label={`لون ${color}`}
                aria-pressed={color === value}
                className="press relative inline-flex h-10 w-10 items-center justify-center rounded-full border-2 transition-transform hover:scale-105"
                style={{ background: color, borderColor: color === value ? '#ffffff' : 'transparent' }}
              >
                {color === value && <Check className="h-4 w-4 text-black/60" strokeWidth={3} />}
              </button>
            ))}
          </div>
          <PopoverPrimitive.Arrow className="fill-[#0b1120]" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export interface PdfControlsBarProps {
  tool: PdfTool;
  highlightColor: string;
  onHighlightColorChange: (color: string) => void;
  penColor: string;
  onPenColorChange: (color: string) => void;
  penWidth: number;
  onPenWidthChange: (width: number) => void;
  /** Wave 11.10 — shape tool state. */
  shapeKind: ShapeKind;
  onShapeKindChange: (kind: ShapeKind) => void;
  shapeColor: string;
  onShapeColorChange: (color: string) => void;
  /** Wave 11.10 — sticky note state. */
  noteColor: string;
  onNoteColorChange: (color: string) => void;
  /** Wave 11.10 — a shape is selected in pointer mode → offer the trash. */
  canDeleteSelected: boolean;
  onDeleteSelected: () => void;
  /** R30.2 — annotation history (strokes/shapes/notes/eraser). */
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  /** Wave 11.11 — opens the floating search panel. */
  onSearchOpen: () => void;
  /** Wave 11.11-C — the current page has no text layer (scanned). */
  scannedPage: boolean;
  /** Tooltip shown on text-dependent controls while scanned. */
  scannedTitle: string;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  saving: boolean;
  /** Wave 12.2.C.5 — focus-mode toggle lives in the top bar (48px). */
  focusMode: boolean;
  onToggleFocus: () => void;
}

export function PdfControlsBar({
  tool,
  highlightColor, onHighlightColorChange,
  penColor, onPenColorChange, penWidth, onPenWidthChange,
  shapeKind, onShapeKindChange, shapeColor, onShapeColorChange,
  noteColor, onNoteColorChange,
  canDeleteSelected, onDeleteSelected,
  canUndo, canRedo, onUndo, onRedo,
  page, pageCount, onPageChange, onPrevPage, onNextPage, onSearchOpen, scannedPage, scannedTitle,
  zoomPercent, onZoomIn, onZoomOut, onZoomFit, canZoomIn, canZoomOut,
  saving, focusMode, onToggleFocus,
}: PdfControlsBarProps) {
  const [pageInput, setPageInput] = useState(String(page));

  // Keep the input in sync when the page changes from scroll / prev / next.
  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const commitPage = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isFinite(parsed) && pageInput !== '') {
      onPageChange(Math.max(1, Math.min(pageCount, parsed)));
    } else {
      setPageInput(String(page));
    }
  };

  return (
    <div
      data-testid="pdf-controls-bar"
      className="flex w-full flex-wrap items-center justify-center gap-1 rounded-3xl border border-white/10 bg-[#0b1120]/90 px-2 py-2 shadow-2xl backdrop-blur sm:justify-between sm:px-3"
    >
      {/* Wave 12.2.C.4 — contextual controls only (the tool buttons moved to
          the StudyToolsPanel rail): pen thickness/palette, shape kinds +
          palette, note palette, eraser hint — driven by the shared tool state. */}
      <div className="flex items-center gap-1">
        {canDeleteSelected && (
          <button
            type="button"
            onClick={onDeleteSelected}
            aria-label="حذف الشكل المحدد"
            title="حذف الشكل المحدد"
            data-testid="pdf-delete-selected"
            className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-red-400/40 bg-red-500/15 text-red-300 transition-colors hover:bg-red-500/25"
          >
            <Trash2 className="h-5 w-5" strokeWidth={1.75} />
          </button>
        )}
        {/* R30.2 — history controls: disabled (never hidden) at the stack
            edges, matching the scanned-page gating convention. */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="تراجع"
          title="تراجع (Ctrl+Z)"
          data-testid="pdf-undo"
          className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="إعادة"
          title="إعادة (Ctrl+Y)"
          data-testid="pdf-redo"
          className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Redo className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <Divider />
        {tool === 'pen' ? (
          <>
            <ColorPicker label="لون القلم" colors={PEN_COLORS} value={penColor} onChange={onPenColorChange} testId="pdf-pen-colors" />
            <div className="flex h-12 min-w-32 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3" data-testid="pdf-pen-thickness">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true">
                <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth={1 + (penWidth / 8) * 3} strokeLinecap="round" />
              </svg>
              <SliderPrimitive.Root
                dir="ltr"
                value={[penWidth]}
                onValueChange={(values) => onPenWidthChange(values[0] ?? penWidth)}
                min={1}
                max={8}
                step={0.5}
                aria-label="سماكة القلم"
                className="cms-slider-slider relative flex h-6 w-24 touch-none select-none items-center"
              >
                <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-white/15">
                  <SliderPrimitive.Range className="absolute h-full rounded-full bg-teal-300" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                  aria-label="سماكة القلم"
                  className="block h-5 w-5 rounded-full border-2 border-[#0b1120] bg-teal-300 shadow-lg outline-none transition-transform hover:scale-110"
                />
              </SliderPrimitive.Root>
            </div>
          </>
        ) : tool === 'highlighter' ? (
          <ColorPicker label="لون التظليل" colors={HIGHLIGHT_COLORS} value={highlightColor} onChange={onHighlightColorChange} testId="pdf-highlight-colors" />
        ) : tool === 'shape' ? (
          <>
            <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1" data-testid="pdf-shape-kinds">
              {SHAPE_KINDS.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onShapeKindChange(id)}
                  aria-label={label}
                  aria-pressed={shapeKind === id}
                  title={label}
                  data-testid={`pdf-shape-kind-${id}`}
                  className={cn(
                    'press inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                    shapeKind === id
                      ? 'bg-teal-400/20 text-teal-300'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </button>
              ))}
            </div>
            <ColorPicker label="لون الشكل" colors={SHAPE_COLORS} value={shapeColor} onChange={onShapeColorChange} testId="pdf-shape-colors" />
          </>
        ) : tool === 'note' ? (
          <ColorPicker label="لون الملاحظة" colors={NOTE_COLORS} value={noteColor} onChange={onNoteColorChange} testId="pdf-note-colors" />
        ) : tool === 'eraser' ? (
          <span className="hidden px-2 text-[11px] leading-tight text-slate-400 sm:block">
            مرّر فوق التظليل أو الحبر أو الأشكال أو الملاحظات لمحوها بالكامل
          </span>
        ) : (
          <span className="hidden px-2 text-[11px] leading-tight text-slate-400 sm:block">
            مرّر، ثم حدّد النص للتظليل
          </span>
        )}
      </div>

      {/* Page navigation — physical LTR cluster (numerals + arrows), ControlsBar precedent */}
      <div dir="ltr" className="flex items-center gap-1">
        <button
          type="button"
          onClick={onSearchOpen}
          disabled={scannedPage}
          aria-label={scannedPage ? scannedTitle : 'بحث في المستند'}
          title={scannedPage ? scannedTitle : 'بحث في المستند'}
          data-testid="pdf-search-open"
          className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Search className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <button
          type="button" onClick={onPrevPage} disabled={page <= 1}
          aria-label="الصفحة السابقة" data-testid="pdf-page-prev"
          className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <div className="flex h-12 items-center gap-1 rounded-2xl border border-white/10 bg-white/5 px-2">
          <input
            dir="ltr" lang="en" inputMode="numeric"
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitPage}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.currentTarget.blur(); } }}
            aria-label="رقم الصفحة"
            data-testid="pdf-page-input"
            className="h-8 w-10 rounded-lg bg-white/10 text-center text-sm font-bold tabular-nums text-white outline-none focus:ring-2 focus:ring-teal-400/40"
          />
          <span lang="en" className="text-sm font-bold tabular-nums text-slate-400">/ {pageCount || '–'}</span>
        </div>
        <button
          type="button" onClick={onNextPage} disabled={page >= pageCount}
          aria-label="الصفحة التالية" data-testid="pdf-page-next"
          className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>

      {/* Zoom + autosave status */}
      <div className="flex items-center gap-1">
        {saving && (
          <span className="hidden items-center gap-1 text-[11px] text-teal-300/80 sm:inline-flex" data-testid="pdf-saving">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-300" />
            يتم الحفظ تلقائياً
          </span>
        )}
        <Divider />
        <div dir="ltr" className="flex items-center gap-1">
          <button
            type="button" onClick={onZoomOut} disabled={!canZoomOut}
            aria-label="تصغير" data-testid="pdf-zoom-out"
            className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            <ZoomOut className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <span lang="en" data-testid="pdf-zoom-value" className="min-w-12 text-center text-sm font-bold tabular-nums text-slate-300">
            {Math.round(zoomPercent)}%
          </span>
          <button
            type="button" onClick={onZoomIn} disabled={!canZoomIn}
            aria-label="تكبير" data-testid="pdf-zoom-in"
            className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            <ZoomIn className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <button
            type="button" onClick={onZoomFit}
            aria-label="ملاءمة العرض" data-testid="pdf-zoom-fit"
            /* R30.3 — this is FIT-WIDTH, not fullscreen: the Maximize glyph
               read as a second fullscreen toggle next to PlayerShell's. */
            className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10"
          >
            <MoveHorizontal className="h-5 w-5" strokeWidth={1.75} />
          </button>
          {/* Wave 12.2.C.5 — focus mode: collapses chrome around the page;
              exits via this toggle, the floating pill, Escape or F. */}
          <button
            type="button" onClick={onToggleFocus}
            aria-pressed={focusMode}
            aria-label={focusMode ? 'إنهاء وضع التركيز' : 'وضع التركيز'}
            title="وضع التركيز (F)"
            data-testid="pdf-focus-toggle"
            className={`press inline-flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8] ${
              focusMode
                ? 'border-[#1685F8] bg-[#1685F8]/15 text-[#25C7E8] ring-2 ring-[#1685F8]'
                : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Focus className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}
