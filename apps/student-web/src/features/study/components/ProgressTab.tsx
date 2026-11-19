import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart3, BookOpen, Loader2 } from 'lucide-react';
import { statsApi } from '@/features/stats/services/stats-api';

/**
 * /study → «تقدمي» tab (Wave 15.4.1 parallel build): the StatsPage
 * bySubject + byDifficulty grids, copied with a local useQuery that
 * shares the ['stats','me','all'] cache with the Dashboard/OverviewTab —
 * one fetch serves every surface.
 *
 * TODO 15.4.5: unify with StatsPage via shared BySubjectGrid /
 * ByDifficultyGrid components (DEBT-STATS-EXTRACTION).
 */
export function ProgressTab() {
  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ['stats', 'me', 'all'],
    queryFn: () => statsApi.getMyStats('all'),
  });

  if (isLoading) {
    return (
      <section data-testid="study-progress-tab" className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" />
      </section>
    );
  }

  if (isError || !stats) {
    return (
      <section
        data-testid="study-progress-tab"
        role="alert"
        className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"
      >
        <h2 className="text-lg font-bold text-[var(--c-text)]">تعذّر تحميل التقدم</h2>
        <button
          onClick={() => refetch()}
          className="mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white"
        >
          إعادة المحاولة
        </button>
      </section>
    );
  }

  return (
    <section data-testid="study-progress-tab" className="space-y-6">
      {/* الأداء حسب المادة — copied from StatsPage:104-122. */}
      {stats.bySubject.length > 0 && (
        <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><BookOpen className="w-4 h-4 text-[var(--c-primary-700)]" /> الأداء حسب المادة</h2>
          <div className="space-y-3">
            {stats.bySubject.map((s) => (
              <div key={s.subjectId}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-[var(--c-text)]">{s.subjectName}</span>
                  <span className="text-xs text-[var(--c-text-muted)]"><span lang="en">{s.questionsAnswered}</span> سؤال • <span lang="en">{s.accuracy.toFixed(0)}%</span></span>
                </div>
                <div className="h-2 bg-[var(--c-neutral-200)] rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${s.accuracy}%` }} transition={{ duration: 0.5 }}
                    className="h-full rounded-full" style={{ background: s.accuracy >= 70 ? 'var(--grad-success)' : s.accuracy >= 50 ? 'var(--grad-warning)' : 'var(--grad-danger)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* الأداء حسب الصعوبة — copied from StatsPage:124-140. */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5">
        <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[var(--c-accent-500)]" /> الأداء حسب الصعوبة</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'سهل', data: stats.byDifficulty.easy, color: 'var(--c-success-500)' },
            { label: 'متوسط', data: stats.byDifficulty.medium, color: 'var(--c-warning-500)' },
            { label: 'صعب', data: stats.byDifficulty.hard, color: 'var(--c-danger-500)' },
          ].map((d) => (
            <div key={d.label} className="text-center p-3 rounded-xl bg-[var(--c-neutral-50)]">
              <div className="text-xs text-[var(--c-text-muted)] mb-1">{d.label}</div>
              <div className="text-2xl font-extrabold mb-1" style={{ color: d.color }} lang="en">{d.data.accuracy.toFixed(0)}%</div>
              <div className="text-xs text-[var(--c-text-muted)]"><span lang="en">{d.data.answered}</span> سؤال</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
