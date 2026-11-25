/**
 * HardDeleteDialog — SuperAdmin physical-delete confirm flow (Command Center P1, D-4).
 *
 * Backs the "حذف نهائي" row actions: POST /api/v1/admin/system/hard-delete with the
 * acting admin's password. Without the cascade checkbox the backend FAILS LOUDLY
 * with the child counts (HARD_DELETE_HAS_CHILDREN) — that error is surfaced inline
 * so the admin can read it and retry with «حذف العناصر المرتبطة أيضًا» checked.
 *
 * Consequences are Arabic-first (per the destructive-action contract); every run is
 * one transaction + a Critical audit event on the backend.
 */
import { useState } from 'react';
import { LoaderCircle, ShieldAlert } from 'lucide-react';
import { Dialog } from '@cms/ui';
import { adminHardDelete, ApiError, type WipeTableCount } from '../lib/api';

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
  const [password, setPassword] = useState('');
  const [cascade, setCascade] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');

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
      setError(err instanceof ApiError ? err.message : isArabic ? 'فشل الحذف النهائي' : 'Hard delete failed');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => { if (!open && !executing) { onClose(); setPassword(''); setCascade(false); setError(''); } }}
      title={isArabic ? `حذف نهائي: ${target?.label ?? ''}` : `Hard delete: ${target?.label ?? ''}`}
      dir={isArabic ? 'rtl' : 'ltr'}
      testId="hard-delete-dialog"
    >
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <p className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{consequence}</span>
        </p>
        <p className="text-sm text-slate-600">
          {isArabic
            ? 'هذا حذف فعلي من قاعدة البيانات يتجاوز الأرشفة. أدخل كلمة مرورك الحالية للمتابعة.'
            : 'This physically deletes the row, bypassing archiving. Enter your current password to proceed.'}
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
            {isArabic ? 'حذف العناصر المرتبطة أيضًا (أسئلة/جلسات/ملفات تابعة)' : 'Also delete linked children (questions/sessions/files)'}
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-700">{isArabic ? 'كلمة مرورك الحالية' : 'Your current password'}</span>
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
            {isArabic ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={executing || !password}
            data-testid="hard-delete-execute"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-700 hover:bg-red-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {executing && <LoaderCircle className="w-4 h-4 animate-spin" />}
            {isArabic ? 'حذف نهائي' : 'Hard delete'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
