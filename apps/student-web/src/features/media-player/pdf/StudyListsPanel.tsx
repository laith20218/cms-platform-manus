import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Bookmark, StickyNote, X } from 'lucide-react';
import { cn } from '@/utils';
import type { PageBookmark } from './pdf-bookmarks';
import type { HighlightEntry, NoteEntry, StudyListKind } from './study-lists';

/**
 * Wave 12.3.C — the Study Tools LIST panel (notes / highlights / bookmarks).
 *
 * Two shells, one body (supervisor-locked):
 *  - `docked` (≥ lg): a 288px side panel column of the main row;
 *  - `drawer` (< lg): a Radix Dialog slide-over — max-w-[85vw], dimmed
 *    bg-black/60 backdrop (pdf-drawer-backdrop), tap-outside closes, same
 *    contract as the 12.3.A drawers.
 *
 * Rows: notes (text + page), highlights (color dot + snippet + page),
 * bookmarks (page + first-30-chars page-text snippet when available + a
 * per-row remove). Clicking a note/highlight/bookmark navigates
 * (goToPage) and FLASHES the target (the parent owns the flash timer).
 *
 * §13: ≥44px rows, aria-labels, logical properties only, ramp tokens
 * (#0b1120 / #1e293b / #25C7E8 focus), tabular numerals, Arabic ≥1.6
 * line-height, max-h + scroll for long lists.
 */

const LIST_META: Record<StudyListKind, { title: string; empty: string }> = {
  notes: { title: 'الملاحظات', empty: 'لا توجد ملاحظات بعد' },
  highlights: { title: 'التظليلات', empty: 'لا توجد تظليلات بعد' },
  bookmarks: { title: 'العلامات المرجعية', empty: 'لا توجد علامات مرجعية بعد' },
};

export interface StudyListsPanelProps {
  kind: StudyListKind;
  variant: 'docked' | 'drawer';
  notes: NoteEntry[];
  highlights: HighlightEntry[];
  bookmarks: PageBookmark[];
  /** Page-text snippet source for bookmark rows (null when not extracted). */
  snippetFor: (page: number) => string | null;
  /** Row click → navigate + flash (annotationId null for bookmarks). */
  onEntryClick: (page: number, annotationId: string | null) => void;
  /** Bookmark row remove (44px target, stopPropagation inside the row). */
  onBookmarkRemove: (page: number) => void;
  onClose: () => void;
}

export function StudyListsPanel({
  kind, variant, notes, highlights, bookmarks, snippetFor, onEntryClick, onBookmarkRemove, onClose,
}: StudyListsPanelProps) {
  const meta = LIST_META[kind];
  const body = (
    <ListBody
      kind={kind}
      notes={notes}
      highlights={highlights}
      bookmarks={bookmarks}
      snippetFor={snippetFor}
      onEntryClick={onEntryClick}
      onBookmarkRemove={onBookmarkRemove}
    />
  );

  if (variant === 'docked') {
    return (
      <aside
        data-testid="pdf-study-lists"
        aria-label={meta.title}
        className="hidden h-full w-72 shrink-0 flex-col overflow-hidden border-e border-[#1e293b] bg-[#0b1120] lg:flex"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#1e293b] px-3">
          <span className="text-sm font-bold text-white">{meta.title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={`إغلاق ${meta.title}`}
            data-testid="pdf-study-lists-close"
            className="press flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition-colors duration-200 ease-out hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">{body}</div>
      </aside>
    );
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-testid="pdf-drawer-backdrop" className="fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="pdf-study-lists"
          className="fixed inset-y-0 start-0 z-50 flex w-72 max-w-[85vw] flex-col border-e border-[#1e293b] bg-[#0b1120] p-0 shadow-2xl outline-none"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#1e293b] px-3">
            <DialogPrimitive.Title className="text-sm font-bold text-white">{meta.title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={`إغلاق ${meta.title}`}
              data-testid="pdf-study-lists-close"
              className="press flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition-colors duration-200 ease-out hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]"
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="max-h-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">{body}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface ListBodyProps {
  kind: StudyListKind;
  notes: NoteEntry[];
  highlights: HighlightEntry[];
  bookmarks: PageBookmark[];
  snippetFor: (page: number) => string | null;
  onEntryClick: (page: number, annotationId: string | null) => void;
  onBookmarkRemove: (page: number) => void;
}

function ListBody({ kind, notes, highlights, bookmarks, snippetFor, onEntryClick, onBookmarkRemove }: ListBodyProps) {
  if (kind === 'notes') {
    if (notes.length === 0) return <EmptyState message={LIST_META.notes.empty} testid="pdf-list-empty-notes" />;
    return (
      <ul className="flex flex-col gap-1" role="list">
        {notes.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              data-testid="pdf-list-row"
              data-page={note.pageNumber}
              onClick={() => onEntryClick(note.pageNumber, note.id)}
              className="press flex w-full items-start gap-2 rounded-xl border border-transparent px-2 py-2.5 text-start transition-colors duration-200 ease-out hover:border-[#1e293b] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8] min-h-11"
            >
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0" style={{ color: note.payload.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold leading-relaxed text-slate-200">
                  {note.payload.text || 'ملاحظة'}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-slate-500">
                  صفحة
                  <span lang="en" className="tabular-nums text-slate-400">{note.pageNumber}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (kind === 'highlights') {
    if (highlights.length === 0) return <EmptyState message={LIST_META.highlights.empty} testid="pdf-list-empty-highlights" />;
    return (
      <ul className="flex flex-col gap-1" role="list">
        {highlights.map((highlight) => (
          <li key={highlight.id}>
            <button
              type="button"
              data-testid="pdf-list-row"
              data-page={highlight.pageNumber}
              onClick={() => onEntryClick(highlight.pageNumber, highlight.id)}
              className="press flex w-full items-start gap-2 rounded-xl border border-transparent px-2 py-2.5 text-start transition-colors duration-200 ease-out hover:border-[#1e293b] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8] min-h-11"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border border-white/20"
                style={{ background: highlight.color }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold leading-relaxed text-slate-200">
                  {highlight.snippet || 'تظليل نص'}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-slate-500">
                  صفحة
                  <span lang="en" className="tabular-nums text-slate-400">{highlight.pageNumber}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (bookmarks.length === 0) return <EmptyState message={LIST_META.bookmarks.empty} testid="pdf-list-empty-bookmarks" />;
  return (
    <ul className="flex flex-col gap-1" role="list">
      {bookmarks.map((bookmark) => {
        const captured = bookmark.snippet || snippetFor(bookmark.page) || '';
        return (
          <li key={bookmark.page}>
            <div
              data-testid="pdf-list-row"
              data-page={bookmark.page}
              className="flex w-full items-center gap-1 rounded-xl border border-transparent px-1 transition-colors duration-200 ease-out hover:border-[#1e293b] hover:bg-white/5"
            >
              <button
                type="button"
                onClick={() => onEntryClick(bookmark.page, null)}
                aria-label={`الانتقال إلى الصفحة ${bookmark.page}`}
                className="press flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]"
              >
                <Bookmark className="h-4 w-4 shrink-0 text-[#25C7E8]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold leading-relaxed text-slate-200">
                    {captured || `الصفحة ${bookmark.page}`}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-slate-500">
                    صفحة
                    <span lang="en" className="tabular-nums text-slate-400">{bookmark.page}</span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onBookmarkRemove(bookmark.page)}
                aria-label={`إزالة العلامة عن الصفحة ${bookmark.page}`}
                data-testid="pdf-bookmark-remove"
                className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 ease-out hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25C7E8]"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState({ message, testid }: { message: string; testid: string }) {
  return (
    <div
      data-testid={testid}
      className={cn('flex flex-col items-center gap-2 px-4 py-10 text-center')}
    >
      <Bookmark className="h-8 w-8 text-slate-600" strokeWidth={1.25} aria-hidden="true" />
      <p className="text-xs font-bold leading-relaxed text-slate-500">{message}</p>
    </div>
  );
}
