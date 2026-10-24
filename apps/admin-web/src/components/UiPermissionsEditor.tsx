/**
 * UiPermissionsEditor — Push 3 / Track 3 advanced UI-permission editor for custom roles.
 *
 * Composition:
 *   • Modal shell (same pattern as PermissionMatrixEditor)
 *   • Configured / not-configured badge + registry version chip
 *   • Unconfigured empty state — carries the two-layers clarification (directive 2.1c):
 *     these keys only hide UI elements; the REAL security boundary is the API's
 *     [Authorize] policies + CanManageAsync. A role with view:codes but no classic
 *     codes:view permission still gets 403 from the backend.
 *   • 3-level tree: 12 views, each with its tabs + buttons as children
 *     (master checkbox = per-view bulk select)
 *   • Search (Arabic/English labels + raw keys)
 *   • 3 quick-start templates (readonly / contentEditor / codesManager)
 *   • Save (PUT) + Reset-to-full (DELETE → unconfigured = full access)
 *   • System roles (incl. super_admin) are read-only: 400 SYSTEM_ROLE_READONLY is
 *     answered by the API for writes; the UI disables every control up front.
 *
 * Data source:
 *   GET    /api/v1/admin/roles/{id}/ui-permissions
 *   PUT    /api/v1/admin/roles/{id}/ui-permissions   body: { allowedKeys: [...] }
 *   DELETE /api/v1/admin/roles/{id}/ui-permissions   → unconfigured (NULL = full access)
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, LoaderCircle, Lock, RotateCcw, Save, Search, SlidersHorizontal, X } from 'lucide-react';
import { ApiError, clearRoleUiPermissions, fetchRoleUiPermissions, replaceRoleUiPermissions } from '../lib/api';
import { ALL_UI_KEYS, ROLE_TEMPLATES, UI_PERMISSION_LABELS, UI_PERMISSIONS_TREE, VIEW_KEYS } from '../lib/uiPermissions';

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

type RoleState = { configured: boolean; allowedKeys: string[] | null };

export function UiPermissionsEditor({ token, isArabic, roleId, roleName, isSystemRole, onClose, onError, onNotice }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roleState, setRoleState] = useState<RoleState>({ configured: false, allowedKeys: null });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!token || !roleId) return;
    setLoading(true);
    fetchRoleUiPermissions(token, roleId)
      .then((state) => {
        setRoleState({ configured: state.configured, allowedKeys: state.allowedKeys });
        setSelection(new Set(state.allowedKeys ?? []));
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : isArabic ? 'تعذّر تحميل صلاحيات الواجهة' : 'Could not load UI permissions';
        onError(message);
      })
      .finally(() => setLoading(false));
  }, [token, roleId, isArabic, onError]);

  const dirty = useMemo(
    () => JSON.stringify([...selection].sort()) !== JSON.stringify((roleState.allowedKeys ?? []).slice().sort()),
    [selection, roleState],
  );

  const t = isArabic
    ? {
        title: 'صلاحيات الواجهة المتقدمة',
        desc: 'حدد ما يظهر للمدراء المعيّنين لهذا الدور في لوحة الإدارة (62 مفتاحاً: مشاهد + أقسام + أزرار).',
        close: 'إغلاق',
        loading: 'جارٍ التحميل...',
        configured: 'مُهيأ',
        notConfigured: 'غير مُهيأ — وصول كامل',
        systemLocked: 'دور نظام — للقراءة فقط (يشمل المدير العام)',
        dirty: 'تغييرات غير محفوظة',
        save: 'حفظ المفاتيح',
        resetToFull: 'إعادة إلى الوصول الكامل',
        selected: 'مفاتيح محددة',
        searchPlaceholder: 'ابحث بالاسم أو المفتاح… (مثال: btn:codes.export)',
        noMatches: 'لا توجد مفاتيح مطابقة للبحث',
        templates: 'قوالب بداية سريعة',
        unconfiguredTitle: 'هذا الدور غير مُهيأ بعد',
        unconfiguredBody:
          'NULL يعني وصولاً كاملاً: كل المشاهد والأقسام والأزرار تظهر للمدراء المعيّنين — دون أي تغيير في السلوك. أول حفظ يثبّت القائمة؛ بعدها تظهر للمدير فقط المفاتيح المحددة. ملاحظة أمنية (طبقتان): هذه المفاتيح تُخفي عناصر الواجهة فقط — الحماية الحقيقية تبقى في سياسات الـ API ([Authorize] + فحوصات النطاق). مفتاح view:codes لا يمنح صلاحية codes:view الكلاسيكية.',
        emptyTree: 'لا توجد أزرار أو أقسام تحت هذا المشهد.',
        views: 'المشاهد',
        saveOk: 'تم حفظ مفاتيح صلاحيات الواجهة',
        resetOk: 'أُعيد الدور إلى غير مُهيأ (وصول كامل)',
        saveFail: 'فشل الحفظ',
        confirmReset: 'إعادة الدور إلى غير مُهيأ (NULL = وصول كامل لكل المدراء المعيّنين)؟',
      }
    : {
        title: 'Advanced UI Permissions',
        desc: 'Choose what assigned administrators see in the console (62 keys: views + tabs + buttons).',
        close: 'Close',
        loading: 'Loading...',
        configured: 'Configured',
        notConfigured: 'Not configured — full access',
        systemLocked: 'System role — read only (includes super_admin)',
        dirty: 'Unsaved changes',
        save: 'Save keys',
        resetToFull: 'Reset to full access',
        selected: 'keys selected',
        searchPlaceholder: 'Search by label or key… (e.g. btn:codes.export)',
        noMatches: 'No keys match the search',
        templates: 'Quick-start templates',
        unconfiguredTitle: 'This role is not configured yet',
        unconfiguredBody:
          'NULL means full access: every view, tab and button shows for assigned administrators — zero behavior change. The first save pins the list; after that only the selected keys render. Security note (two layers): these keys only hide UI elements — the REAL boundary stays in the API policies ([Authorize] + scope checks). view:codes never grants the classic codes:view permission.',
        emptyTree: 'No buttons or tabs under this view.',
        views: 'Views',
        saveOk: 'UI permission keys saved',
        resetOk: 'Role reset to unconfigured (full access)',
        saveFail: 'Save failed',
        confirmReset: 'Reset the role to unconfigured (NULL = full access for every assigned administrator)?',
      };

  const normalizedSearch = search.trim().toLowerCase();
  const matches = (key: string) => {
    if (!normalizedSearch) return true;
    const label = UI_PERMISSION_LABELS[key];
    return (
      key.toLowerCase().includes(normalizedSearch) ||
      (label ? (isArabic ? label.ar : label.en).toLowerCase().includes(normalizedSearch) : false)
    );
  };

  const toggleKey = (key: string) => {
    if (isSystemRole || loading || saving) return;
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleView = (viewKey: string) => {
    if (isSystemRole || loading || saving) return;
    const family = [viewKey, ...UI_PERMISSIONS_TREE[viewKey]];
    const allSelected = family.every((key) => selection.has(key));
    setSelection((previous) => {
      const next = new Set(previous);
      for (const key of family) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };

  const applyTemplate = (keys: readonly string[]) => {
    if (isSystemRole || loading || saving) return;
    setSelection(new Set(keys));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Send in registry order — the server re-validates, re-orders and de-duplicates.
      const ordered = ALL_UI_KEYS.filter((key) => selection.has(key));
      await replaceRoleUiPermissions(token, roleId, ordered);
      setRoleState({ configured: true, allowedKeys: ordered });
      onNotice(t.saveOk);
    } catch (error: unknown) {
      const message = error instanceof ApiError ? error.message : t.saveFail;
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  const resetToFull = async () => {
    if (!window.confirm(t.confirmReset)) return;
    setSaving(true);
    try {
      await clearRoleUiPermissions(token, roleId);
      setRoleState({ configured: false, allowedKeys: null });
      setSelection(new Set());
      onNotice(t.resetOk);
    } catch (error: unknown) {
      const message = error instanceof ApiError ? error.message : t.saveFail;
      onError(message);
    } finally {
      setSaving(false);
    }
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
          <div className="flex items-center gap-2 flex-wrap">
            <SlidersHorizontal size={18} style={{ color: 'var(--cms-teal-700)' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.title}</h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
              {roleName}
            </span>
            <span
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold"
              style={
                roleState.configured
                  ? { borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }
                  : { borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)', color: 'var(--cms-warning)' }
              }
            >
              {roleState.configured ? <Check size={10} /> : null}
              {roleState.configured ? t.configured : t.notConfigured}
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
        <div className="px-4 py-2 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--cms-line)' }}>
          <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t.desc}</p>
          {dirty && !isSystemRole && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--cms-warning-50)', color: 'var(--cms-warning)' }}>
              {t.dirty}
            </span>
          )}
        </div>

        {/* 2.1c empty state: unconfigured = full access + the two-layers clarification */}
        {!loading && !roleState.configured && !isSystemRole && (
          <div className="mx-4 mt-3 rounded-lg border px-4 py-3" style={{ borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--cms-warning)' }}>{t.unconfiguredTitle}</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--cms-text-soft)' }}>{t.unconfiguredBody}</p>
          </div>
        )}

        {/* Search + templates */}
        <div className="px-4 py-3 border-b flex flex-col gap-2" style={{ borderColor: 'var(--cms-line)' }}>
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
            <Search size={15} style={{ color: 'var(--cms-text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t.searchPlaceholder}
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: 'var(--cms-text)' }}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t.templates}:</span>
            {ROLE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                disabled={isSystemRole || loading || saving}
                onClick={() => applyTemplate(template.keys)}
                className="px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)', background: 'var(--cms-ivory-50)' }}
              >
                {isArabic ? template.ar : template.en}
              </button>
            ))}
          </div>
        </div>

        {/* Body — tree */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderCircle size={20} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} />
              <span className="text-xs ml-2" style={{ color: 'var(--cms-text-muted)' }}>{t.loading}</span>
            </div>
          ) : (
            <div className="space-y-4">
              {VIEW_KEYS.map((viewKey) => {
                const children = UI_PERMISSIONS_TREE[viewKey];
                const visibleChildren = children.filter(matches);
                const viewMatches = matches(viewKey);
                if (!viewMatches && visibleChildren.length === 0) return null;
                const family = [viewKey, ...children];
                const allSelected = family.every((key) => selection.has(key));
                return (
                  <section key={viewKey} className="rounded-xl border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
                    <div className="flex items-center gap-3 px-4 py-3 border-b rounded-t-xl" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <button
                        type="button"
                        onClick={() => toggleView(viewKey)}
                        disabled={isSystemRole || saving}
                        aria-label={viewKey}
                        className="inline-flex items-center justify-center w-6 h-6 rounded border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={allSelected
                          ? { background: 'var(--cms-teal-700)', color: 'white', borderColor: 'var(--cms-teal-700)' }
                          : { background: 'var(--cms-surface)', color: 'var(--cms-text-muted)', borderColor: 'var(--cms-line)' }}
                      >
                        {allSelected && <Check size={13} />}
                      </button>
                      <div>
                        <div className="text-sm font-bold" style={{ color: 'var(--cms-text)' }}>
                          {isArabic ? UI_PERMISSION_LABELS[viewKey].ar : UI_PERMISSION_LABELS[viewKey].en}
                        </div>
                        <code className="text-[10px] font-mono" style={{ color: 'var(--cms-teal-700)' }}>{viewKey}</code>
                      </div>
                    </div>
                    <div className="p-4">
                      {visibleChildren.length === 0 ? (
                        <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                          {children.length === 0 ? t.emptyTree : t.noMatches}
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {visibleChildren.map((key) => {
                            const checked = selection.has(key);
                            const label = UI_PERMISSION_LABELS[key];
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => toggleKey(key)}
                                disabled={isSystemRole || saving}
                                className="flex items-start gap-2 text-start px-3 py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                style={checked
                                  ? { borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)' }
                                  : { borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
                              >
                                <span
                                  className="inline-flex items-center justify-center w-5 h-5 mt-0.5 rounded border shrink-0"
                                  style={checked
                                    ? { background: 'var(--cms-teal-700)', color: 'white', borderColor: 'var(--cms-teal-700)' }
                                    : { background: 'var(--cms-surface)', color: 'var(--cms-text-muted)', borderColor: 'var(--cms-line)' }}
                                >
                                  {checked && <Check size={12} />}
                                </span>
                                <span>
                                  <span className="block text-xs font-medium" style={{ color: 'var(--cms-text)' }}>
                                    {isArabic ? label.ar : label.en}
                                  </span>
                                  <code className="block text-[10px] font-mono" style={{ color: 'var(--cms-text-muted)' }}>{key}</code>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
          <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {selection.size} / {ALL_UI_KEYS.length} {t.selected}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetToFull}
              disabled={!roleState.configured || saving || isSystemRole}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
            >
              <RotateCcw size={13} />
              {t.resetToFull}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving || isSystemRole}
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
