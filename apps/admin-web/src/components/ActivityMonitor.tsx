/**
 * ActivityMonitor — Push 2 / Track 2: super-admin administrative activity monitor.
 *
 * Composition:
 *   • Two sub-tabs: "الجلسات" (Sessions — card timeline) and "سجل النشاط" (Activity logs — table)
 *   • Sessions tab: one card per admin session showing admin name, role, duration,
 *     IP, device summary (parsed from DeviceDetails JSON), per-session action counters
 *     (questions / files / codes), start / last-activity / closed timestamps, and an
 *     active/closed status chip.
 *   • Logs tab: responsive table with timestamp, admin, action badge (bilingual),
 *     resource id, metadata summary chips (fileSize humanized, quantity, scope...).
 *   • Pagination (prev/next) on both tabs; page-size 20.
 *   • Empty + loading + error states per tab.
 *
 * Data sources (super-admin only, enforced server-side):
 *   • GET /api/v1/admin/activity/sessions?page=&pageSize=&adminId=
 *   • GET /api/v1/admin/activity/logs?page=&pageSize=&adminId=&sessionId=
 *
 * Design tokens (--cms-*) are applied via inline style; structural styling is pure Tailwind.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Activity, ChevronLeft, ChevronRight, ClipboardList, FileText,
  KeyRound, LoaderCircle, MonitorSmartphone, Search, ShieldCheck,
} from 'lucide-react';
import { apiRequest } from '../lib/api';

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
};

type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };

type SessionRow = {
  id: string; adminId: string; adminName: string; role: string;
  startedAt: string; lastActivityAt: string; closedAt: string | null;
  durationMinutes: number; ipAddress: string | null; userAgent: string | null;
  deviceDetails: string | null;
  questionsCount: number; filesCount: number; codesCount: number;
};

type LogRow = {
  id: string; adminId: string; adminName: string; actionType: string;
  resourceId: string | null; metadata: string; sessionId: string | null; createdAt: string;
};

const PAGE_SIZE = 20;

const parseJson = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
};

const formatDateTime = (iso: string, isArabic: boolean) => {
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch { return iso; }
};

const humanizeBytes = (value: unknown): string => {
  const bytes = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return String(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const actionMeta = (actionType: string, isArabic: boolean) => {
  switch (actionType) {
    case 'CreateQuestion': return { label: isArabic ? 'إنشاء سؤال' : 'Question created', icon: ClipboardList, tone: 'text-teal-700 bg-teal-50 border-teal-200' };
    case 'UploadFile': return { label: isArabic ? 'رفع ملف' : 'File uploaded', icon: FileText, tone: 'text-amber-700 bg-amber-50 border-amber-200' };
    case 'GenerateCode': return { label: isArabic ? 'توليد أكواد' : 'Codes generated', icon: KeyRound, tone: 'text-violet-700 bg-violet-50 border-violet-200' };
    default: return { label: actionType, icon: Activity, tone: 'text-slate-600 bg-slate-50 border-slate-200' };
  }
};

export function ActivityMonitor({ token, isArabic, onError }: Props) {
  const [tab, setTab] = useState<'sessions' | 'logs'>('sessions');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);
  const [sessionsTotalPages, setSessionsTotalPages] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [adminFilter, setAdminFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const dir = isArabic ? 'rtl' : 'ltr';

  const loadSessions = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      const trimmed = adminFilter.trim();
      if (trimmed) params.set('adminId', trimmed);
      const result = await apiRequest<Paged<SessionRow>>(`/api/v1/admin/activity/sessions?${params.toString()}`, token);
      setSessions(result.items);
      setSessionsPage(result.page);
      setSessionsTotalPages(Math.max(result.totalPages, 1));
    } catch (error) {
      onError(error instanceof Error ? error.message : (isArabic ? 'تعذر تحميل الجلسات.' : 'Could not load sessions.'));
    } finally { setLoading(false); }
  }, [token, adminFilter, onError, isArabic]);

  const loadLogs = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      const trimmed = adminFilter.trim();
      if (trimmed) params.set('adminId', trimmed);
      const result = await apiRequest<Paged<LogRow>>(`/api/v1/admin/activity/logs?${params.toString()}`, token);
      setLogs(result.items);
      setLogsPage(result.page);
      setLogsTotalPages(Math.max(result.totalPages, 1));
    } catch (error) {
      onError(error instanceof Error ? error.message : (isArabic ? 'تعذر تحميل سجل النشاط.' : 'Could not load activity logs.'));
    } finally { setLoading(false); }
  }, [token, adminFilter, onError, isArabic]);

  useEffect(() => {
    if (tab === 'sessions') void loadSessions(sessionsPage);
    else void loadLogs(logsPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <section className="space-y-4" dir={dir}>
      {/* ===== Header + sub-tabs + admin filter ===== */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
            <MonitorSmartphone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--cms-text)' }}>
              {isArabic ? 'مراقبة نشاط المدراء' : 'Admin activity monitor'}
            </h3>
            <p className="text-sm" style={{ color: 'var(--cms-text-soft)' }}>
              {isArabic ? 'جلسات المدراء والأجهزة والأعمال المنجزة (أسئلة، ملفات، أكواد).' : 'Admin sessions, devices, and completed work (questions, files, codes).'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute w-4 h-4 top-1/2 -translate-y-1/2 ltr:left-3 rtl:right-3" style={{ color: 'var(--cms-text-muted)' }} aria-hidden />
            <input
              value={adminFilter}
              onChange={event => setAdminFilter(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') { tab === 'sessions' ? void loadSessions(1) : void loadLogs(1); } }}
              placeholder={isArabic ? 'فلترة بمعرّف المدير (UUID)' : 'Filter by admin id (UUID)'}
              className="w-64 px-9 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 ltr:pl-9 rtl:pr-9"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            />
          </div>
          <button
            type="button"
            onClick={() => { tab === 'sessions' ? void loadSessions(1) : void loadLogs(1); }}
            className="px-3 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: 'var(--cms-teal-700)' }}
          >
            {isArabic ? 'تطبيق' : 'Apply'}
          </button>
        </div>
      </div>

      <div className="flex gap-2" role="tablist" aria-label={isArabic ? 'أقسام المراقبة' : 'Monitor sections'}>
        {(['sessions', 'logs'] as const).map(key => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${tab === key ? 'text-white' : ''}`}
            style={tab === key
              ? { background: 'var(--cms-teal-700)', borderColor: 'var(--cms-teal-700)' }
              : { borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
          >
            {key === 'sessions' ? (isArabic ? 'الجلسات' : 'Sessions') : (isArabic ? 'سجل النشاط' : 'Activity logs')}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--cms-text-soft)' }}>
          <LoaderCircle className="w-4 h-4 animate-spin" />
          {isArabic ? 'جارٍ التحميل…' : 'Loading…'}
        </div>
      )}

      {/* ===== Sessions tab ===== */}
      {tab === 'sessions' && !loading && (
        sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
            {isArabic ? 'لا توجد جلسات إدارية بعد.' : 'No admin sessions yet.'}
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => {
              const device = parseJson(session.deviceDetails);
              const active = !session.closedAt;
              return (
                <article key={session.id} className="rounded-xl border p-4 bg-white" style={{ borderColor: 'var(--cms-line)' }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="p-2 rounded-lg" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
                        <ShieldCheck className="w-4 h-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{session.adminName}</p>
                        <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                          {session.role} · {session.ipAddress ?? (isArabic ? 'IP غير متوفر' : 'no IP')}
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${active ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
                      {active ? (isArabic ? 'نشطة' : 'Active') : (isArabic ? 'مغلقة' : 'Closed')}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-lg p-2" style={{ background: 'var(--cms-ivory-50)' }}>
                      <p style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'المدة' : 'Duration'}</p>
                      <p className="font-semibold" style={{ color: 'var(--cms-text)' }}>
                        {session.durationMinutes >= 60
                          ? `${Math.floor(session.durationMinutes / 60)}h ${session.durationMinutes % 60}m`
                          : `${session.durationMinutes}m`}
                      </p>
                    </div>
                    <div className="rounded-lg p-2" style={{ background: 'var(--cms-ivory-50)' }}>
                      <p style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'الأسئلة' : 'Questions'}</p>
                      <p className="font-semibold" style={{ color: 'var(--cms-teal-700)' }}>{session.questionsCount}</p>
                    </div>
                    <div className="rounded-lg p-2" style={{ background: 'var(--cms-ivory-50)' }}>
                      <p style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'الملفات' : 'Files'}</p>
                      <p className="font-semibold" style={{ color: 'var(--cms-amber-700)' }}>{session.filesCount}</p>
                    </div>
                    <div className="rounded-lg p-2" style={{ background: 'var(--cms-ivory-50)' }}>
                      <p style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'الأكواد' : 'Codes'}</p>
                      <p className="font-semibold" style={{ color: 'var(--cms-violet-700, #6d28d9)' }}>{session.codesCount}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
                      {isArabic ? 'بدأت' : 'Started'}: {formatDateTime(session.startedAt, isArabic)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
                      {isArabic ? 'آخر نشاط' : 'Last activity'}: {formatDateTime(session.lastActivityAt, isArabic)}
                    </span>
                    {session.closedAt && (
                      <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
                        {isArabic ? 'أُغلقت' : 'Closed'}: {formatDateTime(session.closedAt, isArabic)}
                      </span>
                    )}
                    {device && (
                      <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
                        {[device.browser, device.os, device.deviceType].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>

                  {session.userAgent && (
                    <p className="mt-2 truncate text-[11px]" style={{ color: 'var(--cms-text-muted)' }} title={session.userAgent}>
                      {session.userAgent}
                    </p>
                  )}
                </article>
              );
            })}
            <Pager page={sessionsPage} totalPages={sessionsTotalPages} isArabic={isArabic} onPage={p => void loadSessions(p)} />
          </div>
        )
      )}

      {/* ===== Logs tab ===== */}
      {tab === 'logs' && !loading && (
        logs.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
            {isArabic ? 'لا توجد أحداث نشاط بعد.' : 'No activity events yet.'}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--cms-line)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--cms-ivory-50)' }}>
                  <tr className="text-start">
                    <th className="px-4 py-3 text-start font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'الوقت' : 'Time'}</th>
                    <th className="px-4 py-3 text-start font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'المدير' : 'Admin'}</th>
                    <th className="px-4 py-3 text-start font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'الإجراء' : 'Action'}</th>
                    <th className="px-4 py-3 text-start font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'التفاصيل' : 'Details'}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const meta = actionMeta(log.actionType, isArabic);
                    const Icon = meta.icon;
                    const metadata = parseJson(log.metadata);
                    const chips: string[] = [];
                    if (metadata) {
                      if (metadata.fileSize !== undefined) chips.push(`${isArabic ? 'الحجم' : 'size'}: ${humanizeBytes(metadata.fileSize)}`);
                      if (metadata.contentType) chips.push(`${metadata.contentType}`);
                      if (metadata.quantity !== undefined) chips.push(`${isArabic ? 'الكمية' : 'qty'}: ${metadata.quantity}`);
                      if (metadata.scopeType) chips.push(`${metadata.scopeType}`);
                      if (metadata.type && log.actionType === 'CreateQuestion') chips.push(`${metadata.type}`);
                      if (metadata.category) chips.push(`${metadata.category}`);
                    }
                    return (
                      <tr key={log.id} className="border-t" style={{ borderColor: 'var(--cms-line)' }}>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--cms-text-soft)' }}>
                          {formatDateTime(log.createdAt, isArabic)}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--cms-text)' }}>{log.adminName}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.tone}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            {log.resourceId && (
                              <span className="px-2 py-0.5 rounded-full border font-mono" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }} title={log.resourceId}>
                                {log.resourceId.slice(0, 8)}…
                              </span>
                            )}
                            {chips.map(chip => (
                              <span key={chip} className="px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}>
                                {chip}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={logsPage} totalPages={logsTotalPages} isArabic={isArabic} onPage={p => void loadLogs(p)} />
          </div>
        )
      )}
    </section>
  );
}

function Pager({ page, totalPages, isArabic, onPage }: { page: number; totalPages: number; isArabic: boolean; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between text-sm" style={{ color: 'var(--cms-text-soft)' }}>
      <span>
        {isArabic ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border disabled:opacity-40"
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <ChevronLeft className="w-4 h-4" /> {isArabic ? 'السابق' : 'Prev'}
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border disabled:opacity-40"
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          {isArabic ? 'التالي' : 'Next'} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
