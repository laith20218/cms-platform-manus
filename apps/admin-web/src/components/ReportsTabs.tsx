/**
 * ReportsTabs — 8-tab analytics dashboard for the admin ReportsCenter.
 *
 * Each tab is a self-contained component that fetches from a dedicated endpoint.
 * Shared: date range picker + last updated timestamp.
 *
 * Tabs:
 * 1. Overview — key metrics from all tabs
 * 2. Students — registration growth + inactive + export
 * 3. Academic — pass rates + hardest subjects/questions
 * 4. Exams — completion + score distribution + avg duration
 * 5. Questions — most reported + top attempted + edit link
 * 6. Content — storage + views by type + scan failures
 * 7. Codes — activation rate + estimated value + daily breakdown
 * 8. Operations — security events + login success rate + by type
 */
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, type PieLabelRenderProps,
} from 'recharts';
import {
  LoaderCircle, Calendar, Users, GraduationCap, ClipboardCheck, BookOpenCheck,
  FileText, KeyRound, ShieldCheck, AlertTriangle, TrendingUp, FileSpreadsheet, Archive, Eye, BarChart3,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import { useUiPermissions } from '../hooks/uiPermissionsContext';
import { t, localeOf } from '../lib/dictionary';

type Props = { token: string; isArabic: boolean; onError: (msg: string) => void };

const DATE_PRESETS = [
  { value: '7d', labelKey: 'reports.presets.last7', days: 7 },
  { value: '30d', labelKey: 'reports.presets.last30', days: 30 },
  { value: '90d', labelKey: 'reports.presets.last90', days: 90 },
  { value: '6m', labelKey: 'reports.presets.last6m', days: 180 },
  { value: '12m', labelKey: 'reports.presets.last12m', days: 365 },
];

const COLORS = ['#0d746b', '#12877d', '#1a9b90', '#4cb8ae', '#35718a', '#a36c1f', '#198566', '#b6473d'];

// ===== W23.3 (A2): typed analytics payloads — replacing `any` =====
// Shapes mirror the API responses (camelCase JSON): /api/v1/stats/global,
// /api/v1/admin/{revenue,student-growth} and /api/v1/admin/analytics/*.

/** /api/v1/stats/global (GlobalStatsDto). */
interface GlobalStatsDto {
  totalStudents: number;
  totalQuestions: number;
  totalAnswers: number;
  platformAccuracy: number;
  totalExamSessions: number;
  totalLibraryViews: number;
}

/** /api/v1/admin/revenue (RevenueDataDto). */
interface RevenuePointDto { period: string; revenue: number; codesSold: number; newSubscriptions: number; }

/** /api/v1/admin/student-growth (StudentGrowthDto). */
interface GrowthPointDto { date: string; newRegistrations: number; activeUsers: number; }

interface OverviewData {
  stats: GlobalStatsDto | null;
  revenue: RevenuePointDto[];
  growth: GrowthPointDto[];
}

/** /api/v1/admin/analytics/students. */
interface DailyRegistrationDto { date: string; registrations: number; }
interface StudentsAnalyticsDto {
  totalStudents: number;
  newRegistrations: number;
  activeStudents: number;
  inactiveStudents: number;
  inactiveThresholdDate?: string;
  dailyBreakdown: DailyRegistrationDto[];
}

/** /api/v1/admin/analytics/academic. */
interface SubjectStatDto { subjectId: string; subjectName: string; totalAttempts: number; passRate: number; averageScore: number; }
interface HardestQuestionDto { questionId: string; questionText: string; totalAttempts: number; correctRate: number; }
interface AcademicAnalyticsDto { subjectStats: SubjectStatDto[]; hardestQuestions: HardestQuestionDto[]; }

/** /api/v1/admin/analytics/exams. */
interface ScoreRangeDto { range: string; count: number; }
interface ExamsAnalyticsDto {
  publishedCount: number; draftCount: number; archivedCount: number;
  totalSessions: number; completedCount: number;
  completionRate: number; passRate: number; avgDurationMinutes: number;
  scoreDistribution: ScoreRangeDto[];
}

/** /api/v1/admin/analytics/questions. */
interface ReportedQuestionDto { questionId: string; questionText: string; reportsCount: number; mostCommonReason: string; }
interface AttemptedQuestionDto { questionId: string; questionText: string; attempts: number; correctRate: number; }
interface QuestionsAnalyticsDto {
  publishedCount: number; draftCount: number; archivedCount: number;
  mostReported: ReportedQuestionDto[];
  topAttempted: AttemptedQuestionDto[];
}

/** /api/v1/admin/analytics/content. */
interface ViewsByTypeDto { type: string; count: number; totalSize: number; views: number; }
interface ContentAnalyticsDto {
  publishedFiles: number; draftFiles: number; archivedFiles: number;
  totalStorageBytes: number; totalStorageMB: number; totalViews: number;
  viewsByType: ViewsByTypeDto[];
  pendingScans: number; failedScans: number; infectedFiles: number;
}

/** /api/v1/admin/analytics/codes. */
interface DailyActivationDto { date: string; activated: number; }
interface CodesAnalyticsDto {
  totalIssued: number; activated: number; expired: number; revoked: number;
  activationRate: number; activeSubscriptions: number;
  estimatedValue: number; estimatedValueNote: string; dailyActivation: DailyActivationDto[];
}

/** /api/v1/admin/analytics/operations. */
interface SecurityEventByTypeDto { eventType: string; count: number; }
interface OperationsAnalyticsDto {
  totalSecurityEvents: number; successfulLogins: number; failedLogins: number;
  loginSuccessRate: number; securityEventsByType: SecurityEventByTypeDto[];
}

/** Format ISO date strings (yyyy-MM-dd) into short locale-friendly labels for chart x-axes. */
function formatShortDate(value: string): string {
  if (!value) return '';
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  return `${parts[1]}/${parts[2]}`;
}

function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => typeof c === 'string' && c.includes(',') ? `"${c.replace(/"/g, '""')}"` : c).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ===== Shared components =====

function StatCard({ label, value, icon: Icon, color, bg }: { label: string; value: string | number; icon: typeof Users; color: string; bg: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: bg, color }}>
        <Icon size={16} />
      </div>
      <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--cms-text)' }}>{value}</div>
      <div className="text-xs font-medium mt-1" style={{ color: 'var(--cms-text-muted)' }}>{label}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <LoaderCircle size={24} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} />
      <span className="text-xs ml-2" style={{ color: 'var(--cms-text-muted)' }}>Loading...</span>
    </div>
  );
}

function EmptyState({ icon: Icon }: { icon: typeof Users }) {
  return (
    <div className="text-center py-12">
      <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--cms-teal-50, rgba(13,116,107,0.08))' }}>
        <Icon size={24} style={{ color: 'var(--cms-teal-500, #1a9b90)' }} />
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--cms-text, #0b2940)' }}>No data available</p>
      <p className="text-xs mt-1" style={{ color: 'var(--cms-text-muted, #6b7280)' }}>Try adjusting the date range or check back later.</p>
    </div>
  );
}

// ===== Tab 1: Overview =====
function OverviewTab({ token, dateFrom, dateTo, isArabic, onError }: { token: string; dateFrom: string; dateTo: string; isArabic: boolean; onError: (msg: string) => void }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
      const [stats, revenue, growth] = await Promise.allSettled([
        apiRequest<GlobalStatsDto>(`/api/v1/stats/global?${params}`, token),
        apiRequest<RevenuePointDto[]>(`/api/v1/admin/revenue?months=6`, token),
        apiRequest<GrowthPointDto[]>(`/api/v1/admin/student-growth?days=30`, token),
      ]);
      setData({
        stats: stats.status === 'fulfilled' ? stats.value : null,
        revenue: revenue.status === 'fulfilled' ? revenue.value : [],
        growth: growth.status === 'fulfilled' ? growth.value : [],
      });
    } catch (e) { onError(e instanceof ApiError ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [token, dateFrom, dateTo, onError]);

  useEffect(() => { load(); }, [load]);

  const locale = localeOf(isArabic);
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState icon={TrendingUp} />;

  const s = data.stats;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label={t(locale, 'reports.stats.totalStudents')} value={s?.totalStudents ?? '—'} icon={Users} color="var(--cms-teal-700)" bg="var(--cms-teal-50)" />
        <StatCard label={t(locale, 'reports.stats.totalQuestions')} value={s?.totalQuestions ?? '—'} icon={BookOpenCheck} color="var(--cms-info)" bg="var(--cms-info-50)" />
        <StatCard label={t(locale, 'reports.stats.totalAnswers')} value={s?.totalAnswers ?? '—'} icon={TrendingUp} color="var(--cms-teal-600)" bg="var(--cms-teal-100)" />
        <StatCard label={t(locale, 'reports.stats.platformAccuracy')} value={`${(s?.platformAccuracy ?? 0).toFixed(1)}%`} icon={ShieldCheck} color="var(--cms-success)" bg="var(--cms-success-50)" />
        <StatCard label={t(locale, 'reports.stats.examSessions')} value={s?.totalExamSessions ?? '—'} icon={ClipboardCheck} color="var(--cms-warning)" bg="var(--cms-warning-50)" />
        <StatCard label={t(locale, 'reports.stats.libraryViews')} value={s?.totalLibraryViews ?? '—'} icon={FileText} color="var(--cms-info)" bg="var(--cms-info-50)" />
      </div>
      {data.growth.length > 0 && (
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.charts.studentGrowth')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.growth}>
              <defs><linearGradient id="ovGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--cms-teal-500)" stopOpacity={0.3} /><stop offset="95%" stopColor="var(--cms-teal-500)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cms-line)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} tickFormatter={formatShortDate} interval="preserveStartEnd" minTickGap={20} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
              <Tooltip contentStyle={{ background: 'var(--cms-surface)', border: '1px solid var(--cms-line)', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="activeUsers" name="Active" stroke="var(--cms-teal-600)" fill="url(#ovGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ===== Tab 2: Students =====
function StudentsTab({ token, dateFrom, dateTo, isArabic, onError }: { token: string; dateFrom: string; dateTo: string; isArabic: boolean; onError: (msg: string) => void }) {
  // Push 3: this tab owns the report export button (btn:reports.export).
  const { can } = useUiPermissions();
  const [data, setData] = useState<StudentsAnalyticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
      const res = await apiRequest<StudentsAnalyticsDto>(`/api/v1/admin/analytics/students?${params}`, token);
      setData(res);
    } catch (e) { onError(e instanceof ApiError ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [token, dateFrom, dateTo, onError]);

  useEffect(() => { load(); }, [load]);

  const locale = localeOf(isArabic);
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState icon={Users} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t(locale, 'reports.stats.totalStudents')} value={data.totalStudents} icon={Users} color="var(--cms-teal-700)" bg="var(--cms-teal-50)" />
        <StatCard label={t(locale, 'reports.stats.newRegistrations')} value={data.newRegistrations} icon={TrendingUp} color="var(--cms-success)" bg="var(--cms-success-50)" />
        <StatCard label={t(locale, 'reports.stats.activeStudents')} value={data.activeStudents} icon={ShieldCheck} color="var(--cms-info)" bg="var(--cms-info-50)" />
        <StatCard label={t(locale, 'reports.stats.inactiveStudents')} value={data.inactiveStudents} icon={AlertTriangle} color="var(--cms-warning)" bg="var(--cms-warning-50)" />
      </div>
      {data.dailyBreakdown?.length > 0 && (
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.charts.dailyRegistrations')}</h3>
            {can('btn:reports.export') && (
              <button onClick={() => exportCsv('student-registrations.csv', ['Date', 'Registrations'], data.dailyBreakdown.map((d) => [d.date, d.registrations]))}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border" style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-muted)' }}>
                <FileSpreadsheet size={10} /> CSV
              </button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.dailyBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cms-line)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--cms-text-muted)' }} tickFormatter={formatShortDate} interval="preserveStartEnd" minTickGap={20} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
              <Tooltip contentStyle={{ background: 'var(--cms-surface)', border: '1px solid var(--cms-line)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="registrations" name="Registrations" fill="var(--cms-teal-600)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ===== Tab 3: Academic =====
function AcademicTab({ token, dateFrom, dateTo, isArabic, onError }: { token: string; dateFrom: string; dateTo: string; isArabic: boolean; onError: (msg: string) => void }) {
  const [data, setData] = useState<AcademicAnalyticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
      const res = await apiRequest<AcademicAnalyticsDto>(`/api/v1/admin/analytics/academic?${params}`, token);
      setData(res);
    } catch (e) { onError(e instanceof ApiError ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [token, dateFrom, dateTo, onError]);
  useEffect(() => { load(); }, [load]);
  const locale = localeOf(isArabic);
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState icon={GraduationCap} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.charts.passRatesBySubject')}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.subjectStats?.map((s) => ({ name: s.subjectName, passRate: Math.round(s.passRate), avgScore: s.averageScore })) ?? []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cms-line)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--cms-text-muted)' }} width={100} />
              <Tooltip contentStyle={{ background: 'var(--cms-surface)', border: '1px solid var(--cms-line)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="passRate" name="Pass Rate %" fill="var(--cms-teal-600)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.charts.hardestQuestions')}</h3>
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {data.hardestQuestions?.map((q, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--cms-line)' }}>
                <span className="text-xs truncate flex-1" style={{ color: 'var(--cms-text)' }}>{q.questionText}</span>
                <span className="text-xs font-bold tabular-nums ml-2" style={{ color: 'var(--cms-danger)' }}>{q.correctRate}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Tab 4: Exams =====
function ExamsTab({ token, dateFrom, dateTo, isArabic, onError }: { token: string; dateFrom: string; dateTo: string; isArabic: boolean; onError: (msg: string) => void }) {
  const [data, setData] = useState<ExamsAnalyticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
      const res = await apiRequest<ExamsAnalyticsDto>(`/api/v1/admin/analytics/exams?${params}`, token);
      setData(res);
    } catch (e) { onError(e instanceof ApiError ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [token, dateFrom, dateTo, onError]);
  useEffect(() => { load(); }, [load]);
  const locale = localeOf(isArabic);
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState icon={ClipboardCheck} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t(locale, 'reports.stats.published')} value={data.publishedCount} icon={ClipboardCheck} color="var(--cms-teal-700)" bg="var(--cms-teal-50)" />
        <StatCard label={t(locale, 'reports.stats.drafts')} value={data.draftCount} icon={FileText} color="var(--cms-warning)" bg="var(--cms-warning-50)" />
        <StatCard label={t(locale, 'reports.stats.completionRate')} value={`${data.completionRate}%`} icon={TrendingUp} color="var(--cms-success)" bg="var(--cms-success-50)" />
        <StatCard label={t(locale, 'reports.stats.passRate')} value={`${data.passRate}%`} icon={ShieldCheck} color="var(--cms-info)" bg="var(--cms-info-50)" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.charts.scoreDistribution')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cms-line)" />
              <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'var(--cms-text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
              <Tooltip contentStyle={{ background: 'var(--cms-surface)', border: '1px solid var(--cms-line)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" name="Students" fill="var(--cms-teal-600)" radius={[4, 4, 0, 0]}>
                {data.scoreDistribution?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.charts.metrics')}</h3>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.charts.totalSessions')}</span><span className="text-sm font-bold tabular-nums">{data.totalSessions}</span></div>
            <div className="flex justify-between"><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.charts.completedSessions')}</span><span className="text-sm font-bold tabular-nums">{data.completedCount}</span></div>
            <div className="flex justify-between"><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.charts.avgDuration')}</span><span className="text-sm font-bold tabular-nums">{data.avgDurationMinutes}</span></div>
            <div className="flex justify-between"><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.stats.archived')}</span><span className="text-sm font-bold tabular-nums">{data.archivedCount}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Tab 5: Questions =====
function QuestionsTab({ token, dateFrom, dateTo, isArabic, onError }: { token: string; dateFrom: string; dateTo: string; isArabic: boolean; onError: (msg: string) => void }) {
  const [data, setData] = useState<QuestionsAnalyticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
      const res = await apiRequest<QuestionsAnalyticsDto>(`/api/v1/admin/analytics/questions?${params}`, token);
      setData(res);
    } catch (e) { onError(e instanceof ApiError ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [token, dateFrom, dateTo, onError]);
  useEffect(() => { load(); }, [load]);
  const locale = localeOf(isArabic);
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState icon={BookOpenCheck} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t(locale, 'reports.stats.published')} value={data.publishedCount} icon={BookOpenCheck} color="var(--cms-teal-700)" bg="var(--cms-teal-50)" />
        <StatCard label={t(locale, 'reports.stats.drafts')} value={data.draftCount} icon={FileText} color="var(--cms-warning)" bg="var(--cms-warning-50)" />
        <StatCard label={t(locale, 'reports.stats.archived')} value={data.archivedCount} icon={Archive} color="var(--cms-text-muted)" bg="var(--cms-ivory-100)" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.charts.mostReported')}</h3>
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {data.mostReported?.map((q, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--cms-line)' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate" style={{ color: 'var(--cms-text)' }}>{q.questionText}</div>
                  <div className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>{q.mostCommonReason}</div>
                </div>
                <span className="text-xs font-bold tabular-nums ml-2" style={{ color: 'var(--cms-danger)' }}>{q.reportsCount}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.charts.topAttempted')}</h3>
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {data.topAttempted?.map((q, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--cms-line)' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate" style={{ color: 'var(--cms-text)' }}>{q.questionText}</div>
                  <div className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>{q.attempts} attempts · {q.correctRate}% correct</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Tab 6: Content =====
function ContentTab({ token, dateFrom, dateTo, isArabic, onError }: { token: string; dateFrom: string; dateTo: string; isArabic: boolean; onError: (msg: string) => void }) {
  const [data, setData] = useState<ContentAnalyticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
      const res = await apiRequest<ContentAnalyticsDto>(`/api/v1/admin/analytics/content?${params}`, token);
      setData(res);
    } catch (e) { onError(e instanceof ApiError ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [token, dateFrom, dateTo, onError]);
  useEffect(() => { load(); }, [load]);
  const locale = localeOf(isArabic);
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState icon={FileText} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t(locale, 'reports.stats.publishedFiles')} value={data.publishedFiles} icon={FileText} color="var(--cms-teal-700)" bg="var(--cms-teal-50)" />
        <StatCard label={t(locale, 'reports.stats.storageMb')} value={data.totalStorageMB} icon={TrendingUp} color="var(--cms-info)" bg="var(--cms-info-50)" />
        <StatCard label={t(locale, 'reports.stats.totalViews')} value={data.totalViews} icon={Eye} color="var(--cms-success)" bg="var(--cms-success-50)" />
        <StatCard label={t(locale, 'reports.stats.pendingScans')} value={data.pendingScans} icon={AlertTriangle} color="var(--cms-warning)" bg="var(--cms-warning-50)" />
      </div>
      {data.viewsByType?.length > 0 && (
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.charts.viewsByType')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.viewsByType} dataKey="views" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={(entry: PieLabelRenderProps & { type?: string }) => entry.type}>
                {data.viewsByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--cms-surface)', border: '1px solid var(--cms-line)', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ===== Tab 7: Codes =====
function CodesTab({ token, dateFrom, dateTo, isArabic, onError }: { token: string; dateFrom: string; dateTo: string; isArabic: boolean; onError: (msg: string) => void }) {
  const [data, setData] = useState<CodesAnalyticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
      const res = await apiRequest<CodesAnalyticsDto>(`/api/v1/admin/analytics/codes?${params}`, token);
      setData(res);
    } catch (e) { onError(e instanceof ApiError ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [token, dateFrom, dateTo, onError]);
  useEffect(() => { load(); }, [load]);
  const locale = localeOf(isArabic);
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState icon={KeyRound} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t(locale, 'reports.stats.totalIssued')} value={data.totalIssued} icon={KeyRound} color="var(--cms-teal-700)" bg="var(--cms-teal-50)" />
        <StatCard label={t(locale, 'reports.stats.activated')} value={data.activated} icon={ShieldCheck} color="var(--cms-success)" bg="var(--cms-success-50)" />
        <StatCard label={t(locale, 'reports.stats.activationRate')} value={`${data.activationRate}%`} icon={TrendingUp} color="var(--cms-info)" bg="var(--cms-info-50)" />
        <StatCard label={t(locale, 'reports.stats.estimatedValue')} value={data.estimatedValue?.toLocaleString()} icon={TrendingUp} color="var(--cms-warning)" bg="var(--cms-warning-50)" />
      </div>
      {data.estimatedValueNote && (
        <p className="text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>{data.estimatedValueNote}</p>
      )}
      {data.dailyActivation?.length > 0 && (
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.charts.dailyActivations')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.dailyActivation}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cms-line)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--cms-text-muted)' }} tickFormatter={formatShortDate} interval="preserveStartEnd" minTickGap={20} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
              <Tooltip contentStyle={{ background: 'var(--cms-surface)', border: '1px solid var(--cms-line)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="activated" name="Activated" fill="var(--cms-teal-600)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ===== Tab 8: Operations =====
function OperationsTab({ token, dateFrom, dateTo, isArabic, onError }: { token: string; dateFrom: string; dateTo: string; isArabic: boolean; onError: (msg: string) => void }) {
  const [data, setData] = useState<OperationsAnalyticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
      const res = await apiRequest<OperationsAnalyticsDto>(`/api/v1/admin/analytics/operations?${params}`, token);
      setData(res);
    } catch (e) { onError(e instanceof ApiError ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [token, dateFrom, dateTo, onError]);
  useEffect(() => { load(); }, [load]);
  const locale = localeOf(isArabic);
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState icon={ShieldCheck} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t(locale, 'reports.stats.securityEvents')} value={data.totalSecurityEvents} icon={ShieldCheck} color="var(--cms-teal-700)" bg="var(--cms-teal-50)" />
        <StatCard label={t(locale, 'reports.stats.successfulLogins')} value={data.successfulLogins} icon={ShieldCheck} color="var(--cms-success)" bg="var(--cms-success-50)" />
        <StatCard label={t(locale, 'reports.stats.failedLogins')} value={data.failedLogins} icon={AlertTriangle} color="var(--cms-danger)" bg="var(--cms-danger-50)" />
        <StatCard label={t(locale, 'reports.stats.loginSuccessRate')} value={`${data.loginSuccessRate}%`} icon={TrendingUp} color="var(--cms-info)" bg="var(--cms-info-50)" />
      </div>
      {data.securityEventsByType?.length > 0 && (
        <div className="rounded-xl border p-6" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.charts.eventsByType')}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.securityEventsByType} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cms-line)" />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--cms-text-muted)' }} />
              <YAxis type="category" dataKey="eventType" tick={{ fontSize: 10, fill: 'var(--cms-text-muted)' }} width={120} />
              <Tooltip contentStyle={{ background: 'var(--cms-surface)', border: '1px solid var(--cms-line)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" name="Count" fill="var(--cms-teal-600)" radius={[0, 4, 4, 0]}>
                {data.securityEventsByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ===== Main component with tabs =====

const TABS = [
  { key: 'overview', icon: TrendingUp },
  { key: 'students', icon: Users },
  { key: 'academic', icon: GraduationCap },
  { key: 'exams', icon: ClipboardCheck },
  { key: 'questions', icon: BookOpenCheck },
  { key: 'content', icon: FileText },
  { key: 'codes', icon: KeyRound },
  { key: 'operations', icon: ShieldCheck },
];

export function ReportsTabs({ token, isArabic, onError }: Props) {
  // Push 3: cosmetic gating — 8 tab keys + the export button (owned by StudentsTab).
  const { can } = useUiPermissions();
  const [activeTab, setActiveTab] = useState('overview');
  const [datePreset, setDatePreset] = useState('30d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const locale = localeOf(isArabic);

  const preset = DATE_PRESETS.find(p => p.value === datePreset) ?? DATE_PRESETS[1];

  // Calculate date range from preset
  useEffect(() => {
    if (datePreset !== 'custom') {
      const to = new Date();
      const from = new Date();
      from.setDate(to.getDate() - preset.days);
      setDateFrom(from.toISOString().split('T')[0]);
      setDateTo(to.toISOString().split('T')[0]);
    }
  }, [datePreset, preset]);

  const renderTab = () => {
    const props = { token, dateFrom, dateTo, isArabic, onError };
    // Push 3: a denied tab never renders its content, even if stale state points at it.
    if (!can(`tab:reports.${activeTab}`)) {
      return (
        <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text-muted)' }}>
          {t(locale, 'reports.header.tabDenied')}
        </div>
      );
    }
    switch (activeTab) {
      case 'overview': return <OverviewTab {...props} />;
      case 'students': return <StudentsTab {...props} />;
      case 'academic': return <AcademicTab {...props} />;
      case 'exams': return <ExamsTab {...props} />;
      case 'questions': return <QuestionsTab {...props} />;
      case 'content': return <ContentTab {...props} />;
      case 'codes': return <CodesTab {...props} />;
      case 'operations': return <OperationsTab {...props} />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header + Date range */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}>
            <BarChart3 size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.header.title')}</h2>
            <p className="text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.header.desc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={14} style={{ color: 'var(--cms-text-muted)' }} />
          <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} aria-label={t(locale, 'reports.header.dateRange')}
            className="h-9 rounded-lg border text-xs px-2" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
            {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{t(locale, p.labelKey)}</option>)}
          </select>
        </div>
      </div>

      {/* Last updated */}
      {lastUpdated && (
        <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
          {t(locale, 'reports.header.lastUpdate')}: {new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(lastUpdated)}
        </div>
      )}

      {/* Tab bar — Push 3: each tab gated by its own key (tab:reports.*). */}
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--cms-line)' }}>
        {TABS.filter(tab => can(`tab:reports.${tab.key}`)).map(tab => {
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); setLastUpdated(new Date()); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap"
              style={active
                ? { color: 'var(--cms-teal-700)', borderColor: 'var(--cms-teal-500)' }
                : { color: 'var(--cms-text-muted)', borderColor: 'transparent' }}>
              <tab.icon size={14} />
              {t(locale, `reports.tabs.${tab.key}`)}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {renderTab()}
    </div>
  );
}
