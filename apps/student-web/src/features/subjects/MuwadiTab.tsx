import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { MuwadiCard } from './MuwadiCard';

/**
 * MuwadiTab — W15.3.3 «موادي» tab of /subjects.
 *
 * The student's entitled subjects as a compact MuwadiCard grid — no cascade
 * selection needed; the entitlement catalog (useMySubjects) is the whole data
 * source. Owns its loading / error / empty states:
 * - error offers an inline retry (refetch), no dead end;
 * - empty points back to the «الهيكل الأكاديمي» tab — deliberately WITHOUT a
 *   /activate-code CTA: the structure tab's semester empty state already owns
 *   that action, so the page never shows two competing activation CTAs.
 */
export function MuwadiTab() {
  const mySubjects = useMySubjects();

  return (
    <section data-testid="muwadi-tab" className="space-y-4">
      {mySubjects.isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl animate-pulse bg-[var(--c-bg-hover)]" />
          ))}
        </div>
      ) : mySubjects.isError ? (
        <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center">
          <p className="text-sm text-[var(--c-text-muted)]">تعذر تحميل موادك</p>
          <button
            type="button"
            onClick={() => mySubjects.refetch()}
            className="press mt-3 inline-flex min-h-11 items-center rounded-xl bg-[var(--c-primary-700)] px-4 text-sm font-semibold text-white"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : mySubjects.data && mySubjects.data.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {mySubjects.data.map((subject) => (
            <MuwadiCard key={subject.id} subject={subject} />
          ))}
        </div>
      ) : (
        <div
          data-testid="muwadi-empty"
          className="rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-text-muted)]"
        >
          لم تفعّل أي مادة بعد — تصفح الهيكل الأكاديمي لتفعيل مادة.
        </div>
      )}
    </section>
  );
}
