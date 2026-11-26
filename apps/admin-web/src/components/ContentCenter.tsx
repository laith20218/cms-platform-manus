/**
 * ContentCenter — admin editor for the site content pages (W16.5):
 * Terms (شروط الاستخدام) / Privacy (سياسة الخصوصية) / Contact (تواصل معنا).
 *
 * Composition:
 *   • Page list (slug chip + Arabic title + last-updated) with edit buttons
 *   • Editor panel: title input + RTL body textarea (markdown-lite hint:
 *     blank-line paragraphs, «## » = section heading)
 *   • Save → PUT (upsert) with spinner, success toast, Arabic error toast
 *
 * Data source:
 *   GET  /api/v1/admin/content          → ContentPageRecord[]
 *   PUT  /api/v1/admin/content/{slug}   body: { titleAr, bodyAr }
 *
 * Super-admin only (App gates the view; the API enforces the role).
 * Design tokens (--cms-*) for inline styling; Tailwind for structure —
 * mirrors SettingsCenter.
 */
import { useEffect, useState } from 'react';
import { FileText, LoaderCircle, Pencil, X, Check } from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
// PR-3 — content-page strings resolve through the shared dictionary.
import { t, localeOf } from '../lib/dictionary';

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

type ContentPageRecord = {
  slug: string;
  titleAr: string;
  bodyAr: string;
  updatedAt: string;
};

const SLUG_LABELS: Record<string, { ar: string; en: string }> = {
  terms: { ar: 'شروط الاستخدام', en: 'Terms of Use' },
  privacy: { ar: 'سياسة الخصوصية', en: 'Privacy Policy' },
  contact: { ar: 'تواصل معنا', en: 'Contact Us' },
};

function slugLabel(slug: string, isArabic: boolean) {
  const known = SLUG_LABELS[slug];
  if (known) return isArabic ? known.ar : known.en;
  return slug;
}

function dateLabel(value: string, isArabic: boolean) {
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ContentCenter({ token, isArabic, onError, onNotice }: Props) {
  const locale = localeOf(isArabic);
  const [pages, setPages] = useState<ContentPageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<ContentPageRecord[]>('/api/v1/admin/content', token);
      setPages(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : t(locale, 'courses.content.loadFailed');
      onError(msg);
      setPages([]);
    } finally {
      setLoading(false);
    }
  };

  // Load once per token — 'load' is a stable local; re-running on every render
  // would refetch after each keystroke in the editor below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (token) load(); }, [token]);
  const startEdit = (page: ContentPageRecord) => {
    setEditingSlug(page.slug);
    setEditTitle(page.titleAr);
    setEditBody(page.bodyAr);
  };

  const cancelEdit = () => {
    setEditingSlug(null);
    setEditTitle('');
    setEditBody('');
  };

  const save = async () => {
    if (!editingSlug) return;
    setBusy(true);
    try {
      await apiRequest<ContentPageRecord>(`/api/v1/admin/content/${editingSlug}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleAr: editTitle, bodyAr: editBody }),
      });
      onNotice(t(locale, 'courses.content.saved'));
      cancelEdit();
      await load();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : t(locale, 'courses.content.saveFailed');
      onError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--cms-text)]" dir={isArabic ? 'rtl' : 'ltr'}>
            {t(locale, 'courses.content.title')}
          </h2>
          <p className="text-sm text-[var(--cms-text-muted)]" dir={isArabic ? 'rtl' : 'ltr'}>
            {t(locale, 'courses.content.description')}
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <LoaderCircle className="w-7 h-7 animate-spin" style={{ color: 'var(--cms-teal-600)' }} />
        </div>
      )}

      {/* List */}
      {!loading && (
        <div className="space-y-3">
          {pages.map((page) => (
            <div key={page.slug} className="rounded-2xl border p-4" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
              {editingSlug === page.slug ? (
                <div className="space-y-3" dir="rtl">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
                      /{page.slug}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={save}
                        disabled={busy || !editTitle.trim() || !editBody.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                        style={{ background: 'var(--cms-teal-600)' }}
                      >
                        {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        حفظ
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                        style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                      >
                        <X className="w-4 h-4" />
                        إلغاء
                      </button>
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-sm font-semibold text-[var(--cms-text-soft)]">عنوان الصفحة</span>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      maxLength={200}
                      className="mt-1 w-full h-11 rounded-xl border px-3 text-sm"
                      style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-ivory-50)', color: 'var(--cms-text)' }}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-[var(--cms-text-soft)]">نص الصفحة</span>
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      maxLength={20000}
                      rows={12}
                      dir="rtl"
                      className="mt-1 w-full rounded-xl border p-3 text-sm leading-7"
                      style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-ivory-50)', color: 'var(--cms-text)' }}
                    />
                    <span className="mt-1 block text-xs text-[var(--cms-text-muted)]">
                      كل فقرة بين سطرين فارغين. ضع «## » قبل أي عنوان فرعي ليظهر كعنوان.
                    </span>
                  </label>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3" dir={isArabic ? 'rtl' : 'ltr'}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs px-2 py-0.5 rounded-md" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
                        /{page.slug}
                      </span>
                      <span className="font-bold text-[var(--cms-text)] truncate">{page.titleAr}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--cms-text-muted)]">
                      {slugLabel(page.slug, isArabic)} · {t(locale, 'courses.content.lastUpdated')}: {dateLabel(page.updatedAt, isArabic)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(page)}
                    className="press inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold"
                    style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                  >
                    <Pencil className="w-4 h-4" />
                    {t(locale, 'courses.content.edit')}
                  </button>
                </div>
              )}
            </div>
          ))}

          {pages.length === 0 && (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-muted)' }}>
              {t(locale, 'courses.content.empty')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
