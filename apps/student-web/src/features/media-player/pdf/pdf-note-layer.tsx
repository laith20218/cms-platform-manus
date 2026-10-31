import { useState } from 'react';
import { StickyNote, Trash2 } from 'lucide-react';
import type { NoteAnnotation, PdfAnnotation } from './pdf-types';

/**
 * Wave 11.10 / F2 Phase 2 — the sticky-note DOM layer for ONE page.
 *
 * Supervisor contract (C): notes are DOM (icon + inline text editor), NOT SVG.
 * The layer is a sibling rendered ABOVE the text layer (z-index 25; the R18
 * z-order 0/10/11/20 is untouched) with `pointer-events: none` on the container
 * so text selection keeps working everywhere; ONLY the icons and the open
 * editor re-enable `pointer-events: auto`.
 *
 * Editor: inline, absolutely positioned at the note's normalized anchor — it
 * inherits the page geometry, so it survives zoom/scroll with zero re-anchor
 * logic (a portal popover would need manual scroll/zoom syncing). Commit on
 * blur or save; the trash deletes. Empty-text notes are cleaned up by the
 * parent on commit, so a stray click never persists a blank note.
 */

export interface NoteLayerProps {
  /** ALL annotations of this page — Note entries are filtered internally. */
  annotations: PdfAnnotation[];
  openNoteId: string | null;
  /** Wave 11.11 — eraser mode: the layer goes FULLY passive (even the icons
   *  lose pointer-events) so eraser gestures over a note reach the ink SVG
   *  and the geometry hit test, instead of opening the editor. */
  passive?: boolean;
  onOpen: (id: string) => void;
  onCommit: (note: NoteAnnotation, text: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function NoteLayer({ annotations, openNoteId, passive = false, onOpen, onCommit, onDelete, onClose }: NoteLayerProps) {
  const notes = annotations.filter((a) => a.annotationType === 'Note');
  const openNote = openNoteId
    ? notes.find((n) => n.id === openNoteId && n.annotationType === 'Note')
    : undefined;

  return (
    <div className={`pdf-note-layer${passive ? ' is-passive' : ''}`} data-testid={`pdf-note-layer`}>
      {notes.map((note) => (
        <button
          key={note.id}
          type="button"
          onClick={() => onOpen(note.id)}
          aria-label="ملاحظة — اضغط للفتح"
          title="ملاحظة"
          data-testid="pdf-note-icon"
          data-note-id={note.id}
          className="pdf-note-icon press absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-900/20 shadow-lg transition-transform hover:scale-110"
          style={{
            left: `${note.payload.x * 100}%`,
            top: `${note.payload.y * 100}%`,
            background: note.payload.color,
          }}
        >
          <StickyNote className="h-4 w-4 text-slate-900" strokeWidth={2} />
        </button>
      ))}
      {openNote && (
        <NoteEditor
          key={openNote.id}
          note={openNote}
          onCommit={onCommit}
          onDelete={onDelete}
          onClose={onClose}
        />
      )}
    </div>
  );
}

interface NoteEditorProps {
  note: NoteAnnotation;
  onCommit: (note: NoteAnnotation, text: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** Internal (not exported — react-refresh): one open note editor. Keyed by
 *  note id so switching notes resets the local draft. */
function NoteEditor({ note, onCommit, onDelete, onClose }: NoteEditorProps) {
  const [text, setText] = useState(note.payload.text);

  // Flip the editor toward the page interior when the anchor sits near the
  // right/bottom edge (the anchor is the ICON center; the editor grows
  // right/down from the same point by default).
  const flipX = note.payload.x > 0.6;
  const flipY = note.payload.y > 0.62;

  const commitAndClose = () => {
    onCommit(note, text);
    onClose();
  };

  return (
    <div
      data-testid="pdf-note-editor"
      /* Hook for PlayerShell's onEscapeKeyDown guard (Radix dismisses at
         document level before the editor's own keydown can run). */
      data-pdf-note-editor="true"
      className="pdf-note-editor absolute w-60 rounded-2xl border border-white/15 bg-[#0b1120] p-2 shadow-2xl"
      style={{
        left: `${note.payload.x * 100}%`,
        top: `${note.payload.y * 100}%`,
        transform: `${flipX ? 'translateX(calc(-100% - 24px))' : 'translateX(12px)'} ${flipY ? 'translateY(calc(-100% - 8px))' : 'translateY(-8px)'}`,
      }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-[11px] font-bold text-slate-300">
          <StickyNote className="h-3.5 w-3.5" style={{ color: note.payload.color }} />
          ملاحظة
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label="حذف الملاحظة"
            title="حذف الملاحظة"
            data-testid="pdf-note-delete"
            /* preventDefault on mousedown keeps the textarea's blur from
               committing+unmounting before this click lands. */
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onDelete(note.id)}
            className="press inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-300 transition-colors hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </span>
      </div>
      <textarea
        autoFocus
        dir="rtl"
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commitAndClose}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            /* stopPropagation: keep the key away from PlayerShell's Radix
               Escape-dismiss (defense in depth — the shell also guards via
               onEscapeKeyDown; see PlayerShell.tsx). */
            event.stopPropagation();
            event.preventDefault();
            commitAndClose();
          }
        }}
        aria-label="نص الملاحظة"
        data-testid="pdf-note-textarea"
        placeholder="اكتب ملاحظتك هنا…"
        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 p-2 text-sm leading-relaxed text-slate-100 outline-none placeholder:text-slate-500 focus:border-teal-400/40 focus:ring-2 focus:ring-teal-400/20"
      />
    </div>
  );
}
