/**
 * SettingsCenter — admin UI for system settings (key/value) — PR-7 typed studio.
 *
 * Composition:
 *   • Page header with bilingual title + subtitle
 *   • Category filter chips (All / platform / content / upload / exams / security)
 *   • Settings list grouped by category; each row shows key (mono), typed value
 *     display, description, last updated
 *   • PR-7 typed inline edit driven by the server `valueType` registry:
 *       bool → two-button segmented control (نعم/لا)
 *       int  → number input with the documented bounds (client-side pre-validation
 *              is UX only; the server re-validates authoritatively)
 *       enum → Select from `allowedValues`
 *       string → text input
 *   • PR-7 per-setting change-history drawer (paginated, oldValue → newValue diff)
 *   • PR-7 read-only feature-flags inventory (super admin only, never a toggle)
 *   • Reset to the REGISTERED server-side default (client never supplies a value)
 *   • Save/reset failures surface through apiErrorHumanMessage (code map first)
 *   • Security-category settings: super_admin only (badge + locked for non-super)
 *
 * Data source:
 *   GET  /api/v1/admin/settings?category=          → SystemSettingDto[]
 *   PUT  /api/v1/admin/settings/{key}              body: { value, description? }
 *   POST /api/v1/admin/settings/{key}/reset        body: {} (server registry is the source)
 *   GET  /api/v1/admin/settings/{key}/history      → PagedResult<SystemSettingHistoryItem>
 *   GET  /api/v1/admin/settings/feature-flags      → FeatureFlagItem[] (read-only)
 *
 * Design tokens (--cms-*) for inline styling; Tailwind for structure.
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Settings as SettingsIcon, LoaderCircle, Search, X, Check, Pencil, RotateCcw, ShieldCheck,
  History as HistoryIcon, Flag, ArrowLeft, ArrowRight,
} from 'lucide-react';
import { Badge, ConfirmDialog, Drawer, EmptyState, ErrorState, Pagination, Select, Skeleton } from '@cms/ui';
import { DangerZone } from './DangerZone';
import {
  apiRequest,
  fetchFeatureFlags,
  fetchSettingHistory,
  type FeatureFlagItem,
  type SystemSettingDto,
  type SystemSettingHistoryItem,
} from '../lib/api';
import { apiErrorHumanMessage, t, localeOf, type Locale } from '../lib/dictionary';
import { useUiPermissions } from '../hooks/uiPermissionsContext';

type Props = {
  token: string;
  isArabic: boolean;
  isSuperAdmin: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const CATEGORIES = [
  { value: '', ar: 'الكل', en: 'All' },
  { value: 'platform', ar: 'المنصة', en: 'Platform' },
  { value: 'content', ar: 'المحتوى', en: 'Content' },
  { value: 'upload', ar: 'الرفع', en: 'Upload' },
  { value: 'exams', ar: 'الاختبارات', en: 'Exams' },
  { value: 'security', ar: 'الأمان', en: 'Security' },
];

const HISTORY_PAGE_SIZE = 10;

/**
 * Documented bounds for the three bounded int keys of the server registry
 * (SystemSettingSchema). Client-side pre-validation is UX ONLY — the server
 * re-validates authoritatively (SETTING_VALUE_INVALID on 400).
 */
const INT_BOUNDS: Record<string, { min: number; max: number }> = {
  max_login_attempts: { min: 3, max: 10 },
  otp_expiry_minutes: { min: 1, max: 30 },
  session_timeout_minutes: { min: 5, max: 120 },
};

/** Feature-flag key (server ConfigKey) → bilingual dictionary entry paths. */
const FLAG_LABEL_PATHS: Record<string, { label: string; note: string }> = {
  'Features:OtpEnabled': { label: 'admincenters.settings.featureFlags.flags.otp.label', note: 'admincenters.settings.featureFlags.flags.otp.note' },
  'Features:OfflineEnabled': { label: 'admincenters.settings.featureFlags.flags.offline.label', note: 'admincenters.settings.featureFlags.flags.offline.note' },
  'Features:HardDeleteEnabled': { label: 'admincenters.settings.featureFlags.flags.hardDelete.label', note: 'admincenters.settings.featureFlags.flags.hardDelete.note' },
  'Security:PlayIntegrity:Enabled': { label: 'admincenters.settings.featureFlags.flags.playIntegrity.label', note: 'admincenters.settings.featureFlags.flags.playIntegrity.note' },
  'Library:RetentionDays': { label: 'admincenters.settings.featureFlags.flags.retention.label', note: 'admincenters.settings.featureFlags.flags.retention.note' },
};

function dateLabel(value: string | null | undefined, isArabic: boolean) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function categoryLabel(cat: string | null | undefined, isArabic: boolean) {
  if (!cat) return t(localeOf(isArabic), 'admincenters.settings.generalCategory');
  const found = CATEGORIES.find(c => c.value === cat);
  return found ? (isArabic ? found.ar : found.en) : cat;
}

/** Local (cosmetic) validation for the in-flight edit. Null = no violation. */
function localEditError(setting: SystemSettingDto | undefined, value: string, locale: Locale): string | null {
  if (!setting) return null;
  if (setting.valueType === 'int') {
    const bounds = INT_BOUNDS[setting.key];
    if (!bounds) return null; // unknown int key — server is authoritative
    const num = Number(value);
    if (!Number.isInteger(num) || num < bounds.min || num > bounds.max) {
      return t(locale, 'admincenters.settings.typed.intInvalid', { min: bounds.min, max: bounds.max });
    }
  }
  if (setting.valueType === 'enum' && setting.allowedValues && setting.allowedValues.length > 0) {
    if (!setting.allowedValues.includes(value)) {
      return t(locale, 'admincenters.settings.typed.enumInvalid');
    }
  }
  return null;
}

export function SettingsCenter({ token, isArabic, isSuperAdmin, onError, onNotice }: Props) {
  // Push 3: cosmetic gating — save (incl. the edit pencil that starts a save) + reset.
  const { can } = useUiPermissions();
  const locale = localeOf(isArabic);
  const dir = isArabic ? 'rtl' : 'ltr';
  const [settings, setSettings] = useState<SystemSettingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('');
  const [search, setSearch] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [busy, setBusy] = useState(false);
  // W1 (admin-ui): explicit confirm dialog target — replaces the native
  // window.confirm (English browser chrome, not keyboard/screen-reader friendly).
  const [resetTarget, setResetTarget] = useState<SystemSettingDto | null>(null);

  // ===== PR-7: per-setting change-history drawer state =====
  const [historyTarget, setHistoryTarget] = useState<SystemSettingDto | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyRows, setHistoryRows] = useState<SystemSettingHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);

  // ===== PR-7: read-only feature-flags inventory (super admin only) =====
  const [flags, setFlags] = useState<FeatureFlagItem[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagsError, setFlagsError] = useState(false);
  const [flagsTick, setFlagsTick] = useState(0);

  // W23.3 (A2): `load` is a stable useCallback + the declared effect dep.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<SystemSettingDto[]>(`/api/v1/admin/settings${activeCategory ? `?category=${activeCategory}` : ''}`, token);
      setSettings(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      onError(apiErrorHumanMessage(err, locale).human || t(locale, 'admincenters.settings.loadFailed'));
      setSettings([]);
    } finally {
      setLoading(false);
    }
  }, [token, activeCategory, locale, onError]);

  useEffect(() => { if (token) void load(); }, [load, token]);

  // Feature flags — fetched ONLY for super admins; the section is hidden
  // entirely for non-super admins (the endpoint itself would answer 403).
  useEffect(() => {
    if (!token || !isSuperAdmin) return;
    let cancelled = false;
    setFlagsLoading(true);
    setFlagsError(false);
    fetchFeatureFlags(token)
      .then((items) => { if (!cancelled) setFlags(Array.isArray(items) ? items : []); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFlagsError(true);
        onError(apiErrorHumanMessage(err, locale).human);
      })
      .finally(() => { if (!cancelled) setFlagsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale/onError are read for error toasts only; listing them would refetch on every locale toggle
  }, [token, isSuperAdmin, flagsTick]);

  // History drawer — fetch on open + on page change only (no polling).
  useEffect(() => {
    if (!token || !historyTarget) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(false);
    fetchSettingHistory(historyTarget.key, token, historyPage, HISTORY_PAGE_SIZE)
      .then((page) => {
        if (cancelled) return;
        setHistoryRows(page?.items ?? []);
        setHistoryTotal(page?.total ?? 0);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHistoryError(true);
        setHistoryRows([]);
        setHistoryTotal(0);
        onError(apiErrorHumanMessage(err, locale).human);
      })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale/onError are read for error toasts only; listing them would refetch on every locale toggle
  }, [token, historyTarget, historyPage, historyTick]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return settings;
    return settings.filter(s =>
      s.key.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      (s.value ?? '').toLowerCase().includes(q)
    );
  }, [settings, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, SystemSettingDto[]>();
    for (const s of filtered) {
      const cat = s.category ?? 'general';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const editingSetting = useMemo(() => settings.find(s => s.key === editingKey), [settings, editingKey]);

  // PR-7: live local validation of the in-flight typed edit (UX only).
  const editError = useMemo(
    () => localEditError(editingSetting, editValue, locale),
    [editingSetting, editValue, locale],
  );

  const startEdit = (s: SystemSettingDto) => {
    setEditingKey(s.key);
    setEditValue(s.value);
    setEditDescription(s.description ?? '');
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
    setEditDescription('');
  };

  const saveEdit = async (key: string) => {
    if (editError) return; // local bound violation — never sent; server stays authoritative
    setBusy(true);
    try {
      const updated = await apiRequest<SystemSettingDto>(`/api/v1/admin/settings/${encodeURIComponent(key)}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: editValue, description: editDescription || null }),
      });
      setSettings(prev => prev.map(s => s.key === key ? { ...s, ...updated } : s));
      cancelEdit();
      onNotice(t(locale, 'admincenters.settings.savedToast'));
    } catch (err: unknown) {
      // SETTING_VALUE_INVALID (and any other code) resolves through the map first.
      onError(apiErrorHumanMessage(err, locale).human);
    } finally {
      setBusy(false);
    }
  };

  const resetSetting = async (s: SystemSettingDto) => {
    setBusy(true);
    try {
      // PR-7: the reset target is the SERVER-side registered default — no
      // DefaultValue is sent (it would be ignored anyway; the old client
      // derived it from the description text, a client-trusted value).
      const updated = await apiRequest<SystemSettingDto>(`/api/v1/admin/settings/${encodeURIComponent(s.key)}/reset`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setSettings(prev => prev.map(x => x.key === s.key ? { ...x, ...updated } : x));
      setResetTarget(null);
      onNotice(t(locale, 'admincenters.settings.resetToast'));
    } catch (err: unknown) {
      // 404 SETTING_NO_DEFAULT and friends resolve bilingually via the code map.
      onError(apiErrorHumanMessage(err, locale).human);
    } finally {
      setBusy(false);
    }
  };

  const copy = {
    title: t(locale, 'nav.settings'),
    desc: t(locale, 'admincenters.settings.description'),
    search: t(locale, 'admincenters.settings.search'),
    save: t(locale, 'common.save'),
    cancel: t(locale, 'common.cancel'),
    edit: t(locale, 'common.edit'),
    reset: t(locale, 'admincenters.settings.reset'),
    lastUpdated: t(locale, 'common.updated'),
    locked: t(locale, 'admincenters.settings.locked'),
    noData: t(locale, 'admincenters.settings.noData'),
    loading: t(locale, 'common.loading'),
  };

  const openHistory = (s: SystemSettingDto) => {
    setHistoryTarget(s);
    setHistoryPage(1);
    setHistoryRows([]);
    setHistoryTotal(0);
  };

  return (
    <section className="space-y-6" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}>
          <SettingsIcon size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--cms-text)' }}>{copy.title}</h2>
          <p className="text-sm" style={{ color: 'var(--cms-text-muted)' }}>{copy.desc}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineStart: '10px', color: 'var(--cms-text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={copy.search}
            className="w-full h-9 rounded-lg border text-xs"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)', color: 'var(--cms-text)', paddingInlineStart: '30px' }}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setActiveCategory(c.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
              style={activeCategory === c.value
                ? { background: 'var(--cms-teal-700)', color: 'white', borderColor: 'var(--cms-teal-700)' }
                : { background: 'var(--cms-surface)', color: 'var(--cms-text-soft)', borderColor: 'var(--cms-line)' }}
            >
              {isArabic ? c.ar : c.en}
            </button>
          ))}
        </div>
      </div>

      {/* PR-7 — why the security category is super-admin-only (one-line banner). */}
      {grouped.some(([cat]) => cat === 'security') && (
        <p
          className="flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed"
          style={{ borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
          data-testid="settings-security-note"
        >
          <ShieldCheck size={14} className="mt-0.5 shrink-0" />
          <span>{t(locale, 'admincenters.settings.securityCategoryNote')}</span>
        </p>
      )}

      {/* Settings list */}
      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <LoaderCircle size={20} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} />
          <span className="text-xs ml-2" style={{ color: 'var(--cms-text-muted)' }}>{copy.loading}</span>
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={SettingsIcon}
          title={copy.noData}
          dir={dir}
          testId="settings-empty"
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, items]) => (
            <div key={category} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
              {/* Category header */}
              <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-soft)' }}>
                  {categoryLabel(category, isArabic)}
                </h3>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
                  {items.length}
                </span>
              </div>
              {/* Items */}
              <div className="divide-y" style={{ borderColor: 'var(--cms-line)' }}>
                {items.map(s => {
                  const isLocked = s.category === 'security' && !isSuperAdmin;
                  const isEditing = editingKey === s.key;
                  const bounds = INT_BOUNDS[s.key];
                  return (
                    <div key={s.id} className="p-4 flex items-start gap-3" style={{ borderColor: 'var(--cms-line)' }}>
                      <div className="flex-1 min-w-0">
                        {/* Key + type + description */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <code className="text-xs font-mono font-semibold" style={{ color: 'var(--cms-teal-700)' }}>{s.key}</code>
                          <Badge variant="default" size="sm" data-testid={`setting-type-${s.key}`}>
                            {t(locale, `admincenters.settings.typed.type${s.valueType === 'bool' ? 'Bool' : s.valueType === 'int' ? 'Int' : s.valueType === 'enum' ? 'Enum' : 'String'}`)}
                          </Badge>
                          {isLocked && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border" style={{ borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)', color: 'var(--cms-warning)' }}>
                              <ShieldCheck size={10} />
                              {copy.locked}
                            </span>
                          )}
                        </div>
                        {s.description && (
                          <p className="text-[11px] mb-2" style={{ color: 'var(--cms-text-muted)' }}>{s.description}</p>
                        )}
                        {/* Value (typed display or typed edit control) */}
                        {isEditing ? (
                          <div className="space-y-2">
                            {s.valueType === 'bool' ? (
                              <div
                                role="group"
                                aria-label={t(locale, 'admincenters.settings.typed.a11yBoolOption')}
                                className="inline-flex rounded-lg border overflow-hidden"
                                style={{ borderColor: 'var(--cms-line)' }}
                                data-testid="setting-edit-bool"
                              >
                                {(['true', 'false'] as const).map(option => {
                                  const selected = editValue === option;
                                  return (
                                    <button
                                      key={option}
                                      type="button"
                                      aria-pressed={selected}
                                      onClick={() => setEditValue(option)}
                                      className="min-h-[44px] px-5 text-xs font-semibold transition-colors"
                                      style={selected
                                        ? { background: 'var(--cms-teal-700)', color: 'white' }
                                        : { background: 'var(--cms-surface)', color: 'var(--cms-text-soft)' }}
                                    >
                                      {option === 'true' ? t(locale, 'admincenters.settings.typed.boolYes') : t(locale, 'admincenters.settings.typed.boolNo')}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : s.valueType === 'enum' && s.allowedValues && s.allowedValues.length > 0 ? (
                              <Select
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                error={Boolean(editError)}
                                size="md"
                                testId="setting-edit-enum"
                                options={s.allowedValues.map(value => ({ value, label: value }))}
                              />
                            ) : (
                              <input
                                type={s.valueType === 'int' ? 'number' : 'text'}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                min={s.valueType === 'int' && bounds ? bounds.min : undefined}
                                max={s.valueType === 'int' && bounds ? bounds.max : undefined}
                                aria-invalid={Boolean(editError) || undefined}
                                className="w-full h-8 rounded-lg border text-xs px-2 font-mono"
                                style={editError
                                  ? { borderColor: 'var(--cms-danger)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }
                                  : { borderColor: 'var(--cms-teal-500)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                                autoFocus
                                disabled={busy}
                                data-testid="setting-edit-input"
                              />
                            )}
                            {s.valueType === 'int' && bounds && !editError && (
                              <p className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                                {t(locale, 'admincenters.settings.typed.intBoundsHint', { min: bounds.min, max: bounds.max })}
                              </p>
                            )}
                            {editError && (
                              <p role="alert" className="text-[11px] font-medium" style={{ color: 'var(--cms-danger)' }} data-testid="setting-edit-error">
                                {editError}
                              </p>
                            )}
                            <input
                              type="text"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder={t(locale, 'roles.description')}
                              className="w-full h-8 rounded-lg border text-xs px-2"
                              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                              disabled={busy}
                            />
                          </div>
                        ) : s.valueType === 'bool' ? (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${
                              s.value === 'true'
                                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                : 'text-slate-600 bg-slate-100 border-slate-300'
                            }`}
                            data-testid={`setting-value-${s.key}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${s.value === 'true' ? 'bg-emerald-500' : 'bg-slate-400'} opacity-80`} />
                            {s.value === 'true'
                              ? t(locale, 'admincenters.settings.typed.boolEnabled')
                              : t(locale, 'admincenters.settings.typed.boolDisabled')}
                          </span>
                        ) : (
                          <div className="text-xs font-mono px-2 py-1 rounded inline-block" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text)' }} data-testid={`setting-value-${s.key}`}>
                            {s.value || '—'}
                          </div>
                        )}
                        {/* Last updated */}
                        <div className="text-[10px] mt-2" style={{ color: 'var(--cms-text-muted)' }}>
                          {copy.lastUpdated}: {dateLabel(s.updatedAt, isArabic)}
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {isEditing ? (
                          <>
                            {can('btn:settings.save') && (
                              <button
                                onClick={() => saveEdit(s.key)}
                                disabled={busy || Boolean(editError)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ background: 'var(--cms-teal-700)' }}
                              >
                                {busy ? <LoaderCircle size={12} className="animate-spin" /> : <Check size={12} />}
                                {copy.save}
                              </button>
                            )}
                            <button
                              onClick={cancelEdit}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border disabled:opacity-50"
                              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}
                            >
                              <X size={12} />
                              {copy.cancel}
                            </button>
                          </>
                        ) : (
                          <>
                            {can('btn:settings.save') && (
                              <button
                                onClick={() => startEdit(s)}
                                disabled={isLocked || busy}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}
                                title={isLocked ? copy.locked : copy.edit}
                              >
                                <Pencil size={12} />
                                {copy.edit}
                              </button>
                            )}
                            {/* PR-7: history affordance — one drawer per setting row. */}
                            <button
                              type="button"
                              onClick={() => openHistory(s)}
                              disabled={busy}
                              aria-label={t(locale, 'admincenters.settings.history.openLabel', { key: s.key })}
                              title={t(locale, 'admincenters.settings.history.openLabel', { key: s.key })}
                              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-[11px] font-medium border disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ borderColor: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)', background: 'var(--cms-teal-50)' }}
                              data-testid="setting-history-open"
                            >
                              <HistoryIcon size={12} />
                            </button>
                            {can('btn:settings.reset') && (
                              <button
                                onClick={() => setResetTarget(s)}
                                disabled={isLocked || busy}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}
                              >
                                <RotateCcw size={12} />
                                {copy.reset}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== PR-7: per-setting change-history drawer ===== */}
      <Drawer
        open={historyTarget !== null}
        onOpenChange={(next) => { if (!next) { setHistoryTarget(null); setHistoryPage(1); } }}
        title={t(locale, 'admincenters.settings.history.drawerTitle')}
        description={historyTarget ? historyTarget.key : undefined}
        dir={dir}
        size="lg"
        closeLabel={t(locale, 'common.close')}
        testId="setting-history-drawer"
      >
        <div className="space-y-3" data-testid="setting-history-body">
          {historyLoading ? (
            <div className="space-y-2" aria-busy="true" data-testid="setting-history-loading">
              {[0, 1, 2, 3, 4].map(row => <Skeleton key={row} className="h-16 w-full" />)}
            </div>
          ) : historyError ? (
            <ErrorState
              title={t(locale, 'admincenters.settings.history.loadFailed')}
              retryLabel={t(locale, 'admincenters.settings.history.retry')}
              onRetry={() => setHistoryTick(tick => tick + 1)}
              dir={dir}
              testId="setting-history-error"
            />
          ) : historyRows.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title={t(locale, 'admincenters.settings.history.empty')}
              dir={dir}
              testId="setting-history-empty"
            />
          ) : (
            <>
              <ol className="space-y-2">
                {historyRows.map(row => (
                  <li
                    key={row.id}
                    className="rounded-lg border p-3"
                    style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
                    data-testid="setting-history-row"
                  >
                    {/* Diff emphasis: old (struck, red) → new (bold, green). */}
                    <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
                      <code
                        className="px-2 py-0.5 rounded line-through"
                        style={{ background: 'var(--cms-danger-50)', color: 'var(--cms-danger)' }}
                        title={t(locale, 'admincenters.settings.history.oldValue')}
                      >
                        {row.oldValue ?? '—'}
                      </code>
                      {dir === 'rtl' ? <ArrowLeft size={12} aria-hidden="true" /> : <ArrowRight size={12} aria-hidden="true" />}
                      <code
                        className="px-2 py-0.5 rounded font-bold"
                        style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
                        title={t(locale, 'admincenters.settings.history.newValue')}
                      >
                        {row.newValue ?? '—'}
                      </code>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      {/* Reason badge: update (teal) / reset (amber). */}
                      <Badge
                        variant={row.reason === 'update' ? 'primary' : 'warning'}
                        size="sm"
                        data-testid={row.reason === 'update' ? 'setting-history-reason-update' : 'setting-history-reason-reset'}
                      >
                        {row.reason === 'update'
                          ? t(locale, 'admincenters.settings.history.reasonUpdate')
                          : row.reason === 'reset'
                            ? t(locale, 'admincenters.settings.history.reasonReset')
                            : t(locale, 'admincenters.settings.history.reasonUnknown')}
                      </Badge>
                      <span className="text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                        {t(locale, 'admincenters.settings.history.actor')}:{' '}
                        {row.changedByName ?? row.changedBy ?? t(locale, 'admincenters.settings.history.actorUnknown')}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                        {dateLabel(row.changedAt, isArabic)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
              <Pagination
                page={historyPage}
                pageSize={HISTORY_PAGE_SIZE}
                total={historyTotal}
                onPageChange={(next) => setHistoryPage(next)}
                dir={dir}
                testId="setting-history-pagination"
                labels={{
                  navLabel: t(locale, 'admincenters.settings.history.navLabel'),
                  prev: t(locale, 'admincenters.settings.history.prev'),
                  next: t(locale, 'admincenters.settings.history.next'),
                  pageOf: (page, pages) => t(locale, 'audit.viewer.page') + ' ' + page + ' ' + t(locale, 'audit.viewer.of') + ' ' + pages,
                }}
              />
            </>
          )}
        </div>
      </Drawer>

      {/* ===== PR-7: read-only feature-flags inventory (super admin only) ===== */}
      {isSuperAdmin && (
        <section
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
          aria-labelledby="settings-feature-flags-title"
          data-testid="settings-feature-flags"
        >
          <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
              <Flag size={16} />
            </div>
            <div className="min-w-0">
              <h3 id="settings-feature-flags-title" className="text-sm font-bold" style={{ color: 'var(--cms-text)' }}>
                {t(locale, 'admincenters.settings.featureFlags.title')}
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                {t(locale, 'admincenters.settings.featureFlags.description')}
              </p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            {/* Fixed read-only notice — there is NO mutation affordance anywhere here. */}
            <p
              className="flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed"
              style={{ borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)', color: 'var(--cms-warning)' }}
              data-testid="settings-feature-flags-readonly"
            >
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              <span>{t(locale, 'admincenters.settings.featureFlags.readOnlyNotice')}</span>
            </p>
            {flagsLoading ? (
              <div className="space-y-2" aria-busy="true" data-testid="settings-feature-flags-loading">
                {[0, 1, 2, 3, 4].map(row => <Skeleton key={row} className="h-14 w-full" />)}
              </div>
            ) : flagsError ? (
              <ErrorState
                title={t(locale, 'admincenters.settings.featureFlags.loadFailed')}
                retryLabel={t(locale, 'admincenters.settings.featureFlags.retry')}
                onRetry={() => setFlagsTick(tick => tick + 1)}
                dir={dir}
                testId="settings-feature-flags-error"
              />
            ) : (
              <ul className="space-y-2">
                {flags.map(flag => {
                  const paths = FLAG_LABEL_PATHS[flag.key];
                  const enabled = flag.valueType === 'bool' && flag.value === 'true';
                  return (
                    <li
                      key={flag.key}
                      className="rounded-lg border p-3 flex flex-col gap-2"
                      style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
                      data-testid="settings-feature-flag-row"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Bilingual label (unknown keys fall back to the raw key). */}
                        <span className="text-xs font-semibold" style={{ color: 'var(--cms-text)' }}>
                          {paths ? t(locale, paths.label) : flag.key}
                        </span>
                        {/* State badge: bool → enabled/disabled; int → the value itself. */}
                        {flag.valueType === 'bool' ? (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${
                              enabled
                                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                : 'text-slate-600 bg-slate-100 border-slate-300'
                            }`}
                            data-testid="settings-feature-flag-state"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-400'} opacity-80`} />
                            {enabled
                              ? t(locale, 'admincenters.settings.featureFlags.enabled')
                              : t(locale, 'admincenters.settings.featureFlags.disabled')}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-mono"
                            style={{ borderColor: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)', background: 'var(--cms-teal-50)' }}
                            data-testid="settings-feature-flag-state"
                          >
                            {t(locale, 'admincenters.settings.featureFlags.valueLabel')}: {flag.value}
                          </span>
                        )}
                        {/* Source badge: environment vs code default. */}
                        <Badge variant={flag.source === 'environment' ? 'info' : 'default'} size="sm" data-testid="settings-feature-flag-source">
                          {flag.source === 'environment'
                            ? t(locale, 'admincenters.settings.featureFlags.sourceEnvironment')
                            : t(locale, 'admincenters.settings.featureFlags.sourceDefault')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                        <span aria-hidden="true">{t(locale, 'admincenters.settings.featureFlags.envName')}:</span>
                        <code dir="ltr" className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}>
                          {flag.rawEnvName}
                        </code>
                      </div>
                      {paths && (
                        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--cms-text-soft)' }} data-testid="settings-feature-flag-note">
                          {t(locale, paths.note)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* W1 (admin-ui): explicit confirm before overwriting a setting with its
          REGISTERED server-side default — the copy explains that the restored
          value comes from the server registry, never from the client. */}
      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(nextOpen) => { if (!nextOpen) setResetTarget(null); }}
        title={t(locale, 'admincenters.settings.resetConfirmTitle')}
        description={resetTarget
          ? t(locale, 'admincenters.settings.resetConfirmDescription', {
              key: resetTarget.key,
              current: resetTarget.value || '—',
            })
          : undefined}
        confirmLabel={t(locale, 'admincenters.settings.resetConfirmLabel')}
        cancelLabel={copy.cancel}
        dir={dir}
        busy={busy}
        onConfirm={() => { if (resetTarget) void resetSetting(resetTarget); }}
        testId="settings-reset-confirm"
      />

      {/* Command Center P1 (D-3): SuperAdmin-only module wipes with dry-run preview,
          typed confirmation (DELETE / حذف) and acting-admin re-auth. */}
      {isSuperAdmin && (
        <DangerZone token={token} isArabic={isArabic} onError={onError} onNotice={onNotice} />
      )}
    </section>
  );
}
