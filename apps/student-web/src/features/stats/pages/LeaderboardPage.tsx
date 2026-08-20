import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Trophy, Medal, ChevronLeft, Loader2, Crown, type LucideIcon } from 'lucide-react';
import { statsApi, type LeaderboardEntry } from '../services/stats-api';

type RankConfig = { icon: LucideIcon; color: string; bg: string; label: string };

const rankConfig: RankConfig[] = [
  { icon: Crown, color: '#FFD700', bg: 'rgba(255,215,0,0.15)', label: 'الأول' },
  { icon: Medal, color: '#C0C0C0', bg: 'rgba(192,192,192,0.15)', label: 'الثاني' },
  { icon: Medal, color: '#CD7F32', bg: 'rgba(205,127,50,0.15)', label: 'الثالث' },
];

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<'all' | 'month' | 'week'>('all');

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => statsApi.getLeaderboard('all', undefined, period, 100),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  }

  if (!leaderboard) return null;

  const top3 = leaderboard.topStudents.slice(0, 3);
  const rest = leaderboard.topStudents.slice(3);

  return (
    <div className="space-y-5 max-w-[680px] mx-auto">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-[var(--c-text-muted)]">
        <Link to="/dashboard" className="hover:text-[var(--c-primary-700)]">الرئيسية</Link>
        <ChevronLeft className="w-3 h-3" />
        <Link to="/stats" className="hover:text-[var(--c-primary-700)]">الإحصائيات</Link>
        <ChevronLeft className="w-3 h-3" />
        <span className="font-semibold text-[var(--c-text)]">المتصدرين</span>
      </div>

      {/* Title + Period */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="w-6 h-6 text-[var(--c-warning-500)]" /> لوحة المتصدرين</h1>
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--c-neutral-100)]">
          {(['all', 'month', 'week'] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${period === p ? 'bg-[var(--c-surface)] text-[var(--c-text)] shadow-sm' : 'text-[var(--c-text-muted)]'}`}>
              {p === 'all' ? 'الكل' : p === 'month' ? 'الشهر' : 'الأسبوع'}
            </button>
          ))}
        </div>
      </div>

      {/* Podium (Top 3) */}
      {top3.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 items-end">
          {/* 2nd place */}
          <PodiumCard entry={top3[1]} rank={2} config={rankConfig[1]} height="h-32" />
          {/* 1st place (taller) */}
          <PodiumCard entry={top3[0]} rank={1} config={rankConfig[0]} height="h-40" />
          {/* 3rd place */}
          <PodiumCard entry={top3[2]} rank={3} config={rankConfig[2]} height="h-28" />
        </div>
      )}

      {/* Your Rank (if outside top 3) */}
      {leaderboard.yourRank && leaderboard.yourRank.rank > 3 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 rounded-xl border-2 border-[var(--c-primary-500)] bg-[var(--c-primary-50)]">
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-extrabold text-white" style={{ background: 'var(--grad-primary)' }} lang="en">
            #{leaderboard.yourRank.rank}
          </div>
          <div className="flex-1">
            <div className="font-bold text-[var(--c-text)]">{leaderboard.yourRank.studentName} <span className="text-xs text-[var(--c-primary-700)] font-medium">(أنت)</span></div>
            <div className="text-xs text-[var(--c-text-muted)]" lang="en">{leaderboard.yourRank.questionsAnswered} سؤال • {leaderboard.yourRank.accuracy.toFixed(0)}% دقة</div>
          </div>
        </motion.div>
      )}

      {/* Rest of leaderboard */}
      <div className="space-y-2">
        {rest.map((entry, i) => (
          <motion.div key={entry.studentId}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
              entry.isYou ? 'border-[var(--c-primary-500)] bg-[var(--c-primary-50)]' : 'border-[var(--c-border)] bg-[var(--c-surface)]'
            }`}>
            <span className="w-8 text-center text-sm font-bold text-[var(--c-text-muted)]" lang="en">#{entry.rank}</span>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ background: entry.isYou ? 'var(--grad-primary)' : 'var(--c-neutral-400)' }}>
              {entry.studentName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[var(--c-text)] truncate">
                {entry.studentName}
                {entry.isYou && <span className="text-xs text-[var(--c-primary-700)] mr-1">(أنت)</span>}
              </div>
              <div className="text-xs text-[var(--c-text-muted)]" lang="en">{entry.questionsAnswered} سؤال</div>
            </div>
            <div className="text-end">
              <div className="text-sm font-bold" style={{ color: entry.accuracy >= 70 ? 'var(--c-success-500)' : entry.accuracy >= 50 ? 'var(--c-warning-500)' : 'var(--c-danger-500)' }} lang="en">
                {entry.accuracy.toFixed(0)}%
              </div>
              <div className="text-xs text-[var(--c-text-muted)]">دقة</div>
            </div>
          </motion.div>
        ))}
      </div>

      {leaderboard.topStudents.length === 0 && (
        <div className="text-center py-20">
          <Trophy className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-muted)] opacity-50" />
          <p className="text-[var(--c-text-muted)]">لا توجد بيانات كافية بعد</p>
        </div>
      )}
    </div>
  );
}

function PodiumCard({ entry, rank, config, height }: { entry: LeaderboardEntry; rank: number; config: RankConfig; height: string }) {
  const Icon = config.icon;
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: rank * 0.1 }}
      className="flex flex-col items-center">
      {/* Avatar */}
      <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg mb-1 shrink-0"
        style={{ background: rank === 1 ? 'var(--grad-primary)' : 'var(--c-neutral-400)', border: rank === 1 ? '3px solid #FFD700' : 'none' }}>
        {entry.studentName.charAt(0)}
      </div>
      <div className="text-xs font-medium text-[var(--c-text)] truncate max-w-[80px] text-center mb-1">{entry.studentName}</div>
      <div className="text-[10px] text-[var(--c-text-muted)] mb-2" lang="en">{entry.accuracy.toFixed(0)}%</div>
      {/* Podium */}
      <div className={`w-full ${height} rounded-t-xl flex flex-col items-center justify-center`}
        style={{ background: config.bg, borderTop: `3px solid ${config.color}` }}>
        <Icon className="w-6 h-6 mb-1" style={{ color: config.color }} />
        <span className="text-lg font-extrabold" style={{ color: config.color }} lang="en">#{rank}</span>
      </div>
    </motion.div>
  );
}
