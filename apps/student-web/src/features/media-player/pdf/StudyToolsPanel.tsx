import { useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ArrowUpRight, Bookmark, Check, Circle, Eraser, Highlighter, MousePointer2,
  Pencil, Search, Shapes, Square, Star, StickyNote, Wrench, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/utils';
import type { PdfTool, ShapeKind } from './pdf-types';
import { HIGHLIGHT_COLORS, NOTE_COLORS, PEN_COLORS, SHAPE_COLORS } from './pdf-palette';

/**
 * Wave 12.2.C.4 — Study Tools rail (inline-start of the main row; RIGHT in
 * the app's RTL layout — the approved mockup order [StudyTools][Center][Thumbs]).
 *
 * Testid ownership (e2e contract): the SIX tool buttons carry the canonical
 * `pdf-tool-*` ids (pointer/highlighter/pen/shape/note/eraser) — exactly one
 * element each in the whole player, so the S1/S1c assertions
 * (`[data-testid^="pdf-tool-"]` count === 6) hold. Consequently the bottom
 * bar's tool cluster moved out (12.2.C.4); its contextual rows (pen
 * thickness, palettes, shape kinds), undo/redo, delete, page nav, search-open
 * and zoom stay untouched. The rail's OWN palettes/submenus use `pdf-rail-*`
 * testids; search toggle is `pdf-study-search` and the bookmarks placeholder
 * is `pdf-bookmarks-toggle` — both OUTSIDE the `pdf-tool-` prefix so the
 * 6-tool count stays exact.
 *
 * V1 scope (E5): shell + empty states; the note/highlight LISTS arrive in
 * 12.3. Bookmarks is a placeholder that toasts (locked copy).
 *
 * §13: 48px touch targets, aria-pressed + aria-label on every icon button,
 * focus-visible cyan rings, active accent ring #1685F8, ramp tokens, logical
 * properties only, < lg collapses into a Radix Dialog drawer (48px trigger).
 */

const TOOLS: Array<{ id: PdfTool; icon: typeof MousePointer2; label: string }> = [
  { id: 'pointer', icon: MousePointer2, label: 'تحديد وتنقّل' },
  { id: 'highlighter', icon: Highlighter, label: 'تظليل النص' },
  { id: 'pen', icon: Pencil, label: 'قلم الحبر' },
  { id: 'shape', icon: Shapes, label: 'أشكال توضيحية' },
  { id: 'note', icon: StickyNote, label: 'ملاحظة لاصقة' },
  { id: 'eraser', icon: Eraser, label: 'ممحاة ذكية' },
];

const TOOL_TEST_IDS: Record<PdfTool, string> = {
  pointer: 'pdf-tool-pointer',
  highlighter: 'pdf-tool-highlighter',
  pen: 'pdf-tool-pen',
  shape: 'pdf-tool-shape',
  note: 'pdf-tool-note',
  eraser: 'pdf-tool-eraser',
};

const SHAPE_KINDS: Array<{ id: ShapeKind; icon: typeof Square; label: string }> = [
  { id: 'rect', icon: Square, label: 'مستطيل' },
  { id: 'ellipse', icon: Circle, label: 'دائرة' },
  { id: 'arrow', icon: ArrowUpRight, label: 'سهم' },
  { id: 'star', icon: Star, label: 'نجمة' },
];

export interface StudyToolsPanelProps {
  tool: PdfTool;
  onToolChange: (tool: PdfTool) => void;
  highlightColor: string;
  onHighlightColorChange: (color: string) => void;
  penColor: string;
  onPenColorChange: (color: string) => void;
  shapeKind: ShapeKind;
  onShapeKindChange: (kind: ShapeKind) => void;
  shapeColor: string;
  onShapeColorChange: (color: string) => void;
  noteColor: string;
  onNoteColorChange: (color: string) => void;
  searchOpen: boolean;
  onSearchToggle: () => void;
  /** Wave 11.11-C — scanned-page gating: disabled, NEVER hidden. */
  scannedPage: boolean;
  scannedTitle: string;
  /** Wave 12.2.C.5 — focus mode hides the rail entirely (still mounted). */
  focusMode?: boolean;
}

export function StudyToolsPanel({
  tool, onToolChange,
  highlightColor, onHighlightColorChange,
  penColor, onPenColorChange,
  shapeKind, onShapeKindChange, shapeColor, onShapeColorChange,
  noteColor, onNoteColorChange,
  searchOpen, onSearchToggle,
  scannedPage, scannedTitle,
  focusMode = false,
}: StudyToolsPanelProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const stack = (
    <ToolStack
      tool={tool} onToolChange={onToolChange}
      highlightColor={highlightColor} onHighlightColorChange={onHighlightColorChange}
      penColor={penColor} onPenColorChange={onPenColorChange}
      shapeKind={shapeKind} onShapeKindChange={onShapeKindChange}
      shapeColor={shapeColor} onShapeColorChange={onShapeColorChange}
      noteColor={noteColor} onNoteColorChange={onNoteColorChange}
      searchOpen={searchOpen} onSearchToggle={onSearchToggle}
      scannedPage={scannedPage} scannedTitle={scannedTitle}
      onToolPicked={() => setDrawerOpen(false)}
    />
  );

  return (
    <>
      {/* Desktop rail (≥ lg): a 48px-button vertical stack, its own surface.
          Focus mode (12.2.C.5) animates the WIDTH to 0 — keep-mounted,
          overflow-hidden, border dropped; the inner fixed-width column keeps
          every button mounted (never display:none, never unmount). */}
      <nav
        data-testid="pdf-study-tools"
        aria-label="أدوات الدراسة"
        aria-hidden={focusMode || undefined}
        className={cn(
          'hidden h-full shrink-0 overflow-hidden border-e transition-all duration-200 ease-out motion-reduce:transition-none lg:block',
          focusMode ? 'w-0 border-transparent' : 'w-14 border-[#1e293b]',
        )}
      >
        <div className="flex h-full w-14 flex-col items-center gap-1 bg-[#0b1120] py-2">
          {stack}
        </div>
      </nav>

      {/* Mobile (< lg): floating 48px trigger + inline-start Dialog drawer. */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label="فتح أدوات الدراسة"
            title="أدوات الدراسة"
            data-testid="pdf-study-tools-open"
            className={focusMode
              ? 'hidden'
              : 'press absolute bottom-3 start-3 z-30 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-[#0b1120]/90 text-slate-200 shadow-2xl backdrop-blur transition-colors duration-200 ease-out hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[#25C7E8] lg:hidden'}
          >
            <Wrench className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#071426]/60" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 start-0 z-50 flex w-72 max-w-[85vw] flex-col border-e border-[#1e293b] bg-[#0b1120] p-3 shadow-2xl outline-none"
          >
            <div className="mb-2 flex items-center justify-between">
              <DialogPrimitive.Title className="text-sm font-bold text-white">أدوات الدراسة</DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="إغلاق أدوات الدراسة"
                data-testid="pdf-study-tools-close"
                className="press flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition-colors duration-200 ease-out hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[#25C7E8]"
              >
                <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
              {stack}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

interface ToolStackProps {
  tool: PdfTool;
  onToolChange: (tool: PdfTool) => void;
  highlightColor: string;
  onHighlightColorChange: (color: string) => void;
  penColor: string;
  onPenColorChange: (color: string) => void;
  shapeKind: ShapeKind;
  onShapeKindChange: (kind: ShapeKind) => void;
  shapeColor: string;
  onShapeColorChange: (color: string) => void;
  noteColor: string;
  onNoteColorChange: (color: string) => void;
  searchOpen: boolean;
  onSearchToggle: () => void;
  scannedPage: boolean;
  scannedTitle: string;
  /** Drawer mode closes the dialog after a tool pick (desktop: no-op). */
  onToolPicked?: () => void;
}

/** The shared vertical button stack (desktop rail + mobile drawer). */
function ToolStack({
  tool, onToolChange,
  highlightColor, onHighlightColorChange,
  penColor, onPenColorChange,
  shapeKind, onShapeKindChange, shapeColor, onShapeColorChange,
  noteColor, onNoteColorChange,
  searchOpen, onSearchToggle,
  scannedPage, scannedTitle,
  onToolPicked,
}: ToolStackProps) {
  const pick = (id: PdfTool) => { onToolChange(id); onToolPicked?.(); };

  return (
    <>
      {TOOLS.map(({ id, icon: Icon, label }) => {
        const active = tool === id;
        const disabled = scannedPage && id === 'highlighter';
        return (
          <div key={id} className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => pick(id)}
              disabled={disabled}
              aria-label={disabled && scannedTitle ? scannedTitle : label}
              aria-pressed={active}
              aria-disabled={disabled || undefined}
              title={disabled && scannedTitle ? scannedTitle : label}
              data-testid={TOOL_TEST_IDS[id]}
              data-active={active ? 'true' : 'false'}
              className={cn(
                'press inline-flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]',
                active
                  ? 'border-[#1685F8] bg-[#1685F8]/15 text-[#25C7E8] ring-2 ring-[#1685F8]'
                  : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white',
                disabled && 'cursor-not-allowed opacity-40',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
            {/* Contextual rail palettes — appear only while their tool is
                active (mirrors the bar's contextual-row behavior; separate
                pdf-rail-* testids keep the e2e surface unique). */}
            {active && id === 'highlighter' && (
              <RailColorPicker label="لون التظليل" colors={HIGHLIGHT_COLORS} value={highlightColor} onChange={onHighlightColorChange} testId="pdf-rail-highlight-colors" />
            )}
            {active && id === 'pen' && (
              <RailColorPicker label="لون القلم" colors={PEN_COLORS} value={penColor} onChange={onPenColorChange} testId="pdf-rail-pen-colors" />
            )}
            {active && id === 'shape' && (
              <>
                <RailShapeKinds shapeKind={shapeKind} onShapeKindChange={onShapeKindChange} />
                <RailColorPicker label="لون الشكل" colors={SHAPE_COLORS} value={shapeColor} onChange={onShapeColorChange} testId="pdf-rail-shape-colors" />
              </>
            )}
            {active && id === 'note' && (
              <RailColorPicker label="لون الملاحظة" colors={NOTE_COLORS} value={noteColor} onChange={onNoteColorChange} testId="pdf-rail-note-colors" />
            )}
          </div>
        );
      })}

      <RailDivider />

      {/* Search toggle — OUTSIDE the pdf-tool- prefix (the S1c 6-count). */}
      <button
        type="button"
        onClick={onSearchToggle}
        disabled={scannedPage}
        aria-label={scannedPage ? scannedTitle : (searchOpen ? 'إغلاق البحث' : 'بحث في المستند')}
        aria-pressed={searchOpen}
        title={scannedPage ? scannedTitle : 'بحث في المستند'}
        data-testid="pdf-study-search"
        className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors duration-200 ease-out hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Search className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {/* Bookmarks — v1 placeholder (locked copy). OUTSIDE pdf-tool- prefix. */}
      <button
        type="button"
        onClick={() => { toast.info('قريباً — ستتوفر في التحديث القادم', { duration: 2000 }); }}
        aria-label="العلامات المرجعية — قريباً"
        title="العلامات المرجعية"
        data-testid="pdf-bookmarks-toggle"
        className="press inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors duration-200 ease-out hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]"
      >
        <Bookmark className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </>
  );
}

function RailDivider() {
  return <span aria-hidden="true" className="my-1 h-px w-8 bg-[#1e293b]" />;
}

/** Small popover palette (rail-scoped testids — never pdf-color-trigger). */
function RailColorPicker({ label, colors, value, onChange, testId }: {
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
          data-testid={testId}
          className="press inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors duration-200 ease-out hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]"
        >
          <span className="h-5 w-5 rounded-full border-2 border-white/30 shadow-inner" style={{ background: value }} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={8}
          align="center"
          dir="rtl"
          side="left"
          data-testid={`${testId}-panel`}
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
                className="press relative inline-flex h-10 w-10 items-center justify-center rounded-full border-2 transition-transform duration-200 ease-out hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]"
                style={{ background: color, borderColor: color === value ? '#ffffff' : 'transparent' }}
              >
                {color === value && <Check className="h-4 w-4 text-black/60" strokeWidth={3} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <PopoverPrimitive.Arrow className="fill-[#0b1120]" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Shape-kind submenu (rail-scoped pdf-rail-shape-kind-* testids). */
function RailShapeKinds({ shapeKind, onShapeKindChange }: {
  shapeKind: ShapeKind;
  onShapeKindChange: (kind: ShapeKind) => void;
}) {
  return (
    <div className="flex w-9 flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1" data-testid="pdf-rail-shape-kinds">
      {SHAPE_KINDS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onShapeKindChange(id)}
          aria-label={label}
          aria-pressed={shapeKind === id}
          title={label}
          data-testid={`pdf-rail-shape-kind-${id}`}
          className={cn(
            'press inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]',
            shapeKind === id ? 'bg-[#1685F8]/20 text-[#25C7E8]' : 'text-slate-300 hover:bg-white/10 hover:text-white',
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
