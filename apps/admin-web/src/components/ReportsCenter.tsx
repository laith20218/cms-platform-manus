import { useEffect, useState } from 'react';
import {
  BarChart, Bar, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Activity, BarChart3, FileText, LoaderCircle, TrendingUp, Users,
  BookOpenCheck, Target, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { apiRequest } from '../lib/api';

type Props = { token: string; isArabic: boolean; onError: (message: string) => void };

type RevenueData = { period: string; revenue: number; codesSold: number; newSubscriptions: number };
type GrowthData = { date: string; newRegistrations: number; activeUsers: number };
type TopSubject = { subjectId: string; subjectName: string; questionsAnswered: number; averageAccuracy: number; activeStudents: number };
type ReportsSummary = { totalReports: number; pendingReports: number; resolvedReports: number; rejectedReports: number; recentReports: Array<{ questionId: string; questionText: string; reportsCount: number; mostCommonReason: string; lastReportedAt: string }> };
type GlobalStats = {
  totalStudents: number; totalQuestions: number; totalAnswers: number; platformAccuracy: number;
  totalExamSessions: number; totalLibraryViews: number;
  mostActiveSubjects: Array<{ subjectId: string; subjectName: string; questionsAnswered: number; accuracy: number }>;
  hardestSubjects: Array<{ subjectId: string; subjectName: string; questionsAnswered: number; accuracy: number }>;
  mostViewedFiles: Array<{ fileId: string; title: string; type: string; viewsCount: number }>;
  hourlyActivity: Array<{ hour: number; uniqueStudents: number; totalAnswers: number }>;
};

const COLORS = ['#0d746b', '#12877d', '#1a9b90', '#4cb8ae', '#35718a', '#a36c1f', '#198566', '#b6473d'];

export function ReportsCenter({ token, isArabic, onError }: Props) {
  const [revenue, setRevenue] = useState<RevenueData[]>([]);
  const [growth, setGrowth] = useState<GrowthData[]>([]);
  const [topSubjects, setTopSubjects] = useState<TopSubject[]>([]);
  const [reportsSummary, setReportsSummary] = useState<ReportsSummary | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const request = async <T,>(path: string) => apiRequest<T>(path, token);

  const loadAll = async () => {
    setRefreshing(true);
    try {
      const [rev, grw, top, rep, glob] = await Promise.allSettled([
        request<RevenueData[]>('/api/v1/admin/revenue?months=6'),
        request<GrowthData[]>('/api/v1/admin/student-growth?days=30'),
        request<TopSubject[]>('/api/v1/admin/top-subjects'),
        request<ReportsSummary>('/api/v1/admin/reports/summary'),
        request<GlobalStats>('/api/v1/stats/global'),
      ]);
      if (rev.status === 'fulfilled') setRevenue(rev.value);
      if (grw.status === 'fulfilled') setGrowth(grw.value);
      if (top.status === 'fulfilled') setTopSubjects(top.value);
      if (rep.status === 'fulfilled') setReportsSummary(rep.value);
      if (glob.status === 'fulfilled') setGlobalStats(glob.value);
    } catch (error) {
      onError(error instanceof Error ? error.message : isArabic ? 'تعذّر تحميل التقارير' : 'Could not load reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const doLoad = async () => {
      setRefreshing(true);
      try {
        const [rev, grw, top, rep, glob] = await Promise.allSettled([
          request<RevenueData[]>('/api/v1/admin/revenue?months=6'),
          request<GrowthData[]>('/api/v1/admin/student-growth?days=30'),
          request<TopSubject[]>('/api/v1/admin/top-subjects'),
          request<ReportsSummary>('/api/v1/admin/reports/summary'),
          request<GlobalStats>('/api/v1/stats/global'),
        ]);
        if (cancelled) return;
        if (rev.status === 'fulfilled') setRevenue(rev.value);
        if (grw.status === 'fulfilled') setGrowth(grw.value);
        if (top.status === 'fulfilled') setTopSubjects(top.value);
        if (rep.status === 'fulfilled') setReportsSummary(rep.value);
        if (glob.status === 'fulfilled') setGlobalStats(glob.value);
      } catch (error) {
        if (!cancelled) onError(error instanceof Error ? error.message : isArabic ? 'تعذّر تحميل التقارير' : 'Could not load reports');
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      }
    };
    doLoad();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const t = isArabic
    ? {
        title: 'التقارير والتحليلات', desc: 'نظرة شاملة على أداء المنصة والطلاب والمحتوى',
        revenue: 'الإيرادات', period: 'الفترة', codesSold: 'أكواد مُباعة', newSubs: 'اشتراكات جديدة',
        growth: 'نمو الطلاب', date: 'التاريخ', newReg: 'تسجيلات جديدة', activeUsers: 'مستخدمون نشطون',
        topSubjects: 'أكثر المواد نشاطاً', subject: 'المادة', answered: 'إجابات', accuracy: 'الدقة', activeStudents: 'طلاب نشطون',
        platformOverview: 'نظرة عامة على المنصة', totalStudents: 'إجمالي الطلاب', totalQuestions: 'إجمالي الأسئلة',
        totalAnswers: 'إجمالي الإجابات', platformAccuracy: 'دقة المنصة', examSessions: 'جلسات اختبار', libraryViews: 'مشاهدات المكتبة',
        mostActive: 'أكثر المواد استخداماً', hardest: 'أصعب المواد', mostViewed: 'أكثر الملفات مشاهدة',
        reportsSummary: 'ملخص البلاغات', total: 'الإجمالي', pending: 'معلّقة', resolved: 'محلولة', rejected: 'مرفوضة',
        recentReports: 'أحدث البلاغات', question: 'السؤال', count: 'العدد', reason: 'السبب', lastDate: 'آخر بلاغ',
        hourlyActivity: 'النشاط بالساعة', hour: 'الساعة', uniqueStudents: 'طلاب فريدون', totalAns: 'إجمالي الإجابات',
        refresh: 'تحديث', loading: 'جارٍ تحميل التقارير...', noData: 'لا توجد بيانات كافية',
      }
    : {
        title: 'Reports & Analytics', desc: 'Comprehensive view of platform, student, and content performance',
        revenue: 'Revenue', period: 'Period', codesSold: 'Codes sold', newSubs: 'New subscriptions',
        growth: 'Student Growth', date: 'Date', newReg: 'New registrations', activeUsers: 'Active users',
        topSubjects: 'Top Subjects', subject: 'Subject', answered: 'Answered', accuracy: 'Accuracy', activeStudents: 'Active students',
        platformOverview: 'Platform Overview', totalStudents: 'Total students', totalQuestions: 'Total questions',
        totalAnswers: 'Total answers', platformAccuracy: 'Platform accuracy', examSessions: 'Exam sessions', libraryViews: 'Library views',
        mostActive: 'Most Active Subjects', hardest: 'Hardest Subjects', mostViewed: 'Most Viewed Files',
        reportsSummary: 'Reports Summary', total: 'Total', pending: 'Pending', resolved: 'Resolved', rejected: 'Rejected',
        recentReports: 'Recent Reports', question: 'Question', count: 'Count', reason: 'Reason', lastDate: 'Last reported',
        hourlyActivity: 'Hourly Activity', hour: 'Hour', uniqueStudents: 'Unique students', totalAns: 'Total answers',
        refresh: 'Refresh', loading: 'Loading reports...', noData: 'Not enough data',
      };

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}>
            <BarChart3 size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--cms-text)' }}>{t.title}</h2>
            <p className="text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t.desc}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
              <div className="skeleton h-6 w-1/3 mb-4" />
              <div className="skeleton h-48 w-full" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}>
            <BarChart3 size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--cms-text)' }}>{t.title}</h2>
            <p className="text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t.desc}</p>
          </div>
        </div>
        <button onClick={() => loadAll()} disabled={refreshing} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all hover:shadow-sm disabled:opacity-50" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text-soft)' }}>
          {refreshing ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
          {t.refresh}
        </button>
      </div>

      {/* Platform Overview Cards */}
      {globalStats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: t.totalStudents, value: globalStats.totalStudents, icon: Users, color: 'var(--cms-teal-700)', bg: 'var(--cms-teal-50)' },
            { label: t.totalQuestions, value: globalStats.totalQuestions, icon: BookOpenCheck, color: 'var(--cms-info)', bg: 'var(--cms-info-50)' },
            { label: t.totalAnswers, value: globalStats.totalAnswers, icon: Activity, color: 'var(--cms-teal-600)', bg: 'var(--cms-teal-100)' },
            { label: t.platformAccuracy, value: `${globalStats.platformAccuracy.toFixed(1)}%`, icon: Target, color: 'var(--cms-success)', bg: 'var(--cms-success-50)' },
            { label: t.examSessions, value: globalStats.totalExamSessions, icon: BarChart3, color: 'var(--cms-warning)', bg: 'var(--cms-warning-50)' },
            { label: t.libraryViews, value: globalStats.totalLibraryViews, icon: FileText, color: 'var(--cms-info)', bg: 'var(--cms-info-50)' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border p-4" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: stat.bg, color: stat.color }}>
                <stat.icon size={16} />
              </div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--cms-text)' }}>{stat.value}</div>
              <div className="text-xs font-medium mt-1" style={{ color: 'var(--cms-text-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Revenue + Growth Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue */}
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} style={{ color: 'var(--cms-teal-700)' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.revenue}</h3>
          </div>
          {revenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cms-line)" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--cms-surface)', border: '1px solid var(--cms-line)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="revenue" name={t.revenue} fill="var(--cms-teal-600)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t.noData}</div>
          )}
        </div>

        {/* Student Growth */}
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} style={{ color: 'var(--cms-teal-700)' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.growth}</h3>
          </div>
          {growth.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={growth}>
                <defs>
                  <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--cms-teal-500)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--cms-teal-500)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cms-line)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--cms-surface)', border: '1px solid var(--cms-line)', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="activeUsers" name={t.activeUsers} stroke="var(--cms-teal-600)" fill="url(#growthGrad)" strokeWidth={2} />
                <Line type="monotone" dataKey="newRegistrations" name={t.newReg} stroke="var(--cms-info)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t.noData}</div>
          )}
        </div>
      </div>

      {/* Top Subjects + Hourly Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Subjects */}
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <div className="flex items-center gap-2 mb-4">
            <BookOpenCheck size={18} style={{ color: 'var(--cms-teal-700)' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.topSubjects}</h3>
          </div>
          {topSubjects.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topSubjects} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cms-line)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
                <YAxis type="category" dataKey="subjectName" tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} width={100} />
                <Tooltip contentStyle={{ background: 'var(--cms-surface)', border: '1px solid var(--cms-line)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="questionsAnswered" name={t.answered} radius={[0, 4, 4, 0]}>
                  {topSubjects.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t.noData}</div>
          )}
        </div>

        {/* Hourly Activity */}
        {globalStats?.hourlyActivity && globalStats.hourlyActivity.length > 0 && (
          <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={18} style={{ color: 'var(--cms-teal-700)' }} />
              <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.hourlyActivity}</h3>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={globalStats.hourlyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cms-line)" />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--cms-surface)', border: '1px solid var(--cms-line)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="totalAnswers" name={t.totalAns} fill="var(--cms-teal-500)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="uniqueStudents" name={t.uniqueStudents} fill="var(--cms-info)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Most Active + Hardest Subjects Tables */}
      {globalStats && (globalStats.mostActiveSubjects?.length > 0 || globalStats.hardestSubjects?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {globalStats.mostActiveSubjects?.length > 0 && (
            <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
              <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--cms-text)' }}>{t.mostActive}</h3>
              <div className="space-y-2">
                {globalStats.mostActiveSubjects.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--cms-line)' }}>
                    <span className="text-sm font-medium" style={{ color: 'var(--cms-text)' }}>{s.subjectName}</span>
                    <div className="flex gap-4 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                      <span>{s.questionsAnswered} {t.answered}</span>
                      <span>{s.accuracy.toFixed(0)}% {t.accuracy}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {globalStats.hardestSubjects?.length > 0 && (
            <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
              <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--cms-text)' }}>{t.hardest}</h3>
              <div className="space-y-2">
                {globalStats.hardestSubjects.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--cms-line)' }}>
                    <span className="text-sm font-medium" style={{ color: 'var(--cms-text)' }}>{s.subjectName}</span>
                    <div className="flex gap-4 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                      <span>{s.questionsAnswered} {t.answered}</span>
                      <span style={{ color: 'var(--cms-danger)' }}>{s.accuracy.toFixed(0)}% {t.accuracy}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Most Viewed Files + Reports Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Most Viewed Files */}
        {globalStats?.mostViewedFiles && globalStats.mostViewedFiles.length > 0 && (
          <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} style={{ color: 'var(--cms-teal-700)' }} />
              <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.mostViewed}</h3>
            </div>
            <div className="space-y-2">
              {globalStats.mostViewedFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--cms-line)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>{f.type}</span>
                    <span className="text-sm truncate" style={{ color: 'var(--cms-text)' }}>{f.title}</span>
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--cms-text-soft)' }}>{f.viewsCount}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reports Summary */}
        {reportsSummary && (
          <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={18} style={{ color: 'var(--cms-warning)' }} />
              <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.reportsSummary}</h3>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="text-center p-2 rounded-lg" style={{ background: 'var(--cms-ivory-100)' }}>
                <div className="text-lg font-bold" style={{ color: 'var(--cms-text)' }}>{reportsSummary.totalReports}</div>
                <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t.total}</div>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: 'var(--cms-warning-50)' }}>
                <div className="text-lg font-bold" style={{ color: 'var(--cms-warning)' }}>{reportsSummary.pendingReports}</div>
                <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t.pending}</div>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: 'var(--cms-success-50)' }}>
                <div className="text-lg font-bold" style={{ color: 'var(--cms-success)' }}>{reportsSummary.resolvedReports}</div>
                <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t.resolved}</div>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: 'var(--cms-danger-50)' }}>
                <div className="text-lg font-bold" style={{ color: 'var(--cms-danger)' }}>{reportsSummary.rejectedReports}</div>
                <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t.rejected}</div>
              </div>
            </div>
            {reportsSummary.recentReports && reportsSummary.recentReports.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t.recentReports}</div>
                {reportsSummary.recentReports.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--cms-line)' }}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate" style={{ color: 'var(--cms-text)' }}>{r.questionText}</div>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{r.mostCommonReason}</div>
                    </div>
                    <span className="text-sm font-bold tabular-nums ml-2" style={{ color: 'var(--cms-danger)' }}>{r.reportsCount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
