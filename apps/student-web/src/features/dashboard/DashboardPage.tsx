import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Clock, Target, Trophy, Bookmark } from 'lucide-react';
import { useAuth } from '@/app/providers/useAuth';
import { statsApi } from '@/features/stats/services/stats-api';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { MySubjectsSection } from './MySubjectsSection';
import { ContinueCard } from './ContinueCard';
import { QuickAccessSection } from './QuickAccessSection';

function formatStudyTime(minutes: number) {
  if (minutes < 60) return `${minutes} د`;
  return `${(minutes / 60).toFixed(1)} س`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const stats = useQuery({ queryKey: ['stats', 'me', 'all'], queryFn: () => statsApi.getMyStats('all') });

  if (stats.isLoading) return (
    <div className="space-y-6">
      <div><Skeleton className="w-64 h-8" /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
      <Skeleton className="w-full h-64" />
    </div>
  );
  if (stats.isError || !stats.data) return <section className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"><h1 className="text-lg font-bold text-[var(--c-text)]">تعذر تحميل لوحة التحكم</h1><button onClick={() => stats.refetch()} className="mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white">إعادة المحاولة</button></section>;

  const data = stats.data;
  const cards = [
    { key: 'questions', label: 'أسئلة مجابة', value: data.totalQuestions, icon: BookOpen },
    { key: 'accuracy', label: 'نسبة الدقة', value: `${data.accuracy.toFixed(0)}%`, icon: Target },
    { key: 'time', label: 'وقت الدراسة', value: formatStudyTime(data.studyTimeMinutes), icon: Clock },
    { key: 'exams', label: 'اختبارات مكتملة', value: data.examsCompleted, icon: Trophy },
  ];

  return <main className="space-y-6">
    {/* 15.2 (D6): plain greeting block — was the glass hero card. Streak and
        favorites moved to inline chips; «عرض المفضلة» became the favorites chip. */}
    <div data-testid="dashboard-hero" className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--c-text)]">أهلاً، {user?.fullName?.split(' ')[0] || 'طالب'} 👋</h1>
        <p className="mt-1 text-sm text-[var(--c-text-soft)]">هذه الإحصاءات تُحسب من محاولاتك واختباراتك المسجلة في المنصة.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-3 py-1.5 text-sm font-medium">🔥 السلسلة: <strong lang="en">{data.currentStreak}</strong> يوم</span>
        <Link to="/favorites" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--c-bg-hover)] text-[var(--c-text-muted)] px-3 py-1.5 text-sm hover:text-[var(--c-text)] transition-colors">
          <Bookmark className="h-3.5 w-3.5" />
          المفضلة: <strong lang="en">{data.favoriteCount}</strong>
        </Link>
      </div>
    </div>

    {/* 15.2 (D3): gradient continue card. */}
    <ContinueCard bySubject={data.bySubject} />

    <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">{cards.map(card => <article key={card.key} data-testid={`stat-card-${card.key}`} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5"><card.icon className="h-5 w-5 text-[var(--c-primary-700)]" /><div className="mt-3 text-2xl font-extrabold text-[var(--c-text)]" lang="en">{card.value}</div><div className="mt-1 text-[13px] text-[var(--c-text-muted)]">{card.label}</div></article>)}</section>

    {/* Wave 14.3 PR #2 — entitled subjects first: visible even with zero attempts. */}
    {/* 15.2 (D1/D5): progress rows merged into «موادي»; the separate
        «التقدّم حسب المادة» grid was deleted. */}
    <MySubjectsSection bySubject={data.bySubject} />

    {/* 15.2 (D2): quick access with per-subject filter chips. */}
    <QuickAccessSection />
  </main>;
}
