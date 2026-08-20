import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Users, FileText, Ticket, BookOpen, BarChart3, DollarSign,
  TrendingUp, TrendingDown, AlertTriangle, Activity,
  ChevronLeft, Loader2,
} from 'lucide-react';
import { adminApi } from '../services/admin-api';
import { formatRelativeTime } from '@/utils';

export default function AdminDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.getStats,
  });

  const { data: activity } = useQuery({
    queryKey: ['admin-activity'],
    queryFn: () => adminApi.getRecentActivity(8),
  });

  const { data: revenue } = useQuery({
    queryKey: ['admin-revenue'],
    queryFn: () => adminApi.getRevenue(6),
  });

  const { data: topSubjects } = useQuery({
    queryKey: ['admin-top-subjects'],
    queryFn: () => adminApi.getTopSubjects(5),
  });

  const { data: reports } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: adminApi.getReportsSummary,
  });

  if (statsLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  }

  if (!stats) return null;

  const statCards = [
    { icon: Users, label: 'إجمالي الطلاب', value: stats.totalStudents, color: 'primary', trend: null },
    { icon: Activity, label: 'نشطون اليوم', value: stats.activeStudentsToday, color: 'success', trend: null },
    { icon: FileText, label: 'إجمالي الأسئلة', value: stats.totalQuestions, color: 'accent', trend: null },
    { icon: Ticket, label: 'أكواد نشطة', value: stats.totalActiveCodes, color: 'warning', trend: null },
    { icon: BookOpen, label: 'اشتراكات نشطة', value: stats.totalActiveSubscriptions, color: 'primary', trend: null },
    { icon: DollarSign, label: 'إيراد الشهر', value: `${stats.monthlyRevenue.toLocaleString('ar')} ل.س`, color: 'success', trend: stats.revenueChangePercent },
    { icon: BookOpen, label: 'ملفات المكتبة', value: stats.totalLibraryFiles, color: 'accent', trend: null },
    { icon: AlertTriangle, label: 'بلاغات معلّقة', value: stats.pendingReports, color: 'danger', trend: null },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="text-xs text-[var(--c-text-muted)]">
        <span className="font-semibold text-[var(--c-text)]">لوحة الإدارة</span>
      </div>

      {/* Page Title */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">لوحة المعلومات</h1>
        <span className="text-xs text-[var(--c-text-muted)]">آخر تحديث: {new Date().toLocaleTimeString('ar')}</span>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, i) => {
          const colorMap: Record<string, { bg: string; text: string }> = {
            primary: { bg: 'var(--c-primary-50)', text: 'var(--c-primary-700)' },
            success: { bg: 'var(--c-success-50)', text: 'var(--c-success-500)' },
            accent: { bg: 'rgba(0,188,212,0.10)', text: 'var(--c-accent-500)' },
            warning: { bg: 'rgba(255,179,0,0.10)', text: 'var(--c-warning-500)' },
            danger: { bg: 'rgba(255,82,82,0.08)', text: 'var(--c-danger-500)' },
          };
          const c = colorMap[stat.color] || colorMap.primary;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center" style={{ background: c.bg, color: c.text }}>
                  <stat.icon className="w-5 h-5" />
                </div>
                {stat.trend !== null && stat.trend !== undefined && (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${stat.trend >= 0 ? 'bg-[var(--c-success-50)] text-[var(--c-success-700)]' : 'bg-[rgba(255,82,82,0.08)] text-[var(--c-danger-500)]'}`}>
                    {stat.trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    <span lang="en">{Math.abs(stat.trend).toFixed(0)}%</span>
                  </span>
                )}
              </div>
              <div className="text-2xl font-extrabold text-[var(--c-text)]" lang="en">{stat.value}</div>
              <div className="text-[13px] text-[var(--c-text-muted)]">{stat.label}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Revenue Chart (simplified bar chart) */}
      {revenue && revenue.length > 0 && (
        <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4 text-[var(--c-success-500)]" /> الإيرادات (آخر 6 أشهر)</h2>
          <div className="flex items-end gap-2 h-40">
            {revenue.map((r, i) => {
              const maxRevenue = Math.max(...revenue.map(x => x.revenue), 1);
              const height = (r.revenue / maxRevenue) * 100;
              return (
                <div key={r.period} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[10px] font-bold text-[var(--c-text-muted)]" lang="en">{(r.revenue / 1000).toFixed(0)}K</div>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ delay: i * 0.1, duration: 0.5 }}
                    className="w-full rounded-t-lg min-h-[2px]"
                    style={{ background: 'var(--grad-primary)' }}
                  />
                  <div className="text-[10px] text-[var(--c-text-muted)]" lang="en">{r.period.split('-')[1]}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-[var(--c-primary-700)]" /> آخر النشاطات</h2>
          <div className="space-y-3">
            {(activity || []).map((act) => (
              <div key={act.id} className="flex items-start gap-3 pb-3 border-b border-[var(--c-border)] last:border-0 last:pb-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  act.type === 'registration' ? 'bg-[var(--c-primary-50)] text-[var(--c-primary-700)]' :
                  act.type === 'subscription' ? 'bg-[var(--c-success-50)] text-[var(--c-success-500)]' :
                  'bg-[rgba(255,82,82,0.08)] text-[var(--c-danger-500)]'
                }`}>
                  {act.type === 'registration' ? <Users className="w-4 h-4" /> : act.type === 'subscription' ? <Ticket className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--c-text-soft)] truncate">{act.description}</p>
                  <p className="text-xs text-[var(--c-text-muted)]">{formatRelativeTime(act.createdAt)}</p>
                </div>
              </div>
            ))}
            {!activity?.length && <p className="text-sm text-[var(--c-text-muted)] text-center py-4">لا توجد نشاطات</p>}
          </div>
        </div>

        {/* Top Subjects */}
        <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[var(--c-accent-500)]" /> أكثر المواد نشاطاً</h2>
          <div className="space-y-3">
            {(topSubjects || []).map((s, i) => (
              <div key={s.subjectId} className="flex items-center gap-3">
                <span className="text-xs font-bold w-5 text-center text-[var(--c-text-muted)]" lang="en">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-[var(--c-text)]">{s.subjectName}</span>
                    <span className="text-xs text-[var(--c-text-muted)]" lang="en">{s.questionsAnswered} محاولة</span>
                  </div>
                  <div className="h-1.5 bg-[var(--c-neutral-200)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${s.averageAccuracy}%`, background: 'var(--grad-success)' }} />
                  </div>
                </div>
                <span className="text-xs font-bold w-12 text-end text-[var(--c-success-700)]" lang="en">{s.averageAccuracy.toFixed(0)}%</span>
              </div>
            ))}
            {!topSubjects?.length && <p className="text-sm text-[var(--c-text-muted)] text-center py-4">لا توجد بيانات</p>}
          </div>
        </div>
      </div>

      {/* Reports Summary */}
      {reports && (
        <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-[var(--c-warning-500)]" /> البلاغات</h2>
            <Link to="/admin/reports" className="text-xs font-semibold text-[var(--c-primary-700)] hover:underline flex items-center gap-1">
              عرض الكل <ChevronLeft className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center"><div className="text-xl font-bold" lang="en">{reports.totalReports}</div><div className="text-xs text-[var(--c-text-muted)]">الإجمالي</div></div>
            <div className="text-center"><div className="text-xl font-bold text-[var(--c-warning-500)]" lang="en">{reports.pendingReports}</div><div className="text-xs text-[var(--c-text-muted)]">معلّق</div></div>
            <div className="text-center"><div className="text-xl font-bold text-[var(--c-success-500)]" lang="en">{reports.resolvedReports}</div><div className="text-xs text-[var(--c-text-muted)]">محلول</div></div>
            <div className="text-center"><div className="text-xl font-bold text-[var(--c-text-muted)]" lang="en">{reports.rejectedReports}</div><div className="text-xs text-[var(--c-text-muted)]">مرفوض</div></div>
          </div>
          {reports.recentReports.length > 0 && (
            <div className="space-y-2">
              {reports.recentReports.slice(0, 3).map((r) => (
                <div key={r.questionId} className="flex items-center gap-3 p-2 rounded-lg bg-[var(--c-neutral-50)]">
                  <AlertTriangle className="w-4 h-4 text-[var(--c-warning-500)] shrink-0" />
                  <p className="text-sm text-[var(--c-text-soft)] flex-1 truncate">{r.questionText}</p>
                  <span className="text-xs font-bold text-[var(--c-danger-500)]" lang="en">{r.reportsCount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
