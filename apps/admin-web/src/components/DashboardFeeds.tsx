/**
 * DashboardFeeds — super-admin overview feed cards (W-coverage, matrix row 4:
 * the three AdminDashboard read feeds existed with no UI).
 *
 * API (recon-verified, all [Authorize(Policy = "SuperAdmin")]):
 *   GET /api/v1/admin/dashboard/recent-activity?count=10 → RecentActivityDto[]
 *   GET /api/v1/admin/dashboard/top-subjects?count=5     → TopSubjectDto[]
 *   GET /api/v1/admin/dashboard/reports/summary          → ReportsSummaryDto
 *
 * Independent per-card error states: one failing feed never blanks the others
 * (honest failure surfacing per the admin-ui waves' contract — inline states,
 * no toasts, so the failure is attached to the card that failed).
 */
import { useEffect, useState } from 'react';
import { Activity, BookOpenCheck, CircleAlert, ClipboardCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';

type RecentActivity = {
  id: string;
  type: string; // registration | subscription | report | security | upload
  description: string;
  actorName?: string | null;
  createdAt: string;
};

type TopSubject = {
  subjectId: string;
  subjectName: string;
  questionsAnswered: number;
  averageAccuracy: number;
  activeStudents: number;
};

type ReportsSummary = {
  totalReports: number;
  pendingReports: number;
  resolvedReports: number;
  rejectedReports: number;
};

type Props = {
  token: string;
  isArabic: boolean;
};

const ACTIVITY_TYPE_LABEL: Record<string, { ar: string; en: string; color: string }> = {
  registration: { ar: 'تسجيل', en: 'Registration', color: 'var(--cms-teal-700)' },
  subscription: { ar: 'اشتراك', en: 'Subscription', color: 'var(--cms-success)' },
  report: { ar: 'بلاغ', en: 'Report', color: 'var(--cms-warning)' },
  security: { ar: 'أمني', en: 'Security', color: 'var(--cms-danger)' },
  upload: { ar: 'رفع', en: 'Upload', color: 'var(--cms-info)' },
};

function cardShell(dir: string) {
  return {
    className: 'rounded-xl border p-4 space-y-3',
    dir,
    style: { borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', boxShadow: 'var(--cms-shadow-xs)' } as React.CSSProperties,
  };
}

export function DashboardFeeds({ token, isArabic }: Props) {
  const [activity, setActivity] = useState<RecentActivity[] | null>(null);
  const [activityFailed, setActivityFailed] = useState(false);
  const [topSubjects, setTopSubjects] = useState<TopSubject[] | null>(null);
  const [topSubjectsFailed, setTopSubjectsFailed] = useState(false);
  const [reports, setReports] = useState<ReportsSummary | null>(null);
  const [reportsFailed, setReportsFailed] = useState(false);

  const dir = isArabic ? 'rtl' : 'ltr';
  const t = isArabic
    ? {
        recentTitle: 'النشاط الأخير', topSubjects: 'المواد الأكثر نشاطًا', reportsTitle: 'ملخص البلاغات',
        loading: 'جارٍ التحميل…', failed: 'تعذر تحميل هذا البطاقة',
        noActivity: 'لا يوجد نشاط حديث', noSubjects: 'لا توجد بيانات نشاط للمواد',
        answered: 'إجابة', accuracy: 'الدقة', activeStudents: 'طلاب نشطون',
        pending: 'قيد المراجعة', resolved: 'محلولة', rejected: 'مرفوضة', total: 'الإجمالي',
        viewReports: 'افتح إدارة البلاغات',
      }
    : {
        recentTitle: 'Recent activity', topSubjects: 'Most active subjects', reportsTitle: 'Reports summary',
        loading: 'Loading…', failed: 'Could not load this card',
        noActivity: 'No recent activity', noSubjects: 'No subject activity data',
        answered: 'answered', accuracy: 'accuracy', activeStudents: 'active students',
        pending: 'Pending', resolved: 'Resolved', rejected: 'Rejected', total: 'Total',
        viewReports: 'Open reports moderation',
      };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiRequest<RecentActivity[]>('/api/v1/admin/dashboard/recent-activity?count=6', token)
      .then((data) => { if (!cancelled) setActivity(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setActivityFailed(true); });
    apiRequest<TopSubject[]>('/api/v1/admin/dashboard/top-subjects?count=5', token)
      .then((data) => { if (!cancelled) setTopSubjects(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setTopSubjectsFailed(true); });
    apiRequest<ReportsSummary>('/api/v1/admin/dashboard/reports/summary', token)
      .then((data) => { if (!cancelled) setReports(data); })
      .catch(() => { if (!cancelled) setReportsFailed(true); });
    return () => { cancelled = true; };
  }, [token]);

  const failedCard = (
    <div className="flex items-center gap-2 text-xs py-4 justify-center" style={{ color: 'var(--cms-danger)' }}>
      <CircleAlert size={14} /> {t.failed}
    </div>
  );

  const loadingCard = (
    <div className="flex items-center gap-2 text-xs py-4 justify-center" style={{ color: 'var(--cms-text-muted)' }}>
      <span className="skeleton" style={{ width: 12, height: 12, borderRadius: 999 }} />
      {t.loading}
    </div>
  );

  return (
    <section className="stat-grid" data-testid="dashboard-feeds" dir={dir} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      {/* Recent activity */}
      <article {...cardShell(dir)} data-testid="dashboard-feed-activity">
        <header className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
            <Activity size={15} />
          </span>
          <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--cms-text)' }}>{t.recentTitle}</h3>
        </header>
        {activityFailed ? failedCard : activity === null ? loadingCard : activity.length === 0 ? (
          <p className="text-xs py-3 text-center" style={{ color: 'var(--cms-text-muted)' }}>{t.noActivity}</p>
        ) : (
          <ul className="space-y-1.5">
            {activity.map((item) => {
              const meta = ACTIVITY_TYPE_LABEL[item.type] ?? { ar: item.type, en: item.type, color: 'var(--cms-text-soft)' };
              return (
                <li key={item.id} className="flex items-start gap-2 text-[11px]">
                  <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--cms-ivory-100)', color: meta.color }}>
                    {isArabic ? meta.ar : meta.en}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate" style={{ color: 'var(--cms-text-soft)' }} title={item.description}>{item.description}</p>
                    <p className="text-[9px]" style={{ color: 'var(--cms-text-muted)' }}>
                      {item.actorName ? `${item.actorName} · ` : ''}{new Date(item.createdAt).toLocaleString(isArabic ? 'ar' : 'en')}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </article>

      {/* Top subjects */}
      <article {...cardShell(dir)} data-testid="dashboard-feed-subjects">
        <header className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg" style={{ background: 'rgba(53,113,138,0.12)', color: 'var(--cms-info)' }}>
            <BookOpenCheck size={15} />
          </span>
          <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--cms-text)' }}>{t.topSubjects}</h3>
        </header>
        {topSubjectsFailed ? failedCard : topSubjects === null ? loadingCard : topSubjects.length === 0 ? (
          <p className="text-xs py-3 text-center" style={{ color: 'var(--cms-text-muted)' }}>{t.noSubjects}</p>
        ) : (
          <ul className="space-y-1.5">
            {topSubjects.map((subject, index) => (
              <li key={subject.subjectId} className="flex items-center gap-2 text-[11px]">
                <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-teal-700)' }}>
                  {index + 1}
                </span>
                <span className="flex-1 truncate font-medium" style={{ color: 'var(--cms-text)' }}>{subject.subjectName}</span>
                <span className="shrink-0 text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                  {subject.questionsAnswered} {t.answered} · {Math.round(subject.averageAccuracy * 100)}% {t.accuracy}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      {/* Reports summary */}
      <article {...cardShell(dir)} data-testid="dashboard-feed-reports">
        <header className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg" style={{ background: 'rgba(182,71,61,0.12)', color: 'var(--cms-danger)' }}>
            <ClipboardCheck size={15} />
          </span>
          <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--cms-text)' }}>{t.reportsTitle}</h3>
        </header>
        {reportsFailed ? failedCard : reports === null ? loadingCard : (
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--cms-text)' }}>{reports.totalReports}</div>
              <div className="text-[9px]" style={{ color: 'var(--cms-text-muted)' }}>{t.total}</div>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--cms-warning)' }}>{reports.pendingReports}</div>
              <div className="text-[9px]" style={{ color: 'var(--cms-text-muted)' }}>{t.pending}</div>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--cms-success)' }}>{reports.resolvedReports}</div>
              <div className="text-[9px]" style={{ color: 'var(--cms-text-muted)' }}>{t.resolved}</div>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--cms-danger)' }}>{reports.rejectedReports}</div>
              <div className="text-[9px]" style={{ color: 'var(--cms-text-muted)' }}>{t.rejected}</div>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
