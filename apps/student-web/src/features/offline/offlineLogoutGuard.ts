import {
  isNativePackagesSurfaceActive,
  nativeListOfflinePackages,
} from '@/utils/native-packages';
import { clearAutoPackageMarkers } from './useAutoSubjectPackage';

/**
 * Owner decision (offline-experience implementation, 2026-11-28) — logout safety:
 * before an EXPLICIT logout / account switch wipes the native offline stores
 * (Phase P), the student is warned when unsynchronized offline answers exist and
 * must CONFIRM; pending answers are deleted only on confirmation. Nothing is
 * discarded silently.
 *
 * This helper is called ONLY from the explicit logout path — never from session
 * expiry, 401 verdicts, or network loss (those keep offline content per the
 * same owner decision).
 */

/** Total unsynchronized offline answers across all stored packages; 0 outside the shell. */
export function countPendingOfflineAnswers(): number {
  if (!isNativePackagesSurfaceActive()) return 0;
  const rows = nativeListOfflinePackages();
  if (!rows) return 0;
  return rows.reduce((sum, row) => sum + (row.pendingAnswerCount ?? 0), 0);
}
