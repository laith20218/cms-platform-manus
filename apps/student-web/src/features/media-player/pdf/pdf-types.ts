/**
 * Wave 11.8 / F2 — PDF player domain types.
 *
 * Geometry is stored in PAGE-NORMALIZED coordinates (0..1 relative to the
 * page's own width/height) so annotations survive zoom, viewport and device
 * changes: rendering scales them by the live page size, never re-anchors to
 * screen space. This is the canonical stored form (D.4 recommendation).
 *
 * The wire contract mirrors the backend FileAnnotationDto:
 *   { id, pageNumber, annotationType: "Highlight" | "Ink", payload, … }
 * where payload is a schema-agnostic jsonb object the server stores 1:1.
 */

/** Rect in page-normalized coordinates (0..1, origin top-left). */
export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Point in page-normalized coordinates (0..1, origin top-left). */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/** Highlight payload — one entry per visual line box (Range.getClientRects). */
export interface HighlightPayload {
  rects: NormalizedRect[];
  color: string;
  /** First 200 chars of the selected text — future search/summarization aid. */
  textSnippet?: string;
}

/** Ink payload — freehand stroke; width is a fraction of the page width. */
export interface InkPayload {
  points: NormalizedPoint[];
  color: string;
  width: number;
}

export type PdfAnnotationPayload = HighlightPayload | InkPayload;

export type PdfAnnotationTypeValue = 'Highlight' | 'Ink';

/** Wire/entity shape (matches backend FileAnnotationDto camelCase).
 *  Type alias (not interface) — LazyPlayerMount's `Record<string, unknown>`
 *  constraint accepts the implicit index signature of type aliases only
 *  (same convention as AudioPlayerProps). */
export type PdfAnnotation =
  | {
      id: string;
      pageNumber: number;
      annotationType: 'Highlight';
      payload: HighlightPayload;
      createdAt?: string;
      updatedAt?: string;
    }
  | {
      id: string;
      pageNumber: number;
      annotationType: 'Ink';
      payload: InkPayload;
      createdAt?: string;
      updatedAt?: string;
    };

/** Batch-save request body (POST /library/{id}/annotations). */
export interface SaveAnnotationsBatch {
  upserts: Array<Pick<PdfAnnotation, 'id' | 'pageNumber' | 'annotationType' | 'payload'>>;
  deletedIds: string[];
}

export interface SaveAnnotationsResult {
  appliedCount: number;
  serverTime: string;
}

/** Watermark identity echoed from POST /library/{id}/access. */
export interface PdfWatermark {
  studentName: string;
  studentPhone: string;
  timestamp: string;
  siteName: string;
}

export type PdfTool = 'pointer' | 'highlighter' | 'pen';

/** Props contract for the code-split PdfPlayer (LazyPlayerMount). */
export type PdfPlayerProps = {
  assetType: 'library-file';
  assetId: string;
  title?: string;
  pagesCount?: number;
  watermark?: PdfWatermark;
  /** Wave 11.9 — the API's FontPipelineFixed flag: true ONLY when Ghostscript
   *  re-embedded the file's fonts server-side ({key}-fixed object).
   *  R22: retained for wire-compatibility/observability ONLY — the player no
   *  longer reads it (path rendering is universal; see PdfPlayer.tsx). */
  fontPipelineFixed?: boolean;
  testId?: string;
};
