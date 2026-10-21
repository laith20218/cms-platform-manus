/**
 * PermissionMatrixEditor — grid editor for role permission grants.
 *
 * Composition:
 *   • Resources × Actions matrix (toggle each cell)
 *   • Scope selector per resource (own | all)
 *   • Dirty indicator + Save / Reset buttons
 *   • System roles are read-only (badge + disabled)
 *   • Loading skeleton + empty state
 *
 * Data source:
 *   GET  /api/v1/admin/roles/{id}/permissions  → List<RolePermissionGrantDto>
 *   PUT  /api/v1/admin/roles/{id}/permissions   body: { permissions: [{ resource, actions, scope }] }
 *
 * Resources + Actions are mirrored from the backend Resources/Actions constants
 * (CMS.Application.Interfaces.IPermissionService).
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, LoaderCircle, Lock, Save, X, ShieldCheck } from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';

type Props = {
  token: string;
  isArabic: boolean;
  roleId: string;
  roleName: string;
  isSystemRole: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

type Grant = {
  resource: string;
  actions: string[];
  scope: string; // 'own' | 'all'
};

const RESOURCES = [
  { value: 'universities', ar: 'الجامعات', en: 'Universities' },
  { value: 'colleges', ar: 'الكليات', en: 'Colleges' },
  { value: 'years', ar: 'السنوات', en: 'Years' },
  { value: 'semesters', ar: 'الفصول', en: 'Semesters' },
  { value: 'subjects', ar: 'المواد', en: 'Subjects' },
  { value: 'lectures', ar: 'المحاضرات', en: 'Lectures' },
  { value: 'questions', ar: 'الأسئلة', en: 'Questions' },
  { value: 'exams', ar: 'الاختبارات', en: 'Exams' },
  { value: 'library', ar: 'المكتبة', en: 'Library' },
  { value: 'videos', ar: 'الفيديوهات', en: 'Videos' },
  { value: 'codes', ar: 'الأكواد', en: 'Codes' },
  { value: 'students', ar: 'الطلاب', en: 'Students' },
  { value: 'admins', ar: 'المدراء', en: 'Admins' },
  { value: 'roles', ar: 'الأدوار', en: 'Roles' },
  { value: 'notifications', ar: 'الإشعارات', en: 'Notifications' },
  { value: 'announcements', ar: 'الإعلانات', en: 'Announcements' },
  { value: 'reports', ar: 'البلاغات', en: 'Reports' },
  { value: 'settings', ar: 'الإعدادات', en: 'Settings' },
  { value: 'logs', ar: 'السجلات', en: 'Logs' },
];

const ACTIONS = [
  { value: 'view', ar: 'عرض', en: 'View' },
  { value: 'create', ar: 'إنشاء', en: 'Create' },
  { value: 'edit', ar: 'تعديل', en: 'Edit' },
  { value: 'delete', ar: 'حذف', en: 'Delete' },
  { value: 'export', ar: 'تصدير', en: 'Export' },
  { value: 'import', ar: 'استيراد', en: 'Import' },
];

const SCOPES = [
  { value: 'own', ar: 'النطاق الخاص', en: 'Own scope' },
  { value: 'all', ar: 'كل النطاقات', en: 'All scope' },
];

export function PermissionMatrixEditor({ token, isArabic, roleId, roleName, isSystemRole, onClose, onError, onNotice }: Props) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [original, setOriginal] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token || !roleId) return;
    setLoading(true);
    apiRequest<Grant[]>(`/api/v1/admin/roles/${roleId}/permissions`, token)
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setGrants(list);
        setOriginal(list);
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError ? err.message : isArabic ? 'تعذّر تحميل الصلاحيات' : 'Could not load permissions';
        onError(msg);
      })
      .finally(() => setLoading(false));
  }, [token, roleId, isArabic, onError]);

  const isDirty = useMemo(() => JSON.stringify(grants) !== JSON.stringify(original), [grants, original]);

  const getActions = (resource: string): string[] => {
    const g = grants.find(x => x.resource === resource);
    return g?.actions ?? [];
  };

  const getScope = (resource: string): string => {
    const g = grants.find(x => x.resource === resource);
    return g?.scope ?? 'own';
  };

  const toggleAction = (resource: string, action: string) => {
    if (isSystemRole) return;
    setGrants(prev => {
      const existing = prev.find(x => x.resource === resource);
      if (existing) {
        const has = existing.actions.includes(action);
        const newActions = has ? existing.actions.filter(a => a !== action) : [...existing.actions, action];
        // If removing all actions, drop the grant entirely
        if (newActions.length === 0) return prev.filter(x => x.resource !== resource);
        return prev.map(x => x.resource === resource ? { ...x, actions: newActions } : x);
      }
      return [...prev, { resource, actions: [action], scope: 'own' }];
    });
  };

  const setScope = (resource: string, scope: string) => {
    if (isSystemRole) return;
    setGrants(prev => {
      const existing = prev.find(x => x.resource === resource);
      if (existing) return prev.map(x => x.resource === resource ? { ...x, scope } : x);
      // Can't set scope without any actions — ignore
      return prev;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest<void>(`/api/v1/admin/roles/${roleId}/permissions`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: grants }),
      });
      setOriginal(grants);
      onNotice(isArabic ? 'تم حفظ الصلاحيات' : 'Permissions saved');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : isArabic ? 'فشل الحفظ' : 'Save failed';
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setGrants(original);

  const t = isArabic
    ? {
        title: 'مصفوفة الصلاحيات', desc: 'حدد الصلاحيات لكل مورد. كل خلية قابلة للتبديل.',
        resource: 'المورد', scope: 'النطاق', actions: 'الإجراءات',
        save: 'حفظ', reset: 'تراجع', close: 'إغلاق', dirty: 'تغييرات غير محفوظة',
        systemLocked: 'دور نظام — للقراءة فقط', loading: 'جارٍ التحميل...',
        noGrants: 'لا توجد صلاحيات ممنوحة بعد',
      }
    : {
        title: 'Permission Matrix', desc: 'Toggle permissions per resource. Each cell is independent.',
        resource: 'Resource', scope: 'Scope', actions: 'Actions',
        save: 'Save', reset: 'Reset', close: 'Close', dirty: 'Unsaved changes',
        systemLocked: 'System role — read only', loading: 'Loading...',
        noGrants: 'No permissions granted yet',
      };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onMouseDown={() => !saving && onClose()} />
      <div
        className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-xl border shadow-2xl flex flex-col"
        style={{ background: 'var(--cms-surface)', borderColor: 'var(--cms-line)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} style={{ color: 'var(--cms-teal-700)' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.title}</h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
              {roleName}
            </span>
            {isSystemRole && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)', color: 'var(--cms-warning)' }}>
                <Lock size={10} />
                {t.systemLocked}
              </span>
            )}
          </div>
          <button onClick={() => !saving && onClose()} disabled={saving} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-50" aria-label={t.close}>
            <X size={18} style={{ color: 'var(--cms-text-muted)' }} />
          </button>
        </div>

        {/* Description + dirty indicator */}
        <div className="px-4 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--cms-line)' }}>
          <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t.desc}</p>
          {isDirty && !isSystemRole && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--cms-warning-50)', color: 'var(--cms-warning)' }}>
              {t.dirty}
            </span>
          )}
        </div>

        {/* Body — matrix */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderCircle size={20} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} />
              <span className="text-xs ml-2" style={{ color: 'var(--cms-text-muted)' }}>{t.loading}</span>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: 'var(--cms-ivory-100)' }}>
                  <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider border-b" style={{ color: 'var(--cms-text-muted)', borderColor: 'var(--cms-line)' }}>{t.resource}</th>
                  {ACTIONS.map(a => (
                    <th key={a.value} className="text-center py-2 px-2 font-semibold uppercase tracking-wider border-b" style={{ color: 'var(--cms-text-muted)', borderColor: 'var(--cms-line)' }}>
                      {isArabic ? a.ar : a.en}
                    </th>
                  ))}
                  <th className="text-center py-2 px-3 font-semibold uppercase tracking-wider border-b" style={{ color: 'var(--cms-text-muted)', borderColor: 'var(--cms-line)' }}>{t.scope}</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map(r => {
                  const actions = getActions(r.value);
                  const scope = getScope(r.value);
                  return (
                    <tr key={r.value} className="border-b last:border-0 hover:bg-slate-50/50" style={{ borderColor: 'var(--cms-line)' }}>
                      <td className="py-2 px-3 font-medium" style={{ color: 'var(--cms-text)' }}>
                        {isArabic ? r.ar : r.en}
                        <span className="block text-[10px] font-mono opacity-50">{r.value}</span>
                      </td>
                      {ACTIONS.map(a => {
                        const checked = actions.includes(a.value);
                        return (
                          <td key={a.value} className="text-center py-2 px-2">
                            <button
                              type="button"
                              onClick={() => toggleAction(r.value, a.value)}
                              disabled={isSystemRole || saving}
                              className="inline-flex items-center justify-center w-6 h-6 rounded border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              style={checked
                                ? { background: 'var(--cms-teal-700)', color: 'white', borderColor: 'var(--cms-teal-700)' }
                                : { background: 'var(--cms-surface)', color: 'var(--cms-text-muted)', borderColor: 'var(--cms-line)' }}
                              aria-label={`${r.value} ${a.value}`}
                            >
                              {checked && <Check size={13} />}
                            </button>
                          </td>
                        );
                      })}
                      <td className="text-center py-2 px-2">
                        <select
                          value={scope}
                          onChange={(e) => setScope(r.value, e.target.value)}
                          disabled={isSystemRole || saving || actions.length === 0}
                          className="h-7 rounded border text-[11px] px-1 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                        >
                          {SCOPES.map(s => <option key={s.value} value={s.value}>{isArabic ? s.ar : s.en}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer — actions */}
        <div className="flex items-center justify-between gap-3 p-4 border-t" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
          <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {grants.length} {isArabic ? 'صلاحية ممنوحة' : 'grants'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={reset}
              disabled={!isDirty || saving || isSystemRole}
              className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
            >
              {t.reset}
            </button>
            <button
              onClick={save}
              disabled={!isDirty || saving || isSystemRole}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--cms-teal-700)' }}
            >
              {saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
              {t.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
