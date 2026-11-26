/**
 * HardDeleteDialog — SuperAdmin physical-delete confirm flow (Command Center P1, D-4).
 *
 * Backs the "حذف نهائي" row actions: POST /api/v1/admin/system/hard-delete with the
 * acting admin's password. Without the cascade checkbox the backend FAILS LOUDLY
 * with the child counts (HARD_DELETE_HAS_CHILDREN) — that error is surfaced inline
 * so the admin can read it and retry with «حذف العناصر المرتبطة أيضًا» checked.
 *
 * PR-1 (Gate B #3): the dialog mirrors the backend hard-delete flag on open
 * (GET /api/v1/admin/system/hard-delete/status). When the flag is off it shows an
 * honest disabled notice instead of a password form — the enforcement itself lives
 * in the backend handler, so a failing/unreachable status probe falls back to the
 * normal form and lets the backend reject with HARD_DELETE_DISABLED.
 *
 * Consequences are Arabic-first (per the destructive-action contract); every run is
 * one transaction + Critical intent/executed audit events on the backend.
 */
import { useEffect, useState } from 'react';
import { LoaderCircle, ShieldAlert } from 'lucide-react';
import { Dialog } from '@cms/ui';
import { adminHardDelete, adminHardDeleteStatus, ApiError, type WipeTableCount } from '../lib/api';
import { t, localeOf } from '../lib/dictionary';

export type HardDeleteTarget = {
  /** Backend module key: exam | question | course | episode | subject | lecture | exam-course | library-file. */
  module: string;
  targetId: string;
  /** Display name of the entity for the dialog title. */
  label: string;
};

type HardDeleteDialogProps = {
  token: string;
  isArabic: boolean;
  target: HardDeleteTarget | null;
  /** Arabic consequence sentence (already localized by the caller). */
  consequence: string;
  /** Fired after a successful deletion — the caller refreshes its list. */
  onDone: (deleted: WipeTableCount[]) => void;
  onClose: () => void;
};

export function HardDeleteDialog({ token, isArabic, target, consequence, onDone, onClose }: HardDeleteDialogProps) {
  // PR-3 — destructive-warning strings resolve from the shared dictionary.
  const locale = localeOf(isArabic);
  const [password, setPassword] = useState('');
  const [cascade, setCascade] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');
  const [flagDisabled, setFlagDisabled] = useState(false);

  // PR-1: mirror the backend flag while the dialog is open. The backend stays the
  // single enforcement point — this only avoids asking for a password that would
  // be rejected with HARD_DELETE_DISABLED anyway.
  useEffect(() => {
    if (!target) return;
    setFlagDisabled(false);
    let cancelled = false;
    adminHardDeleteStatus(token)
      .then((status) => { if (!cancelled) setFlagDisabled(!status.enabled); })
      .catch(() => { /* unreachable status probe: keep the form; the backend gate decides */ });
    return () => { cancelled = true; };
  }, [target, token]);

  const submit = async () => {
    if (!target || !password) return;
    setExecuting(true);
    setError('');
    try {
      const result = await adminHardDelete(token, {
        module: target.module,
        targetId: target.targetId,
        actorPassword: password,
        cascade,
      });
      onDone(result.deleted);
      onClose();
      setPassword('');
      setCascade(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t(locale, 'danger.hardDelete.failed'));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => { if (!open && !executing) { onClose(); setPassword(''); setCascade(false); setError(''); } }}
      title={t(locale, 'danger.hardDelete.dialogTitle', { label: target?.label ?? '' })}
      dir={isArabic ? 'rtl' : 'ltr'}
      testId="hard-delete-dialog"
    >
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {flagDisabled ? (
          <div className="space-y-4" data-testid="hard-delete-disabled-notice">
            <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {t(locale, 'danger.hardDelete.disabledNotice')}
              </span>
            </p>
            <p className="text-sm text-slate-600">
              {t(locale, 'danger.hardDelete.disabledArchiveHint')}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 hover:bg-slate-50 transition-colors"
              >
                {t(locale, 'common.close')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{consequence}</span>
            </p>
            <p className="text-sm text-slate-600">
              {t(locale, 'danger.hardDelete.physicalDeleteHint')}
            </p>
            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={cascade}
                onChange={(event) => setCascade(event.target.checked)}
                data-testid="hard-delete-cascade"
                className="mt-0.5"
              />
              <span>
                {t(locale, 'danger.hardDelete.cascadeLabel')}
              </span>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">{t(locale, 'danger.hardDelete.passwordLabel')}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                data-testid="hard-delete-password"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-red-500 focus:outline-none text-sm"
              />
            </label>
            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={executing}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {t(locale, 'common.cancel')}
              </button>
              <button
                type="submit"
                disabled={executing || !password}
                data-testid="hard-delete-execute"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-700 hover:bg-red-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {executing && <LoaderCircle className="w-4 h-4 animate-spin" />}
                {t(locale, 'danger.hardDelete.execute')}
              </button>
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}
