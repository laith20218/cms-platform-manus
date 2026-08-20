import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, BookOpen, Clock, Target, Trophy, Loader2, Bookmark } from 'lucide-react';
import { useAuth } from '@/app/providers/useAuth';
import { statsApi } from '@/features/stats/services/stats-api';

function formatStudyTime(minutes: number) {
  if (minutes < 60) return `${minutes} د`;
  return `${(minutes / 60).toFixed(1)} س`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const stats = useQuery({ queryKey: ['stats', 'me', 'all'], queryFn: () => statsApi.getMyStats('all') });

  if (stats.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  if (stats.isError || !stats.data) return <section className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"><h1 className="text-lg font-bold text-[var(--c-text)]">تعذر تحميل لوحة التحكم</h1><button onClick={() => stats.refetch()} className="mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white">إعادة المحاولة</button></section>;

  const data = stats.data;
  const cards = [
    { label: 'أسئلة مجابة', value: data.totalQuestions, icon: BookOpen },
    { label: 'نسبة الدقة', value: `${data.accuracy.toFixed(0)}%`, icon: Target },
    { label: 'وقت الدراسة', value: formatStudyTime(data.studyTimeMinutes), icon: Clock },
    { label: 'اختبارات مكتملة', value: data.examsCompleted, icon: Trophy },
  ];

  return <main className="space-y-6">
    <section className="rounded-3xl border p-7 backdrop-blur-2xl" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)', boxShadow: 'var(--shadow-glass)' }}>
      <h1 className="text-2xl font-extrabold text-[var(--c-text)]">أهلاً، {user?.fullName?.split(' ')[0] || 'طالب'}.</h1>
      <p className="mt-2 text-sm text-[var(--c-text-soft)]">هذه الإحصاءات تُحسب من محاولاتك واختباراتك المسجلة في المنصة.</p>
      <div className="mt-5 flex flex-wrap gap-6 border-t border-[var(--c-border)] pt-5 text-sm"><span className="text-[var(--c-text-muted)]">السلسلة الحالية: <strong className="text-[var(--c-text)]" lang="en">{data.currentStreak}</strong> يوم</span><span className="text-[var(--c-text-muted)]">المفضلة: <strong className="text-[var(--c-text)]" lang="en">{data.favoriteCount}</strong></span><Link to="/favorites" className="inline-flex items-center gap-1 font-semibold text-[var(--c-primary-700)]"><Bookmark className="h-4 w-4" /> عرض المفضلة</Link></div>
    </section>

    <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">{cards.map(card => <article key={card.label} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5"><card.icon className="h-5 w-5 text-[var(--c-primary-700)]" /><div className="mt-3 text-2xl font-extrabold text-[var(--c-text)]" lang="en">{card.value}</div><div className="mt-1 text-[13px] text-[var(--c-text-muted)]">{card.label}</div></article>)}</section>

    <section><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-[var(--c-text)]">التقدّم حسب المادة</h2><Link to="/subjects" className="text-sm font-semibold text-[var(--c-primary-700)]">تصفح المواد</Link></div>{data.bySubject.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-text-muted)]">لا توجد محاولات مسجلة بعد. ابدأ من صفحة المواد.</div> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{data.bySubject.map(subject => <article key={subject.subjectId} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--c-primary-50)] text-[var(--c-primary-700)]"><BarChart3 className="h-5 w-5" /></div><div className="min-w-0"><h3 className="truncate font-bold text-[var(--c-text)]">{subject.subjectName}</h3><p className="text-xs text-[var(--c-text-muted)]"><span lang="en">{subject.questionsAnswered}</span> سؤال مميز</p></div></div><div className="mt-4 flex justify-between text-xs text-[var(--c-text-muted)]"><span>الإكمال</span><strong className="text-[var(--c-primary-700)]" lang="en">{Math.min(100, subject.completedPercentage).toFixed(0)}%</strong></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--c-bg)]"><div className="h-full rounded-full bg-[var(--c-primary-700)]" style={{ width: `${Math.min(100, subject.completedPercentage)}%` }} /></div><p className="mt-3 text-xs text-[var(--c-text-muted)]">الدقة: <span lang="en">{subject.accuracy.toFixed(0)}%</span></p></article>)}</div>}</section>
  </main>;
}
