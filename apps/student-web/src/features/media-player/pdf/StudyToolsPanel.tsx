/**
 * Wave 12.2.C.4 — Study Tools rail (inline-start of the main row).
 *
 * Phase C.1 ships the STRUCTURAL SLOT only: the component mounts between the
 * controls bar and the center scroll column (FIRST flex-row child →
 * inline-start → RIGHT in the app's RTL layout) and returns null until the
 * real tool stack lands later in this wave. Keeping the slot mounted now
 * makes the main-row structure verifiable (e2e/DIAG) without painting UI.
 *
 * Red lines honored by the host layout (PdfPlayer main row): this rail may
 * animate its width in focus mode but must NEVER unmount the center scroll
 * column or collapse it to w-0/display:none.
 */
export function StudyToolsPanel() {
  return null;
}
