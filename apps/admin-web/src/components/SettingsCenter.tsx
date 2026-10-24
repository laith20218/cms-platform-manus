/**
 * SettingsCenter — admin UI for system settings (key/value).
 *
 * Composition:
 *   • Page header with eyebrow + bilingual title + subtitle
 *   • Category filter chips (All / platform / content / upload / exams / security)
 *   • Settings list grouped by category, each row shows: key (mono), value (editable), description, last updated
 *   • Inline edit (click pencil → input + Save/Cancel)
 *   • Reset to default button (with confirmation)
 *   • Save shows loading spinner, success toast, error toast
 *   • Security-category settings: super_admin only (badge + locked for non-super)
 *
 * Data source:
 *   GET  /api/v1/admin/settings?category=
 *   PUT  /api/v1/admin/settings/{key}  body: { value, description? }
 *   POST /api/v1/admin/settings/{key}/reset  body: { defaultValue }
 *
 * Design tokens (--cms-*) for inline styling; Tailwind for structure.
 */
import { useEffect, useState, useMemo } from 'react';
import {
  Settings as SettingsIcon, LoaderCircle, Search, X, Check, Pencil, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import { useUiPermissions } from '../hooks/useUiPermissions';

type Props = {
  token: string;
  isArabic: boolean;
  isSuperAdmin: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

type SystemSetting = {
  id: string;
  key: string;
  value: string;
  description?: string | null;
  category?: string | null;
  updatedBy?: string | null;
  updatedAt: string;
  createdAt: string;
};

const CATEGORIES = [
  { value: '', ar: 'الكل', en: 'All' },
  { value: 'platform', ar: 'المنصة', en: 'Platform' },
  { value: 'content', ar: 'المحتوى', en: 'Content' },
  { value: 'upload', ar: 'الرفع', en: 'Upload' },
  { value: 'exams', ar: 'الاختبارات', en: 'Exams' },
  { value: 'security', ar: 'الأمان', en: 'Security' },
];

function dateLabel(value: string, isArabic: boolean) {
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function categoryLabel(cat: string | null | undefined, isArabic: boolean) {
  if (!cat) return isArabic ? 'عام' : 'General';
  const found = CATEGORIES.find(c => c.value === cat);
  return found ? (isArabic ? found.ar : found.en) : cat;
}

export function SettingsCenter({ token, isArabic, isSuperAdmin, onError, onNotice }: Props) {
  // Push 3: cosmetic gating — save (incl. the edit pencil that starts a save) + reset.
  const { can } = useUiPermissions();
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('');
  const [search, setSearch] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<SystemSetting[]>(`/api/v1/admin/settings${activeCategory ? `?category=${activeCategory}` : ''}`, token);
      setSettings(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : isArabic ? 'تعذّر تحميل الإعدادات' : 'Could not load settings';
      onError(msg);
      setSettings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (token) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token, activeCategory]);

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
    const map = new Map<string, SystemSetting[]>();
    for (const s of filtered) {
      const cat = s.category ?? 'general';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const startEdit = (s: SystemSetting) => {
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
    setBusy(true);
    try {
      const updated = await apiRequest<SystemSetting>(`/api/v1/admin/settings/${encodeURIComponent(key)}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: editValue, description: editDescription || null }),
      });
      setSettings(prev => prev.map(s => s.key === key ? { ...s, ...updated } : s));
      cancelEdit();
      onNotice(isArabic ? 'تم تحديث الإعداد' : 'Setting updated');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : isArabic ? 'فشل التحديث' : 'Update failed';
      onError(msg);
    } finally {
      setBusy(false);
    }
  };

  const resetSetting = async (s: SystemSetting) => {
    if (!s.description) { onError(isArabic ? 'لا يوجد وصف لهذا الإعداد' : 'No description for default value'); return; }
    const defaultValue = s.description.split(':').pop()?.trim() ?? '';
    if (!defaultValue || !window.confirm(isArabic
      ? `هل تريد إعادة تعيين "${s.key}" إلى القيمة الافتراضية "${defaultValue}"؟`
      : `Reset "${s.key}" to default "${defaultValue}"?`)) return;
    setBusy(true);
    try {
      const updated = await apiRequest<SystemSetting>(`/api/v1/admin/settings/${encodeURIComponent(s.key)}/reset`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultValue }),
      });
      setSettings(prev => prev.map(x => x.key === s.key ? { ...x, ...updated } : x));
      onNotice(isArabic ? 'تمت إعادة التعيين' : 'Reset to default');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : isArabic ? 'فشلت إعادة التعيين' : 'Reset failed';
      onError(msg);
    } finally {
      setBusy(false);
    }
  };

  const t = isArabic
    ? {
        title: 'إعدادات النظام', desc: 'إعدادات قابلة للتعديل من قبل المدير (مفصولة عن الأسرار)',
        search: 'ابحث بالمفتاح أو القيمة...', save: 'حفظ', cancel: 'إلغاء', edit: 'تعديل',
        reset: 'إعادة تعيين', lastUpdated: 'آخر تحديث', locked: 'مقفل — يتطلب super_admin',
        noData: 'لا توجد إعدادات', loading: 'جارٍ التحميل...',
      }
    : {
        title: 'System Settings', desc: 'Admin-editable platform config (separated from secrets)',
        search: 'Search by key or value...', save: 'Save', cancel: 'Cancel', edit: 'Edit',
        reset: 'Reset', lastUpdated: 'Last updated', locked: 'Locked — requires super_admin',
        noData: 'No settings found', loading: 'Loading...',
      };

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}>
          <SettingsIcon size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--cms-text)' }}>{t.title}</h2>
          <p className="text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t.desc}</p>
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
            placeholder={t.search}
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

      {/* Settings list */}
      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <LoaderCircle size={20} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} />
          <span className="text-xs ml-2" style={{ color: 'var(--cms-text-muted)' }}>{t.loading}</span>
        </div>
      ) : grouped.length === 0 ? (
        <div className="p-8 text-center rounded-xl border" style={{ borderColor: 'var(--cms-line)' }}>
          <SettingsIcon size={28} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t.noData}</p>
        </div>
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
                  return (
                    <div key={s.id} className="p-4 flex items-start gap-3" style={{ borderColor: 'var(--cms-line)' }}>
                      <div className="flex-1 min-w-0">
                        {/* Key + description */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <code className="text-xs font-mono font-semibold" style={{ color: 'var(--cms-teal-700)' }}>{s.key}</code>
                          {isLocked && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border" style={{ borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)', color: 'var(--cms-warning)' }}>
                              <ShieldCheck size={10} />
                              {t.locked}
                            </span>
                          )}
                        </div>
                        {s.description && (
                          <p className="text-[11px] mb-2" style={{ color: 'var(--cms-text-muted)' }}>{s.description}</p>
                        )}
                        {/* Value (display or edit) */}
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full h-8 rounded-lg border text-xs px-2 font-mono"
                              style={{ borderColor: 'var(--cms-teal-500)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                              autoFocus
                              disabled={busy}
                            />
                            <input
                              type="text"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder={isArabic ? 'الوصف' : 'Description'}
                              className="w-full h-8 rounded-lg border text-xs px-2"
                              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                              disabled={busy}
                            />
                          </div>
                        ) : (
                          <div className="text-xs font-mono px-2 py-1 rounded inline-block" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text)' }}>
                            {s.value || '—'}
                          </div>
                        )}
                        {/* Last updated */}
                        <div className="text-[10px] mt-2" style={{ color: 'var(--cms-text-muted)' }}>
                          {t.lastUpdated}: {dateLabel(s.updatedAt, isArabic)}
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {isEditing ? (
                          <>
                            {can('btn:settings.save') && (
                              <button
                                onClick={() => saveEdit(s.key)}
                                disabled={busy}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-white disabled:opacity-50"
                                style={{ background: 'var(--cms-teal-700)' }}
                              >
                                {busy ? <LoaderCircle size={12} className="animate-spin" /> : <Check size={12} />}
                                {t.save}
                              </button>
                            )}
                            <button
                              onClick={cancelEdit}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border disabled:opacity-50"
                              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}
                            >
                              <X size={12} />
                              {t.cancel}
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
                                title={isLocked ? t.locked : t.edit}
                              >
                                <Pencil size={12} />
                                {t.edit}
                              </button>
                            )}
                            {s.description && s.description.includes(':') && can('btn:settings.reset') && (
                              <button
                                onClick={() => resetSetting(s)}
                                disabled={isLocked || busy}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}
                              >
                                <RotateCcw size={12} />
                                {t.reset}
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
    </section>
  );
}
