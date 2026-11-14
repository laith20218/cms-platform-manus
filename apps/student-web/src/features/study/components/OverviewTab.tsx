import { useQuery } from '@tanstack/react-query';
import { BookOpen, Clock, Target, Trophy } from 'lucide-react';
import { useAuth } from '@/app/providers/useAuth';
import { statsApi } from '@/features/stats/services/stats-api';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';

function formatStudyTime(minutes: number) {
  if (minutes < 60) return `${minutes} د`;
  return `${(minutes / 60).toFixed(1)} س`;
}

/**
 * /study → «نظرة عامة» tab (Wave 15.4.1 parallel build): the Dashboard's
 * greeting + 4 headline stat cards, duplicated into the new 6-tab hub.
 * The legacy my-studies hub stays untouched until the 15.4.4 cutover.
 *
 * TODO 15.4.5: unify with DashboardPage's hero via a shared
 * <StudyOverviewHero> component (DEBT-DASHBOARD-DUP).
 */
export function OverviewTab() {
  const { user } = useAuth();
  const stats = useQuery({ queryKey: ['stats', 'me', 'all'], queryFn: () => statsApi.getMyStats('all') });

  if (stats.isLoading) {
    return (
      <section data-testid="study-overview-tab" className="space-y-4">
        <Skeleton className="w-64 h-8" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </section>
    );
  }

  if (stats.isError || !stats.data) {
    return (
      <section
        data-testid="study-overview-tab"
        role="alert"
        className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"
      >
        <h2 className="text-lg font-bold text-[var(--c-text)]">تعذر تحميل الإحصاءات</h2>
        <button
          onClick={() => stats.refetch()}
          className="mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white"
        >
          إعادة المحاولة
        </button>
      </section>
    );
  }

  const data = stats.data;
  const cards = [
    { key: 'questions', label: 'أسئلة مجابة', value: data.totalQuestions, icon: BookOpen },
    { key: 'accuracy', label: 'نسبة الدقة', value: `${data.accuracy.toFixed(0)}%`, icon: Target },
    { key: 'time', label: 'وقت الدراسة', value: formatStudyTime(data.studyTimeMinutes), icon: Clock },
    { key: 'exams', label: 'اختبارات مكتملة', value: data.examsCompleted, icon: Trophy },
  ];

  return (
    <section data-testid="study-overview-tab" className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[var(--c-text)]">
          أهلاً، {user?.fullName?.split(' ')[0] || 'طالب'} 👋
        </h2>
        <p className="mt-1 text-sm text-[var(--c-text-soft)]">هذه الإحصاءات تُحسب من محاولاتك واختباراتك المسجلة في المنصة.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <article
            key={card.key}
            data-testid={`study-stat-${card.key}`}
            className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5"
          >
            <card.icon className="h-5 w-5 text-[var(--c-primary-700)]" />
            <div className="mt-3 text-2xl font-extrabold text-[var(--c-text)]" lang="en">{card.value}</div>
            <div className="mt-1 text-[13px] text-[var(--c-text-muted)]">{card.label}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
