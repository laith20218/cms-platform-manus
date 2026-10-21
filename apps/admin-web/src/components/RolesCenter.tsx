/**
 * RolesCenter — institutional role & permissions management surface.
 *
 * Composition:
 *   • Page header with eyebrow + bilingual title + "Create role" primary action
 *   • Responsive role-card grid (1 col mobile · 2 cols tablet · 3 cols desktop)
 *   • Each card: status badge + system/custom badge · name (ar/en) · technical name
 *     (mono, teal) · description · admin-count + permission-count metrics · actions
 *     (toggle status · delete — delete only available for custom roles; system roles
 *     can toggle status but never delete; super_admin role cannot be toggled)
 *   • Skeleton loading placeholders (6 cards)
 *   • Empty state with KeyRound icon
 *
 * Design tokens (--cms-*) are applied via inline style; structural styling is pure Tailwind.
 */
import {
  KeyRound, LoaderCircle, Plus, ShieldCheck, ShieldOff, Trash2, UsersRound,
} from 'lucide-react';
import type { RoleRecord } from '../lib/api';

type Copy = Record<string, string>;

type RolesCenterProps = {
  copy: Copy;
  isArabic: boolean;
  roles: RoleRecord[];
  busy: boolean;
  loading: boolean;
  onCreate: () => void;
  onStatus: (role: RoleRecord, active: boolean) => void;
  onDelete: (role: RoleRecord) => void;
};

export function RolesCenter({ copy, isArabic, roles, busy, loading, onCreate, onStatus, onDelete }: RolesCenterProps) {
  return (
    <section className="space-y-6" dir={isArabic ? 'rtl' : 'ltr'}>
      {/* ===== Page header ===== */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className="p-2.5 rounded-xl shrink-0"
            style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
          >
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
              {isArabic ? 'سياسة الوصول' : 'Access policy'}
            </p>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              {copy.rolesTitle}
              <span
                className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold"
                style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}
              >
                {roles.length}
              </span>
            </h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {isArabic
                ? 'الأدوار النظامية محمية من الحذف؛ يمكن تعطيلها مؤقتاً. الأدوار المخصصة قابلة للحذف النهائي.'
                : 'System roles are protected from deletion but can be disabled. Custom roles can be permanently deleted.'}
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
          {copy.addRole}
        </button>
      </header>

      {/* ===== Role grid ===== */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <div
              key={idx}
              className="rounded-xl border p-5 space-y-3"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
            >
              <div className="flex justify-between">
                <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
                <div className="h-5 w-12 rounded-full bg-slate-100 animate-pulse" />
              </div>
              <div className="h-5 rounded bg-slate-100 animate-pulse w-2/3" />
              <div className="h-3 rounded bg-slate-100 animate-pulse w-1/2" />
              <div className="h-3 rounded bg-slate-100 animate-pulse w-full" />
              <div className="h-3 rounded bg-slate-100 animate-pulse w-3/4" />
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <div className="h-8 rounded bg-slate-100 animate-pulse" />
                <div className="h-8 rounded bg-slate-100 animate-pulse" />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="h-8 rounded bg-slate-100 animate-pulse" />
                <div className="h-8 rounded bg-slate-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : roles.length === 0 ? (
        <div
          className="rounded-xl border bg-white flex flex-col items-center justify-center text-center py-16 px-6"
          style={{ borderColor: 'var(--cms-line)' }}
        >
          <div className="p-3 rounded-full" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
            <KeyRound className="w-7 h-7" />
          </div>
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>{copy.noRoles}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {isArabic ? 'أنشئ أول دور مخصص لتعيين الصلاحيات لاحقاً.' : 'Create your first custom role to assign permissions later.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role) => {
            const isSuperAdmin = role.name === 'super_admin';
            const toggleDisabled = busy || isSuperAdmin;
            return (
              <article
                key={role.id}
                className={`rounded-xl border p-5 flex flex-col transition-all hover:shadow-md ${role.isActive ? '' : 'opacity-75'}`}
                style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
              >
                {/* Top row: status + system/custom badge */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${
                      role.isActive
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : 'text-red-700 bg-red-50 border-red-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${role.isActive ? 'bg-emerald-500' : 'bg-red-500'} opacity-80`} />
                    {role.isActive ? copy.active : copy.disabled}
                  </span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                    style={{
                      borderColor: role.isSystem ? 'var(--cms-teal-100)' : 'var(--cms-line)',
                      color: role.isSystem ? 'var(--cms-teal-700)' : 'var(--cms-text-soft)',
                      background: role.isSystem ? 'var(--cms-teal-50)' : 'var(--cms-ivory-100)',
                    }}
                  >
                    {role.isSystem ? copy.system : copy.custom}
                  </span>
                </div>

                {/* Title + technical name */}
                <h3 className="text-lg font-bold leading-snug" style={{ color: 'var(--cms-text)' }}>
                  {isArabic ? role.nameAr : role.name}
                </h3>
                <code
                  className="inline-block mt-1 text-[11px] font-mono"
                  style={{ color: 'var(--cms-teal-700)' }}
                >
                  {role.name}
                </code>

                {/* Description */}
                <p className="mt-3 text-xs leading-relaxed flex-1" style={{ color: 'var(--cms-text-soft)' }}>
                  {role.description || (isArabic ? 'دور بلا وصف إضافي.' : 'Role without an additional description.')}
                </p>

                {/* Metrics */}
                <div
                  className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t"
                  style={{ borderColor: 'var(--cms-line)' }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}
                    >
                      <UsersRound className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold leading-none" style={{ color: 'var(--cms-text)' }}>{role.adminCount}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--cms-text-muted)' }}>{copy.adminsCount}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold leading-none" style={{ color: 'var(--cms-text)' }}>{role.permissionCount}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--cms-text-muted)' }}>{copy.permissions}</div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => onStatus(role, !role.isActive)}
                    disabled={toggleDisabled}
                    title={isSuperAdmin ? (isArabic ? 'لا يمكن تعطيل دور المدير العام' : 'Super-admin role cannot be disabled') : undefined}
                    className={`inline-flex items-center justify-center gap-1.5 flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      role.isActive
                        ? 'text-amber-700 border-amber-200 hover:bg-amber-50'
                        : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    {busy && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                    {!busy && (role.isActive ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />)}
                    {role.isActive ? copy.deactivate : copy.activate}
                  </button>
                  {!role.isSystem && (
                    <button
                      type="button"
                      onClick={() => onDelete(role)}
                      disabled={busy}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium text-red-700 border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {copy.delete}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
