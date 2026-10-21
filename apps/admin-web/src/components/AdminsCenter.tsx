/**
 * AdminsCenter — institutional administrator management surface.
 *
 * Composition:
 *   • Page header with eyebrow + bilingual title + live count badge + primary action
 *   • Filter bar (search · role · status · clear) inside a bordered card
 *   • Responsive table (overflow-x-auto) with avatar + identity (name / email / phone /
 *     registered date) + role badge + scope badge + status badge + last sign-in +
 *     row actions (view · edit · reset password · enable / disable · delete)
 *   • Skeleton loading rows (shimmer placeholders mirroring the table layout)
 *   • Empty state with two-tier message and clear-filters CTA
 *   • DialogLayer (exported separately, rendered by App.tsx) handling all admin & role
 *     dialogs: create-admin · edit-admin · reset-password · delete-admin · create-role
 *
 * Design tokens (--cms-*) are applied via inline style; structural styling is pure Tailwind.
 */
import { FormEvent } from 'react';
import {
  CircleAlert, Edit3, Eye, KeyRound, LoaderCircle, LockKeyhole,
  Plus, Search, ShieldCheck, ShieldOff, Trash2, UsersRound, X,
} from 'lucide-react';
import type { AdminRecord, RoleRecord } from '../lib/api';
import { ScopePicker } from './ScopePicker';

type Copy = Record<string, string>;

type AdminsCenterProps = {
  copy: Copy;
  isArabic: boolean;
  admins: AdminRecord[];
  roles: RoleRecord[];
  total: number;
  query: string;
  roleFilter: string;
  statusFilter: string;
  busy: boolean;
  loading: boolean;
  scopeText: (admin: AdminRecord) => string;
  setQuery: (value: string) => void;
  setRoleFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  clearFilters: () => void;
  onCreate: () => void;
  onEdit: (admin: AdminRecord) => void;
  onReset: (admin: AdminRecord) => void;
  onDelete: (admin: AdminRecord) => void;
  onStatus: (admin: AdminRecord, active: boolean) => void;
};

type AdminForm = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  roleId: string;
  // P1-04: academic scope (cascading selectors)
  scopeUniversityId: string;
  scopeCollegeId: string;
  scopeYearId: string;
  scopeSubjectId: string;
};
type RoleForm = { name: string; nameAr: string; description: string };
type AdminDialog =
  | { kind: 'create-admin' }
  | { kind: 'edit-admin'; admin: AdminRecord }
  | { kind: 'reset-password'; admin: AdminRecord }
  | { kind: 'delete-admin'; admin: AdminRecord }
  | { kind: 'create-role' };

type DialogLayerProps = {
  copy: Copy;
  isArabic: boolean;
  token: string;  // P1-04: needed by ScopePicker to load hierarchy
  dialog: AdminDialog;
  roles: RoleRecord[];
  adminForm: AdminForm;
  selectedRole?: RoleRecord;
  roleForm: RoleForm;
  busy: boolean;
  onClose: () => void;
  onAdminForm: (form: AdminForm) => void;
  onRoleForm: (form: RoleForm) => void;
  onSubmitAdmin: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitReset: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitDelete: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitRole: (event: FormEvent<HTMLFormElement>) => void;
};

const dateLabel = (value: string | null | undefined, isArabic: boolean) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return '—';
  }
};

export function AdminsCenter(props: AdminsCenterProps) {
  const {
    copy, isArabic, admins, roles, total, query, roleFilter, statusFilter,
    busy, loading, scopeText, setQuery, setRoleFilter, setStatusFilter,
    clearFilters, onCreate, onEdit, onReset, onDelete, onStatus,
  } = props;

  const filtersActive = Boolean(query || roleFilter || statusFilter !== 'all');
  const inputClass = 'w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors';

  return (
    <section className="space-y-6" dir={isArabic ? 'rtl' : 'ltr'}>
      {/* ===== Page header ===== */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className="p-2.5 rounded-xl shrink-0"
            style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
          >
            <UsersRound className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
              {isArabic ? 'الإدارة المركزية' : 'Central administration'}
            </p>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              {copy.adminList}
              <span
                className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold"
                style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}
              >
                {total}
              </span>
            </h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {isArabic
                ? 'تُدار المدراء والصلاحيات والنطاقات الأكاديمية من هذا المركز المؤسسي.'
                : 'Manage administrators, their roles and academic scopes from this institutional center.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors hover:opacity-90"
          style={{ background: 'var(--cms-teal-700)' }}
        >
          <Plus className="w-4 h-4" />
          {copy.addAdmin}
        </button>
      </header>

      {/* ===== Filter bar ===== */}
      <div
        className="flex flex-wrap gap-3 items-center p-4 rounded-xl border"
        style={{ background: 'var(--cms-surface)', borderColor: 'var(--cms-line)' }}
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.search}
            className={`${inputClass} pr-10`}
            style={{ borderColor: 'var(--cms-line-strong)' }}
          />
        </div>
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className={inputClass}
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <option value="">{copy.role}: {copy.all}</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>{isArabic ? role.nameAr : role.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className={inputClass}
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <option value="all">{copy.status}: {copy.all}</option>
          <option value="active">{copy.active}</option>
          <option value="disabled">{copy.disabled}</option>
        </select>
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors hover:bg-slate-50"
            style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
          >
            <X className="w-4 h-4" />
            {copy.clear}
          </button>
        )}
      </div>

      {/* ===== Admins table ===== */}
      {loading ? (
        <div className="rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
          <div className="space-y-1 p-2">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="flex items-center gap-4 px-3 py-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-3.5 rounded bg-slate-100 animate-pulse w-1/3" />
                  <div className="h-3 rounded bg-slate-100 animate-pulse w-1/2" />
                </div>
                <div className="h-6 w-20 rounded-full bg-slate-100 animate-pulse shrink-0" />
                <div className="h-6 w-24 rounded-full bg-slate-100 animate-pulse shrink-0" />
                <div className="h-6 w-16 rounded-full bg-slate-100 animate-pulse shrink-0" />
                <div className="h-3 w-24 rounded bg-slate-100 animate-pulse shrink-0" />
                <div className="flex gap-1 shrink-0">
                  <div className="w-7 h-7 rounded-md bg-slate-100 animate-pulse" />
                  <div className="w-7 h-7 rounded-md bg-slate-100 animate-pulse" />
                  <div className="w-7 h-7 rounded-md bg-slate-100 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : admins.length === 0 ? (
        <div
          className="rounded-xl border bg-white flex flex-col items-center justify-center text-center py-16 px-6"
          style={{ borderColor: 'var(--cms-line)' }}
        >
          <div className="p-3 rounded-full" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
            <UsersRound className="w-7 h-7" />
          </div>
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>{copy.noAdmins}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {isArabic ? 'عدّل عوامل التصفية أو أضف مديراً جديداً.' : 'Adjust filters or add a new administrator.'}
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-slate-50"
              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
            >
              <X className="w-3.5 h-3.5" />
              {copy.clear}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
              <tr>
                <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'المدير' : 'Administrator'}</th>
                <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{copy.role}</th>
                <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{copy.scope}</th>
                <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{copy.status}</th>
                <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{copy.lastLogin}</th>
                <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider"><span className="sr-only">{copy.actions}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--cms-line)' }}>
              {admins.map((admin) => {
                const active = admin.status === 'active';
                return (
                  <tr key={admin.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Identity */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${active ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-600'}`}
                        >
                          {admin.fullName?.[0]?.toUpperCase() ?? 'A'}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate" style={{ color: 'var(--cms-text)' }}>{admin.fullName}</div>
                          <div className="text-xs truncate" style={{ color: 'var(--cms-text-muted)' }}>{admin.email}</div>
                          {admin.phone && (
                            <div className="text-xs truncate" style={{ color: 'var(--cms-text-muted)' }}>
                              {isArabic ? `هاتف: ${admin.phone}` : `Phone: ${admin.phone}`}
                            </div>
                          )}
                          <div className="text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                            {isArabic ? `أُنشئ في ${dateLabel(admin.createdAt, isArabic)}` : `Created ${dateLabel(admin.createdAt, isArabic)}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Role badge */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                        style={{ borderColor: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)', background: 'var(--cms-teal-50)' }}
                      >
                        {isArabic ? admin.roleNameAr : admin.roleName}
                      </span>
                    </td>
                    {/* Scope badge */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                        style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)', background: 'var(--cms-ivory-100)' }}
                      >
                        {scopeText(admin)}
                      </span>
                    </td>
                    {/* Status badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${
                          active
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-red-700 bg-red-50 border-red-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-red-500'} opacity-80`} />
                        {active ? copy.active : copy.disabled}
                      </span>
                    </td>
                    {/* Last login */}
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                      {dateLabel(admin.lastLogin, isArabic)}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title={copy.view}
                          onClick={() => onEdit(admin)}
                          className="p-1.5 rounded-md transition-colors hover:bg-teal-50"
                          style={{ color: 'var(--cms-text-muted)' }}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title={copy.edit}
                          onClick={() => onEdit(admin)}
                          className="p-1.5 rounded-md transition-colors hover:bg-teal-50"
                          style={{ color: 'var(--cms-text-muted)' }}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title={copy.reset}
                          onClick={() => onReset(admin)}
                          className="p-1.5 rounded-md transition-colors hover:bg-teal-50"
                          style={{ color: 'var(--cms-text-muted)' }}
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title={active ? copy.deactivate : copy.activate}
                          disabled={busy}
                          onClick={() => onStatus(admin, !active)}
                          className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${active ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                        >
                          {active ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          title={copy.delete}
                          onClick={() => onDelete(admin)}
                          className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * DialogLayer — modal renderer for all administrator & role dialogs.
 *
 * Rendered by App.tsx whenever the shared `dialog` state is non-null.
 * Handles: create-admin · edit-admin · reset-password · delete-admin · create-role.
 */
export function DialogLayer(props: DialogLayerProps) {
  const {
    copy, isArabic, token, dialog, roles, adminForm, selectedRole, roleForm, busy,
    onClose, onAdminForm, onRoleForm, onSubmitAdmin, onSubmitReset,
    onSubmitDelete, onSubmitRole,
  } = props;

  const title =
    dialog.kind === 'create-admin' ? copy.newAdmin
    : dialog.kind === 'edit-admin' ? copy.updateAdmin
    : dialog.kind === 'reset-password' ? copy.resetTitle
    : dialog.kind === 'delete-admin' ? copy.deleteTitle
    : copy.addRole;

  const isDanger = dialog.kind === 'delete-admin';
  const labelClass = 'block text-xs font-semibold mb-1.5';
  const fieldClass = 'w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="presentation"
      onMouseDown={onClose}
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      <section
        className="bg-white rounded-xl max-w-xl w-full shadow-xl max-h-[calc(100vh-40px)] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Dialog header */}
        <div
          className="flex items-start justify-between gap-4 p-5 border-b sticky top-0 z-10"
          style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
        >
          <div className="flex items-start gap-3">
            <div
              className="p-2 rounded-lg shrink-0"
              style={
                isDanger
                  ? { background: 'var(--cms-danger-50)', color: 'var(--cms-danger)' }
                  : { background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }
              }
            >
              {dialog.kind === 'create-role' ? <KeyRound className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                {isArabic ? 'إجراء إداري' : 'Administrative action'}
              </p>
              <h2 className="text-lg font-bold" style={{ color: 'var(--cms-text)' }}>{title}</h2>
            </div>
          </div>
          <button
            type="button"
            aria-label={isArabic ? 'إغلاق' : 'Close dialog'}
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-md transition-colors hover:bg-slate-100 disabled:opacity-50"
            style={{ color: 'var(--cms-text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ===== Create / Edit admin ===== */}
        {(dialog.kind === 'create-admin' || dialog.kind === 'edit-admin') && (
          <form onSubmit={onSubmitAdmin} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>{copy.fullName}</label>
                <input
                  required
                  value={adminForm.fullName}
                  onChange={(event) => onAdminForm({ ...adminForm, fullName: event.target.value })}
                  className={fieldClass}
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>{copy.email}</label>
                <input
                  required
                  type="email"
                  value={adminForm.email}
                  onChange={(event) => onAdminForm({ ...adminForm, email: event.target.value })}
                  className={fieldClass}
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>{copy.phone}</label>
                <input
                  value={adminForm.phone}
                  onChange={(event) => onAdminForm({ ...adminForm, phone: event.target.value })}
                  className={fieldClass}
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>{copy.role}</label>
                <select
                  required
                  value={adminForm.roleId}
                  onChange={(event) => onAdminForm({ ...adminForm, roleId: event.target.value })}
                  className={fieldClass}
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                >
                  {roles.filter((role) => role.isActive).map((role) => (
                    <option key={role.id} value={role.id}>{isArabic ? role.nameAr : role.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {dialog.kind === 'create-admin' && (
              <div>
                <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>{copy.initialPassword}</label>
                <input
                  required
                  minLength={12}
                  type="password"
                  value={adminForm.password}
                  onChange={(event) => onAdminForm({ ...adminForm, password: event.target.value })}
                  className={fieldClass}
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>{copy.passwordReminder}</p>
              </div>
            )}
            {selectedRole && selectedRole.name !== 'super_admin' && (
              <div className="rounded-lg border p-3 space-y-2" style={{ background: 'var(--cms-ivory-100)', borderColor: 'var(--cms-line)' }}>
                <div className="flex items-center gap-2">
                  <LockKeyhole className="w-4 h-4 shrink-0" style={{ color: 'var(--cms-teal-600)' }} />
                  <strong className="text-xs font-semibold" style={{ color: 'var(--cms-text)' }}>{copy.scopeLabel}</strong>
                </div>
                <ScopePicker
                  token={token}
                  isArabic={isArabic}
                  value={{
                    universityId: adminForm.scopeUniversityId || '',
                    collegeId: adminForm.scopeCollegeId || '',
                    yearId: adminForm.scopeYearId || '',
                    subjectId: adminForm.scopeSubjectId || '',
                  }}
                  onChange={(scope) => onAdminForm({
                    ...adminForm,
                    scopeUniversityId: scope.universityId,
                    scopeCollegeId: scope.collegeId,
                    scopeYearId: scope.yearId,
                    scopeSubjectId: scope.subjectId,
                  })}
                  existingNames={dialog.kind === 'edit-admin' ? {
                    universityName: dialog.admin.scopeUniversityName,
                    collegeName: dialog.admin.scopeCollegeName,
                    yearName: dialog.admin.scopeYearName,
                    subjectName: dialog.admin.scopeSubjectName,
                  } : undefined}
                />
              </div>
            )}
            <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: 'var(--cms-line)' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-slate-50 disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
              >
                {copy.cancel}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--cms-teal-700)' }}
              >
                {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
                {copy.save}
              </button>
            </div>
          </form>
        )}

        {/* ===== Reset password ===== */}
        {dialog.kind === 'reset-password' && (
          <form onSubmit={onSubmitReset} className="p-5 space-y-4">
            <div
              className="rounded-lg border p-3"
              style={{ background: 'var(--cms-ivory-100)', borderColor: 'var(--cms-line)' }}
            >
              <p className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{dialog.admin.fullName}</p>
              <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{dialog.admin.email}</p>
            </div>
            <p className="text-sm" style={{ color: 'var(--cms-text-soft)' }}>
              {isArabic
                ? `سيتم إبطال جميع جلسات ${dialog.admin.fullName} فورًا.`
                : `All ${dialog.admin.fullName}'s live sessions will be invalidated immediately.`}
            </p>
            <div>
              <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>{copy.newPassword}</label>
              <input
                required
                name="newPassword"
                minLength={12}
                type="password"
                autoComplete="new-password"
                className={fieldClass}
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: 'var(--cms-line)' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-slate-50 disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
              >
                {copy.cancel}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--cms-teal-700)' }}
              >
                {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
                {copy.reset}
              </button>
            </div>
          </form>
        )}

        {/* ===== Delete admin ===== */}
        {dialog.kind === 'delete-admin' && (
          <form onSubmit={onSubmitDelete} className="p-5 space-y-4">
            <div
              className="flex items-start gap-2 rounded-lg border p-3 text-xs"
              style={{ background: 'var(--cms-danger-50)', borderColor: 'var(--cms-danger)', color: 'var(--cms-danger)' }}
            >
              <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{copy.deleteText}</p>
            </div>
            <div
              className="rounded-lg border p-3"
              style={{ background: 'var(--cms-ivory-100)', borderColor: 'var(--cms-line)', borderInlineStart: '3px solid var(--cms-danger)' }}
            >
              <p className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{dialog.admin.fullName}</p>
              <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{dialog.admin.email}</p>
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>{copy.currentPassword}</label>
              <input
                required
                name="currentSuperAdminPassword"
                type="password"
                autoComplete="current-password"
                className={fieldClass}
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: 'var(--cms-line)' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-slate-50 disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
              >
                {copy.cancel}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--cms-danger)' }}
              >
                {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
                {copy.deleteConfirm}
              </button>
            </div>
          </form>
        )}

        {/* ===== Create role ===== */}
        {dialog.kind === 'create-role' && (
          <form onSubmit={onSubmitRole} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>{copy.roleName}</label>
                <input
                  required
                  value={roleForm.name}
                  pattern="[A-Za-z0-9_]{3,50}"
                  onChange={(event) => onRoleForm({ ...roleForm, name: event.target.value })}
                  placeholder="content_reviewer"
                  className={`${fieldClass} font-mono`}
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                  {isArabic ? 'أحرف وأرقام وشرطة سفلية فقط، من 3 إلى 50 رمزًا.' : 'Letters, numbers and underscores only; 3–50 characters.'}
                </p>
              </div>
              <div>
                <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>{copy.roleNameAr}</label>
                <input
                  required
                  value={roleForm.nameAr}
                  onChange={(event) => onRoleForm({ ...roleForm, nameAr: event.target.value })}
                  className={fieldClass}
                  style={{ borderColor: 'var(--cms-line-strong)' }}
                />
              </div>
            </div>
            <div>
              <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>{copy.description}</label>
              <textarea
                value={roleForm.description}
                onChange={(event) => onRoleForm({ ...roleForm, description: event.target.value })}
                rows={3}
                className={fieldClass}
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </div>
            <div
              className="flex items-start gap-2 rounded-lg border p-3 text-xs"
              style={{ background: 'var(--cms-ivory-100)', borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}
            >
              <KeyRound className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--cms-teal-600)' }} />
              <p>{isArabic ? 'ينشأ الدور بلا صلاحيات. أضف الصلاحيات قبل تعيينه لأي مدير.' : 'The role begins with no permissions. Add grants before assigning it.'}</p>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: 'var(--cms-line)' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-slate-50 disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
              >
                {copy.cancel}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--cms-teal-700)' }}
              >
                {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}
                {copy.create}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
