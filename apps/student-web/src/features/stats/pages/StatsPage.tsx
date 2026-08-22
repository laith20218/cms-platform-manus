import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Target, Flame, Clock, BarChart3, Trophy, Star, ChevronLeft, FileCheck2,
  TrendingUp, Loader2, BookOpen, Award,
} from 'lucide-react';
import { statsApi } from '../services/stats-api';

export default function StatsPage() {
  const [period, setPeriod] = useState<'all' | 'month' | 'week'>('all');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['my-stats', period],
    queryFn: () => statsApi.getMyStats(period),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  }

  if (!stats) return null;

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}س ${m}د` : `${m}د`;
  };

  const statCards = [
    { icon: Target, label: 'إجمالي الأسئلة', value: stats.totalQuestions, color: 'primary' },
    { icon: TrendingUp, label: 'نسبة الدقة', value: `${stats.accuracy.toFixed(0)}%`, color: 'success' },
    { icon: Flame, label: 'السلسلة الحالية', value: stats.currentStreak, color: 'warning' },
    { icon: Trophy, label: 'أطول سلسلة', value: stats.longestStreak, color: 'primary' },
    { icon: Clock, label: 'وقت الدراسة', value: formatTime(stats.studyTimeMinutes), color: 'accent' },
    { icon: BarChart3, label: 'اختبارات مكتملة', value: stats.examsCompleted, color: 'success' },
    { icon: BookOpen, label: 'محاضرات مكتملة', value: stats.completedLectures, color: 'success' },
    { icon: FileCheck2, label: 'ملفات مقروءة', value: stats.readFiles, color: 'accent' },
    { icon: Star, label: 'المفضلة', value: stats.favoriteCount, color: 'warning' },
    { icon: Award, label: 'الأسئلة الصحيحة', value: stats.correctAnswers, color: 'primary' },
  ];

  const colorMap: Record<string, { bg: string; text: string }> = {
    primary: { bg: 'var(--c-primary-50)', text: 'var(--c-primary-700)' },
    success: { bg: 'var(--c-success-50)', text: 'var(--c-success-500)' },
    accent: { bg: 'rgba(0,188,212,0.10)', text: 'var(--c-accent-500)' },
    warning: { bg: 'rgba(255,179,0,0.10)', text: 'var(--c-warning-500)' },
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-[var(--c-text-muted)]">
        <Link to="/dashboard" className="hover:text-[var(--c-primary-700)]">الرئيسية</Link>
        <ChevronLeft className="w-3 h-3" />
        <span className="font-semibold text-[var(--c-text)]">إحصائياتي</span>
      </div>

      {/* Title + Period Filter */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">إحصائياتي</h1>
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--c-neutral-100)]">
          {(['all', 'month', 'week'] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${period === p ? 'bg-[var(--c-surface)] text-[var(--c-text)] shadow-sm' : 'text-[var(--c-text-muted)]'}`}>
              {p === 'all' ? 'الكل' : p === 'month' ? 'الشهر' : 'الأسبوع'}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, i) => {
          const c = colorMap[stat.color] || colorMap.primary;
          return (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5">
              <div className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-2" style={{ background: c.bg, color: c.text }}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-extrabold text-[var(--c-text)]" lang="en">{stat.value}</div>
              <div className="text-[13px] text-[var(--c-text-muted)]">{stat.label}</div>
            </motion.div>
          );
        })}
      </div>

      {/* By Subject */}
      {stats.bySubject.length > 0 && (
        <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><BookOpen className="w-4 h-4 text-[var(--c-primary-700)]" /> الأداء حسب المادة</h2>
          <div className="space-y-3">
            {stats.bySubject.map((s) => (
              <div key={s.subjectId}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-[var(--c-text)]">{s.subjectName}</span>
                  <span className="text-xs text-[var(--c-text-muted)]" lang="en">{s.questionsAnswered} سؤال • {s.accuracy.toFixed(0)}%</span>
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

      {/* By Difficulty */}
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
              <div className="text-xs text-[var(--c-text-muted)]" lang="en">{d.data.answered} سؤال</div>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard Link */}
      <Link to="/leaderboard"
        className="block p-5 rounded-2xl text-white relative overflow-hidden transition-all hover:-translate-y-0.5"
        style={{ background: 'linear-gradient(135deg, #1976D2, #1565C0)', boxShadow: '0 8px 24px rgba(25,118,210,0.25)' }}>
        <div className="absolute -top-1/2 -left-[10%] w-[200px] h-[200px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(0,188,212,0.30), transparent)' }} />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold mb-1">🏆 لوحة المتصدرين</h3>
            <p className="text-sm text-white/80">قارن أداءك مع باقي الطلاب</p>
          </div>
          <ChevronLeft className="w-6 h-6 text-white/80" />
        </div>
      </Link>
    </div>
  );
}
