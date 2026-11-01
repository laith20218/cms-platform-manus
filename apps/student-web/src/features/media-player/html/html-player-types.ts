/**
 * Wave 13 (F3) — shared types for the HTML player.
 *
 * View-only player for team-built interactive lessons (G-1): no editing, no
 * annotations, no external assets. The `enableScripts` flag (Q1) is the ONLY
 * switch between the two locked sandbox policies:
 *  - true  → sandbox="allow-scripts" + injected CSP WITH script-src 'unsafe-inline'
 *  - false → sandbox=""             + injected CSP WITHOUT any script-src
 * `allow-same-origin` is NEVER granted (Q4 — lessons use in-memory state).
 */

/** Watermark identity echoed from POST /library/{id}/access (same DTO as the PDF player). */
export type HtmlWatermark = {
  studentName: string;
  studentPhone: string;
  timestamp: string;
  siteName: string;
};

/** A type alias (not an interface) so it satisfies LazyPlayerMount's
 *  `TProps extends Record<string, unknown>` constraint (PdfPlayerProps precedent). */
export type HtmlPlayerProps = {
  assetType: 'library-file';
  assetId: string;
  /** Visible iframe title (accessibility) — the lesson title. */
  title: string;
  /** Trusted interactive-lesson flag persisted on the row at upload-url time. */
  enableScripts: boolean;
  /** Invisible deterrent overlay (Q5 — reused from the PDF player). */
  watermark?: HtmlWatermark;
  testId?: string;
}
