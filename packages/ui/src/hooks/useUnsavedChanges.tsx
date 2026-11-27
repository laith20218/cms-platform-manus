import { useCallback, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

/**
 * useUnsavedChanges — the shared "you have unsaved work" guard for modal and
 * drawer surfaces (Command Center P2: "Unsaved-change confirmation where
 * applicable").
 *
 * Usage (one guard per owning surface):
 *
 *   const guard = useUnsavedChanges({ dir });
 *   // wrap the surface's close path:
 *   <Drawer open={open} onOpenChange={(next) => { if (!next) guard.closeIfClean(isDirty, () => setOpen(false)); else setOpen(true); }} …/>
 *
 * When the surface is clean the closer runs immediately; when it is dirty a
 * ConfirmDialog asks first (إغلاق دون حفظ / متابعة التحرير). The guard never
 * overrides a BUSY submit — owners keep their own dismissGuard wiring.
 */
export interface UseUnsavedChangesOptions {
  dir?: 'rtl' | 'ltr';
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  testId?: string;
}

export interface UnsavedChangesGuard {
  /** Call from the surface's close path. Runs `close` when not dirty. */
  closeIfClean: (dirty: boolean, close: () => void) => void;
  /** The ConfirmDialog node to render once, next to the owning surface. */
  dialog: React.ReactNode;
}

export function useUnsavedChanges({
  dir = 'rtl',
  title = 'تغييرات غير محفوظة',
  description = 'لديك تعديلات لم يتم حفظها. سيتم فقدانها إذا أغلقت اللوحة الآن.',
  confirmLabel = 'إغلاق دون حفظ',
  cancelLabel = 'متابعة التحرير',
  testId = 'unsaved-changes-confirm',
}: UseUnsavedChangesOptions = {}): UnsavedChangesGuard {
  const [open, setOpen] = useState(false);
  const pendingClose = useRef<(() => void) | null>(null);

  const closeIfClean = useCallback((dirty: boolean, close: () => void) => {
    if (!dirty) { close(); return; }
    pendingClose.current = close;
    setOpen(true);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => { if (!next) { setOpen(false); pendingClose.current = null; } }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      variant="danger"
      dir={dir}
      onConfirm={() => {
        setOpen(false);
        const run = pendingClose.current;
        pendingClose.current = null;
        run?.();
      }}
      testId={testId}
    />
  );

  return { closeIfClean, dialog };
}
