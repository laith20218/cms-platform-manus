import { Link } from 'react-router-dom';
import { Bookmark, FileText, Film, ListChecks } from 'lucide-react';
import type { FavoriteTargetType } from '../types';

/** Push 11.3 — per-tab empty state copy (the 11.2-DIAG Q3b hardcoded single message is
 *  gone): each type tab gets its own headline + a CTA into the matching browse page. */

const COPY: Record<FavoriteTargetType | 'all', { title: string; hint: string; cta: string; to: string; icon: typeof Bookmark }> = {
  all: {
    title: 'لا توجد عناصر محفوظة بعد',
    hint: 'استخدم زر المفضلة (⭐) من الحلقات، أو نجمة الأسئلة، أو أيقونة الملفات في المكتبة للعودة إليها لاحقًا.',
    cta: 'تصفح المواد',
    to: '/subjects',
    icon: Bookmark,
  },
  question: {
    title: 'لا توجد أسئلة محفوظة',
    hint: 'اضغط نجمة المفضلة أثناء حل أي سؤال لحفظه هنا.',
    cta: 'تصفح الأسئلة',
    to: '/subjects',
    icon: ListChecks,
  },
  file: {
    title: 'لا توجد ملفات محفوظة',
    hint: 'اضغط أيقونة العلامة المرجعية على أي بطاقة ملف في المكتبة لحفظها هنا.',
    cta: 'تصفح المكتبة',
    to: '/my-studies?tab=library',
    icon: FileText,
  },
  episode: {
    title: 'لا توجد حلقات محفوظة',
    hint: 'اضغط زر النجمة ⭐ داخل مشغل الفيديو لحفظ الحلقة هنا.',
    cta: 'تصفح الدورات',
    to: '/my-studies?tab=courses',
    icon: Film,
  },
};

export interface FavoritesEmptyStateProps {
  type: FavoriteTargetType | 'all';
}

export function FavoritesEmptyState({ type }: FavoritesEmptyStateProps) {
  const copy = COPY[type];
  const Icon = copy.icon;
  return (
    <div
      data-testid="favorites-empty"
      className="rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] p-8 text-center sm:p-10"
    >
      <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--c-primary-50)] text-[var(--c-primary-700)]">
        <Icon className="h-7 w-7" strokeWidth={1.75} />
      </span>
      <h2 className="text-base font-bold text-[var(--c-text)]">{copy.title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[var(--c-text-muted)]">{copy.hint}</p>
      <Link
        to={copy.to}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--c-primary-700)] px-6 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]"
      >
        {copy.cta}
      </Link>
    </div>
  );
}
