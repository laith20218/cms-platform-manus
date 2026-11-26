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
import { ConfirmDialog } from '@cms/ui';
import { ApiError, clearRoleUiPermissions, fetchRoleUiPermissions, replaceRoleUiPermissions } from '../lib/api';
import { t, localeOf } from '../lib/dictionary';
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
  const locale = localeOf(isArabic);
  const [roleState, setRoleState] = useState<RoleState>({ configured: false, allowedKeys: null });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  // W4: reset-to-full was a native window.confirm (debt D-06) — now an explicit
  // danger ConfirmDialog (this is the widest possible grant: NULL = full access).
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    if (!token || !roleId) return;
    setLoading(true);
    fetchRoleUiPermissions(token, roleId)
      .then((state) => {
        setRoleState({ configured: state.configured, allowedKeys: state.allowedKeys });
        setSelection(new Set(state.allowedKeys ?? []));
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : t(localeOf(isArabic), 'admincenters.permissions.ui.loadFailed');
        onError(message);
      })
      .finally(() => setLoading(false));
  }, [token, roleId, isArabic, onError]);

  const dirty = useMemo(
    () => JSON.stringify([...selection].sort()) !== JSON.stringify((roleState.allowedKeys ?? []).slice().sort()),
    [selection, roleState],
  );

  const copy = {
    title: t(locale, 'admincenters.permissions.ui.title'),
    desc: t(locale, 'admincenters.permissions.ui.desc'),
    close: t(locale, 'common.close'),
    loading: t(locale, 'common.loading'),
    configured: t(locale, 'admincenters.permissions.ui.configured'),
    notConfigured: t(locale, 'admincenters.permissions.ui.notConfigured'),
    systemLocked: t(locale, 'admincenters.permissions.ui.systemLocked'),
    dirty: t(locale, 'admincenters.permissions.unsavedChanges'),
    save: t(locale, 'admincenters.permissions.ui.save'),
    resetToFull: t(locale, 'admincenters.permissions.ui.resetToFull'),
    selected: t(locale, 'admincenters.permissions.ui.selected'),
    searchPlaceholder: t(locale, 'admincenters.permissions.ui.searchPlaceholder'),
    noMatches: t(locale, 'admincenters.permissions.ui.noMatches'),
    templates: t(locale, 'admincenters.permissions.ui.templates'),
    unconfiguredTitle: t(locale, 'admincenters.permissions.ui.unconfiguredTitle'),
    unconfiguredBody: t(locale, 'admincenters.permissions.ui.unconfiguredBody'),
    emptyTree: t(locale, 'admincenters.permissions.ui.emptyTree'),
    views: t(locale, 'admincenters.permissions.ui.views'),
    saveOk: t(locale, 'admincenters.permissions.ui.saveOk'),
    resetOk: t(locale, 'admincenters.permissions.ui.resetOk'),
    saveFail: t(locale, 'admincenters.permissions.saveFailed'),
    confirmReset: t(locale, 'admincenters.permissions.ui.confirmReset'),
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
      onNotice(copy.saveOk);
    } catch (error: unknown) {
      const message = error instanceof ApiError ? error.message : copy.saveFail;
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  const resetToFull = async () => {
    setSaving(true);
    try {
      await clearRoleUiPermissions(token, roleId);
      setRoleState({ configured: false, allowedKeys: null });
      setSelection(new Set());
      setResetConfirmOpen(false);
      onNotice(copy.resetOk);
    } catch (error: unknown) {
      const message = error instanceof ApiError ? error.message : copy.saveFail;
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
            <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{copy.title}</h3>
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
              {roleState.configured ? copy.configured : copy.notConfigured}
            </span>
            {isSystemRole && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)', color: 'var(--cms-warning)' }}>
                <Lock size={10} />
                {copy.systemLocked}
              </span>
            )}
          </div>
          <button onClick={() => !saving && onClose()} disabled={saving} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-50" aria-label={copy.close}>
            <X size={18} style={{ color: 'var(--cms-text-muted)' }} />
          </button>
        </div>

        {/* Description + dirty indicator */}
        <div className="px-4 py-2 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--cms-line)' }}>
          <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{copy.desc}</p>
          {dirty && !isSystemRole && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--cms-warning-50)', color: 'var(--cms-warning)' }}>
              {copy.dirty}
            </span>
          )}
        </div>

        {/* 2.1c empty state: unconfigured = full access + the two-layers clarification */}
        {!loading && !roleState.configured && !isSystemRole && (
          <div className="mx-4 mt-3 rounded-lg border px-4 py-3" style={{ borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--cms-warning)' }}>{copy.unconfiguredTitle}</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--cms-text-soft)' }}>{copy.unconfiguredBody}</p>
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
              placeholder={copy.searchPlaceholder}
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
            <span className="text-[11px] font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{copy.templates}:</span>
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
              <span className="text-xs ml-2" style={{ color: 'var(--cms-text-muted)' }}>{copy.loading}</span>
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
                          {children.length === 0 ? copy.emptyTree : copy.noMatches}
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
            {selection.size} / {ALL_UI_KEYS.length} {copy.selected}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setResetConfirmOpen(true)}
              disabled={!roleState.configured || saving || isSystemRole}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
            >
              <RotateCcw size={13} />
              {copy.resetToFull}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving || isSystemRole}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--cms-teal-700)' }}
            >
              {saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
              {copy.save}
            </button>
          </div>
        </div>
      </div>

      {/* W4: explicit danger confirm for the reset-to-full grant (was window.confirm). */}
      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={(next) => { if (!next) setResetConfirmOpen(false); }}
        title={copy.resetToFull}
        description={copy.confirmReset}
        confirmLabel={copy.resetToFull}
        cancelLabel={copy.close}
        variant="danger"
        requireAcknowledge={{
          label: t(locale, 'admincenters.permissions.ui.resetAcknowledge'),
        }}
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={saving}
        onConfirm={() => void resetToFull()}
        testId="ui-permissions-reset-confirm"
      />
    </div>
  );
}
