import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, FileText, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { questionApi, type FavoriteItem } from './services/question-api';
import { libraryApi } from '../library/services/library-api';

const difficultyLabel: Record<string, string> = {
  easy: 'سهل',
  medium: 'متوسط',
  hard: 'صعب',
};

export default function FavoritesPage() {
  const queryClient = useQueryClient();
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: questionApi.getFavorites });
  const removeFavorite = useMutation({
    mutationFn: (item: FavoriteItem) => item.targetType === 'file'
      ? libraryApi.toggleFavorite(item.targetId, true)
      : questionApi.toggleFavorite(item.targetId, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      toast.success('أزيل السؤال من المفضلة');
    },
    onError: () => toast.error('تعذر تحديث المفضلة. تحقق من اتصالك واستحقاقك.'),
  });

  if (favorites.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  }

  if (favorites.isError) {
    return (
      <section className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center">
        <h1 className="text-lg font-bold text-[var(--c-text)]">تعذر تحميل المفضلة</h1>
        <p className="mt-2 text-sm text-[var(--c-text-muted)]">تتطلب المفضلة جلسة واستحقاقاً صالحين للمحتوى.</p>
        <button onClick={() => favorites.refetch()} className="mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white">إعادة المحاولة</button>
      </section>
    );
  }

  const items = favorites.data ?? [];
  return (
    <section className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-[var(--c-text)]"><Bookmark className="w-6 h-6 text-[var(--c-primary-700)]" /> المفضلة</h1>
        <p className="mt-1 text-sm text-[var(--c-text-muted)]">أسئلة وملفات محفوظة ضمن المواد التي يتيحها استحقاقك الحالي.</p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] p-10 text-center">
          <Bookmark className="mx-auto mb-3 w-10 h-10 text-[var(--c-text-faint)]" />
          <h2 className="font-bold text-[var(--c-text)]">لا توجد عناصر محفوظة</h2>
          <p className="mt-1 text-sm text-[var(--c-text-muted)]">استخدم زر المفضلة من الأسئلة أو ملفات المكتبة للعودة إليها لاحقاً.</p>
          <Link to="/subjects" className="mt-4 inline-flex rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white">تصفح المواد</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item: FavoriteItem) => (
            <article key={item.favoriteId} className="flex gap-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
              {item.targetType === 'file' && <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--c-primary-700)]" />}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-semibold text-[var(--c-text)]">{item.title}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--c-text-muted)]">
                  {item.subtitle && <span>{item.subtitle}</span>}
                  <span className="rounded-full bg-[var(--c-bg)] px-2 py-1">{item.targetType === 'file' ? item.meta.toUpperCase() : (difficultyLabel[item.meta] ?? item.meta)}</span>
                </div>
              </div>
              <button
                onClick={() => removeFavorite.mutate(item)}
                disabled={removeFavorite.isPending}
                aria-label="إزالة من المفضلة"
                className="h-9 w-9 shrink-0 rounded-lg text-[var(--c-danger-500)] hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="mx-auto w-4 h-4" />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
