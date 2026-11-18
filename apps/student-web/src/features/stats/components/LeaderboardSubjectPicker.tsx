import { useSearchParams } from 'react-router-dom';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { ApiErrorDetail } from '@/components/common/ApiErrorDetail';

/**
 * W15.4.4.0b — the leaderboard is subject-scoped (backend W15.4.4.0a),
 * so when the URL carries no ?subjectId the student first picks one of
 * their entitled subjects (useMySubjects = active grants). The pick is
 * written into the URL as a deliberate navigation (push), which keeps
 * the hub tab intact and makes the browser back button return here.
 */
export default function LeaderboardSubjectPicker() {
  const { data, isLoading, isError, error, refetch } = useMySubjects();
  const [searchParams, setSearchParams] = useSearchParams();

  const onPick = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('subjectId', id);
    setSearchParams(next); // push (default) — deliberate navigation
  };

  return (
    <section data-testid="leaderboard-subject-picker" className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[var(--c-text)]">اختر مادة</h2>
        <p className="mt-1 text-sm text-[var(--c-text-soft)]">
          لكل مادة لوحة متصدرين مستقلة. اختر مادة لعرض ترتيب الطلاب المشاركين فيها.
        </p>
      </div>

      {isError ? (
        <div role="alert" className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center">
          <p className="text-lg font-bold text-[var(--c-text)]">تعذر تحميل قائمة المواد</p>
          {/* W16.3 — surface the backend's Arabic detail under the heading. */}
          <ApiErrorDetail error={error} />
          <button
            type="button"
            onClick={() => refetch()}
            className="press mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg-hover)]" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <p className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-sm text-[var(--c-text-muted)]">
          لم تفعّل أي مادة بعد — فعّل مادة أولاً من صفحة المواد.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid={`leaderboard-subject-${s.id}`}
              onClick={() => onPick(s.id)}
              className="press flex items-center gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 text-start transition-colors hover:bg-[var(--c-bg-hover)]"
            >
              {s.color && (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              )}
              <span className="truncate font-semibold text-[var(--c-text)]">{s.nameAr}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
