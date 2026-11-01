import type { HighlightPayload, NoteAnnotation, PdfAnnotation } from './pdf-types';

/**
 * Wave 12.3.C — pure collection/ordering helpers for the Study Tools lists
 * (notes / highlights / bookmarks).
 *
 * The annotation Map in PdfPlayer is ALREADY document-scoped (usePdfAnnotations
 * keys hydration by fileId and the player remounts per file), so "filters the
 * current document" is satisfied by construction — these helpers apply the
 * TYPE filter and the stable display ordering:
 *  - notes: page ascending, then createdAt ascending (stable reading order);
 *  - highlights: page ascending, then the FIRST rect's y, then x — a visual
 *    top-to-bottom / inline-direction order inside the page (rects are
 *    page-normalized 0..1, so the order is zoom/viewport invariant).
 *
 * Pure and dependency-free so vitest can falsify them directly (D.4 convention).
 */

/** Which list the Study Tools section buttons open (12.3.C). */
export type StudyListKind = 'notes' | 'highlights' | 'bookmarks';

/** One note annotation (alias keeps the panel props readable). */
export type NoteEntry = NoteAnnotation;

/** One highlight entry flattened for list display. */
export interface HighlightEntry {
  id: string;
  pageNumber: number;
  color: string;
  snippet?: string;
  /** First rect (the display/flash anchor) — page-normalized. */
  firstRect: HighlightPayload['rects'][number];
}

/** Filters to Note annotations and orders them page-asc → createdAt-asc. */
export function collectNotes(annotations: Iterable<PdfAnnotation>): NoteEntry[] {
  const notes: NoteEntry[] = [];
  for (const annotation of annotations) {
    if (annotation.annotationType === 'Note') notes.push(annotation);
  }
  return notes.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    const at = a.createdAt ?? '';
    const bt = b.createdAt ?? '';
    if (at !== bt) return at < bt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Filters to Highlight annotations and orders them page-asc → y → x. */
export function collectHighlights(annotations: Iterable<PdfAnnotation>): HighlightEntry[] {
  const highlights: HighlightEntry[] = [];
  for (const annotation of annotations) {
    if (annotation.annotationType !== 'Highlight') continue;
    const rects = annotation.payload.rects;
    if (!rects || rects.length === 0) continue; // a degenerate payload has no visual anchor
    highlights.push({
      id: annotation.id,
      pageNumber: annotation.pageNumber,
      color: annotation.payload.color,
      snippet: annotation.payload.textSnippet,
      firstRect: rects[0],
    });
  }
  return highlights.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.firstRect.y !== b.firstRect.y) return a.firstRect.y - b.firstRect.y;
    if (a.firstRect.x !== b.firstRect.x) return a.firstRect.x - b.firstRect.x;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
