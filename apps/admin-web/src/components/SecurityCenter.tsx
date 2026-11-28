/**
 * SecurityCenter — PR-6: the super-admin security investigation surface.
 *
 * Endpoints (documented contracts, implemented by the parallel backend PR):
 *   • GET /api/v1/security/summary                (contract F) — metric strip
 *     + deterministic suspicious-activity indicators. Numbers are rendered
 *     exactly as recorded: no invented values, no external data, no polling.
 *   • GET /api/v1/security/audit-logs             (contract G, existing
 *     endpoint) — the full event table with server-side filters (studentId,
 *     eventType, severity, date range, search) + pagination, and a row-detail
 *     drawer with the technical block + fixed redaction notice.
 *
 * The ?student=<id> URL parameter (written by the Students Center drawer's
 * «كل الأحداث الأمنية للطالب» link) pre-filters the table to one student.
 *
 * Event labels + the event-type dropdown vocabulary come from the shared
 * lib/securityEventLabels.ts (same mapping as the Students Center).
 */
import { useEffect, useState } from 'react';
import {
  CalendarClock, ClipboardList, Fingerprint, History, Info,
  LoaderCircle, RotateCcw, Search, ShieldAlert, ShieldCheck, X, Ban,
} from 'lucide-react';
import {
  ApiError,
  fetchSecurityEvents,
  fetchSecuritySummary,
  type SecurityEventItem,
  type SecuritySummaryDto,
} from '../lib/api';
import { t, localeOf, type Locale } from '../lib/dictionary';
import { securityEventLabel, SECURITY_EVENT_TYPES } from '../lib/securityEventLabels';
import { Drawer, EmptyState, ErrorState, Pagination } from '@cms/ui';
import { useQueryState } from '../lib/useQueryState';

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const PAGE_SIZE = 25;

function dateLabel(value: string | null | undefined, isArabic: boolean) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '—';
  }
}

const severityBadge = (severity: string) => {
  const value = (severity || '').toLowerCase();
  if (value === 'critical') return 'text-red-700 bg-red-50 border-red-200';
  if (value === 'warning') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-sky-700 bg-sky-50 border-sky-200';
};

const severityDot = (severity: string) => {
  const value = (severity || '').toLowerCase();
  if (value === 'critical') return 'bg-red-500';
  if (value === 'warning') return 'bg-amber-500';
  return 'bg-sky-500';
};

const severityLabel = (severity: string, locale: Locale) => {
  const value = (severity || '').toLowerCase();
  if (value === 'critical') return t(locale, 'audit.severity.critical');
  if (value === 'warning') return t(locale, 'audit.severity.warning');
  return t(locale, 'audit.severity.info');
};

const actorLabel = (event: SecurityEventItem, locale: Locale) => {
  if (event.adminName) return t(locale, 'audit.actor.admin', { name: event.adminName });
  if (event.studentName) return t(locale, 'audit.actor.student', { name: event.studentName });
  return t(locale, 'security.events.actorNone');
};

/** Event category → plain-language explanation key (security.eventsExplained.*). */
const EVENT_EXPLANATION_PATHS: Record<string, string> = {
  LoginSuccess: 'loginSuccess',
  LoginFailed: 'loginFailed',
  Logout: 'logout',
  SessionCreated: 'session',
  SessionRevoked: 'session',
  Refresh: 'refresh',
  RefreshReuse: 'refreshReuse',
  DeviceRegistered: 'device',
  DeviceChange: 'device',
  DeviceBindingFailed: 'device',
  DevtoolsDetected: 'contentProtection',
  ScreenshotAttempt: 'contentProtection',
  CopyAttempt: 'contentProtection',
  DownloadAttempt: 'contentProtection',
  PrintAttempt: 'contentProtection',
  MultipleAccountsSuspected: 'multipleAccounts',
  BanIssued: 'ban',
  BanLifted: 'ban',
  PasswordChanged: 'password',
  PasswordResetRequested: 'password',
  MfaEnabled: 'mfa',
  MfaFailed: 'mfa',
  MfaDisabled: 'mfa',
  SubscriptionActivated: 'subscription',
  SubscriptionRevoked: 'subscription',
  OtpSent: 'otp',
  OtpVerified: 'otp',
  OtpFailed: 'otp',
  FileAccess: 'file',
  FileAccessDenied: 'file',
  SignedUrlIssued: 'file',
  FileScanRejected: 'file',
  EntitlementDenied: 'entitlement',
  OfflinePackageCreated: 'offline',
  OfflinePackageRevoked: 'offline',
  OfflineSyncRejected: 'offline',
  PermissionChange: 'permission',
  RoleChange: 'permission',
  AdminAction: 'adminAction',
  AdminScopeDenied: 'adminAction',
  SecurityAlert: 'securityAlert',
  SuspiciousActivity: 'suspiciousActivity',
};

function eventExplanation(eventType: string, locale: Locale): string {
  const key = EVENT_EXPLANATION_PATHS[eventType];
  if (key) return t(locale, `security.eventsExplained.${key}`);
  return t(locale, 'security.eventsExplained.fallback');
}

export function SecurityCenter({ token, isArabic, onError, onNotice }: Props) {
  const locale = localeOf(isArabic);
  const dir = isArabic ? 'rtl' : 'ltr';
  // Cross-center deep link: ?student=<id> pre-filters the table to one student.
  const studentFilterState = useQueryState('student', '');
  const studentFilter = studentFilterState.value;

  // ===== Summary (contract F) =====
  const [summary, setSummary] = useState<SecuritySummaryDto | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const [summaryForbidden, setSummaryForbidden] = useState(false);
  const [summaryTick, setSummaryTick] = useState(0);

  // ===== Events (contract G) =====
  const [events, setEvents] = useState<SecurityEventItem[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [eventsForbidden, setEventsForbidden] = useState(false);
  const [eventsTick, setEventsTick] = useState(0);
  const [severity, setSeverity] = useState('');
  const [eventType, setEventType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<SecurityEventItem | null>(null);

  // Debounce the server-side search (mirrors AuditLogViewer).
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setEventsPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Auto-fetch on mount + manual refresh only — no polling (conservative).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(false);
    setSummaryForbidden(false);
    fetchSecuritySummary(token)
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSummaryError(true);
        setSummaryForbidden(error instanceof ApiError && error.status === 403);
        onError(error instanceof Error ? error.message : t(locale, 'security.summary.summaryLoadError'));
      })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch effect: locale/onError are read for error toasts only; listing them would refetch on every locale toggle
  }, [token, summaryTick]);

  // Events fetch on filter/page/student changes.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(false);
    setEventsForbidden(false);
    fetchSecurityEvents(token, {
      page: eventsPage,
      pageSize: PAGE_SIZE,
      studentId: studentFilter || undefined,
      eventType: eventType || undefined,
      // The chips are lower-case; the wire value is the enum member name.
      severity: severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: debouncedSearch.trim() || undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setEvents(data.items ?? []);
        setEventsTotal(data.total ?? 0);
        setEventsPage(data.page || eventsPage);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setEvents([]);
        setEventsTotal(0);
        setEventsError(true);
        setEventsForbidden(error instanceof ApiError && error.status === 403);
        onError(error instanceof Error ? error.message : t(locale, 'security.events.loadError'));
      })
      .finally(() => { if (!cancelled) setEventsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch effect: locale/onError are read for error toasts only; listing them would refetch on every locale toggle
  }, [token, eventsPage, severity, eventType, dateFrom, dateTo, debouncedSearch, studentFilter, eventsTick]);

  const refreshAll = () => {
    setSummaryTick((tick) => tick + 1);
    setEventsTick((tick) => tick + 1);
    onNotice(t(locale, 'security.filters.refreshToast'));
  };

  const hasFilters = Boolean(severity || eventType || dateFrom || dateTo || debouncedSearch.trim() || studentFilter);

  const clearFilters = () => {
    setSeverity('');
    setEventType('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setEventsPage(1);
    studentFilterState.setValue('');
  };

  // ===== Deterministic indicators (from the SAME summary — no invented numbers) =====
  const indicators: Array<{ key: string; title: string; explanation: string; technical: string }> = [];
  if (summary) {
    if ((summary.activeLockouts ?? 0) > 0) {
      indicators.push({
        key: 'lockouts',
        title: t(locale, 'security.indicators.lockouts.title', { count: summary.activeLockouts }),
        explanation: t(locale, 'security.indicators.lockouts.explanation'),
        technical: t(locale, 'security.indicators.lockouts.technical'),
      });
    }
    if ((summary.refreshReuse7d ?? 0) > 0) {
      indicators.push({
        key: 'refreshReuse',
        title: t(locale, 'security.indicators.refreshReuse.title', { count: summary.refreshReuse7d }),
        explanation: t(locale, 'security.indicators.refreshReuse.explanation'),
        technical: t(locale, 'security.indicators.refreshReuse.technical'),
      });
    }
    if ((summary.suspiciousAlerts7d ?? 0) > 0) {
      indicators.push({
        key: 'suspicious',
        title: t(locale, 'security.indicators.suspicious.title', { count: summary.suspiciousAlerts7d }),
        explanation: t(locale, 'security.indicators.suspicious.explanation'),
        technical: t(locale, 'security.indicators.suspicious.technical'),
      });
    }
    if ((summary.topFailedLoginIps24h ?? []).some((row) => (row.count ?? 0) >= 10)) {
      indicators.push({
        key: 'ipConcentration',
        title: t(locale, 'security.indicators.ipConcentration.title'),
        explanation: t(locale, 'security.indicators.ipConcentration.explanation'),
        technical: t(locale, 'security.indicators.ipConcentration.technical'),
      });
    }
  }

  const metricCard = (label: string, value: number | undefined, caption: string, testId: string, tone: 'info' | 'danger' | 'warning') => (
    <article
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
      data-testid={testId}
    >
      <p className="text-2xl font-bold tabular-nums" style={{ color: tone === 'danger' ? 'var(--cms-danger)' : tone === 'warning' ? 'var(--cms-warning)' : 'var(--cms-teal-700)' }}>
        {typeof value === 'number' ? value : t(locale, 'security.summary.unavailable')}
      </p>
      <p className="text-xs font-semibold mt-1" style={{ color: 'var(--cms-text)' }}>{label}</p>
      <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--cms-text-muted)' }}>{caption}</p>
    </article>
  );

  return (
    <section className="space-y-6" dir={dir} data-testid="security-center">
      {/* ===== Page header ===== */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl shrink-0" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
              {t(locale, 'navGroups.audit')}
            </p>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--cms-text)' }}>
              {t(locale, 'security.title')}
            </h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {t(locale, 'security.description')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={summaryLoading}
          data-testid="security-refresh"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium disabled:opacity-50"
          style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
        >
          {summaryLoading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          {t(locale, 'security.filters.refresh')}
        </button>
      </header>

      {/* ===== Summary strip (contract F) ===== */}
      {summaryLoading && !summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-busy="true" data-testid="security-summary-skeleton">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
            <div key={row} className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--cms-line)' }}>
              <div className="h-7 rounded bg-slate-100 animate-pulse w-1/3" />
              <div className="h-3 rounded bg-slate-100 animate-pulse w-2/3" />
              <div className="h-2 rounded bg-slate-100 animate-pulse w-full" />
            </div>
          ))}
        </div>
      ) : summaryForbidden ? (
        <ErrorState title={t(locale, 'audit.center.errorForbidden')} dir={dir} testId="security-summary-forbidden" />
      ) : summaryError ? (
        <ErrorState
          title={t(locale, 'security.summary.summaryLoadError')}
          retryLabel={t(locale, 'security.summary.retry')}
          onRetry={() => setSummaryTick((tick) => tick + 1)}
          dir={dir}
          testId="security-summary-error"
        />
      ) : summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {metricCard(t(locale, 'security.summary.failedLogins24h.label'), summary.failedLogins24h, t(locale, 'security.summary.failedLogins24h.caption'), 'security-metric-failed-logins-24h', 'danger')}
            {metricCard(t(locale, 'security.summary.failedLogins7d.label'), summary.failedLogins7d, t(locale, 'security.summary.failedLogins7d.caption'), 'security-metric-failed-logins-7d', 'danger')}
            {metricCard(t(locale, 'security.summary.activeLockouts.label'), summary.activeLockouts, t(locale, 'security.summary.activeLockouts.caption'), 'security-metric-active-lockouts', (summary.activeLockouts ?? 0) > 0 ? 'danger' : 'info')}
            {metricCard(t(locale, 'security.summary.refreshReuse7d.label'), summary.refreshReuse7d, t(locale, 'security.summary.refreshReuse7d.caption'), 'security-metric-refresh-reuse', (summary.refreshReuse7d ?? 0) > 0 ? 'warning' : 'info')}
            {/* MFA combined card: enabled / disabled / failed in one tile. */}
            <article className="rounded-xl border p-4" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }} data-testid="security-metric-mfa">
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--cms-teal-700)' }}>
                {summary.mfaEnabled7d ?? 0}
                <span className="text-sm font-semibold" style={{ color: 'var(--cms-text-muted)' }}> / {summary.mfaDisabled7d ?? 0} / {summary.mfaFailed7d ?? 0}</span>
              </p>
              <p className="text-xs font-semibold mt-1" style={{ color: 'var(--cms-text)' }}>{t(locale, 'security.summary.mfa.title')}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--cms-text-muted)' }}>
                {t(locale, 'security.summary.mfa.enabled')} · {t(locale, 'security.summary.mfa.disabled')} · {t(locale, 'security.summary.mfa.failed')}
              </p>
              <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'security.summary.mfa.caption')}</p>
            </article>
            {metricCard(t(locale, 'security.summary.criticalEvents7d.label'), summary.criticalEvents7d, t(locale, 'security.summary.criticalEvents7d.caption'), 'security-metric-critical-events', 'danger')}
            {metricCard(t(locale, 'security.summary.suspiciousAlerts7d.label'), summary.suspiciousAlerts7d, t(locale, 'security.summary.suspiciousAlerts7d.caption'), 'security-metric-suspicious-alerts', (summary.suspiciousAlerts7d ?? 0) > 0 ? 'warning' : 'info')}
            {metricCard(t(locale, 'security.summary.passwordResets7d.label'), summary.passwordResets7d, t(locale, 'security.summary.passwordResets7d.caption'), 'security-metric-password-resets', 'info')}
          </div>

          {/* Honesty caption + generatedAt + top failed-login IPs */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-[10px] max-w-xl" style={{ color: 'var(--cms-text-muted)' }}>
              {t(locale, 'security.summary.sourceNote')}
            </p>
            {summary.generatedAt && (
              <p className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                {t(locale, 'security.summary.generatedAt')}: {dateLabel(summary.generatedAt, isArabic)}
              </p>
            )}
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }} data-testid="security-top-failed-ips">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--cms-text)' }}>{t(locale, 'security.summary.topFailedIpsTitle')}</p>
            {(summary.topFailedLoginIps24h ?? []).length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'security.summary.topFailedIpsEmpty')}</p>
            ) : (
              <ul className="space-y-1">
                {(summary.topFailedLoginIps24h ?? []).map((row) => (
                  <li key={row.ipAddress} className="flex items-center justify-between gap-3 text-xs">
                    <code dir="ltr" className="font-mono" style={{ color: 'var(--cms-text-soft)' }}>{row.ipAddress}</code>
                    <span className="font-semibold tabular-nums" style={{ color: (row.count ?? 0) >= 10 ? 'var(--cms-danger)' : 'var(--cms-text-soft)' }}>
                      {row.count ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ===== Suspicious-activity indicators (deterministic) ===== */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }} data-testid="security-indicators">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" style={{ color: 'var(--cms-warning)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{t(locale, 'security.indicators.heading')}</h3>
            </div>
            {indicators.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'security.indicators.empty')}</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {indicators.map((indicator) => (
                  <article key={indicator.key} className="rounded-lg border p-3 space-y-1.5" style={{ borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)' }} data-testid={`security-indicator-${indicator.key}`}>
                    <p className="text-sm font-bold" style={{ color: 'var(--cms-warning)' }}>{indicator.title}</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--cms-text-soft)' }}>{indicator.explanation}</p>
                    <p className="text-[10px] font-mono leading-relaxed" style={{ color: 'var(--cms-text-muted)' }}>{indicator.technical}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== Events table (contract G) ===== */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
        <div className="p-4 border-b space-y-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" style={{ color: 'var(--cms-teal-700)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{t(locale, 'security.events.tableTitle')}</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>{eventsTotal}</span>
            </div>
            {studentFilter && (
              <div className="flex items-center gap-2 flex-wrap" data-testid="security-student-filter">
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
                  {t(locale, 'security.events.studentFilterActive')}
                  <button
                    type="button"
                    onClick={() => studentFilterState.setValue('')}
                    aria-label={t(locale, 'security.events.clearStudentFilter')}
                    data-testid="security-student-filter-clear"
                    className="inline-flex"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              </div>
            )}
          </div>
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t(locale, 'security.filters.searchPlaceholder')}
                aria-label={t(locale, 'security.filters.searchA11y')}
                data-testid="security-search"
                className="w-full pr-10 pl-3 py-2 rounded-lg border text-sm bg-white"
                style={{ borderColor: 'var(--cms-line-strong)' }}
              />
            </div>
            {/* Severity chips */}
            <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={t(locale, 'audit.severity.heading')}>
              {(['', 'info', 'warning', 'critical'] as const).map((value) => {
                const active = severity === value;
                const label = value === '' ? t(locale, 'security.filters.severityAll') : severityLabel(value, locale);
                return (
                  <button
                    key={value || 'all'}
                    type="button"
                    aria-pressed={active}
                    data-testid={`security-severity-${value || 'all'}`}
                    onClick={() => { setSeverity(value); setEventsPage(1); }}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${severityBadge(value || 'info')}`}
                    style={{ borderColor: active ? 'var(--cms-teal-600)' : 'var(--cms-line-strong)' }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {/* Event type (full enum with bilingual labels) */}
            <select
              value={eventType}
              onChange={(event) => { setEventType(event.target.value); setEventsPage(1); }}
              aria-label={t(locale, 'audit.headings.type')}
              data-testid="security-event-type"
              className="px-3 py-2 rounded-lg border text-sm bg-white"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            >
              <option value="">{t(locale, 'security.filters.eventTypeAll')}</option>
              {SECURITY_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>{securityEventLabel(type, locale)}</option>
              ))}
            </select>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => { setDateFrom(event.target.value); setEventsPage(1); }}
                aria-label={t(locale, 'security.filters.dateFrom')}
                className="px-3 py-2 rounded-lg border text-sm bg-white"
                style={{ borderColor: 'var(--cms-line-strong)', maxWidth: 150 }}
              />
              <input
                type="date"
                value={dateTo}
                onChange={(event) => { setDateTo(event.target.value); setEventsPage(1); }}
                aria-label={t(locale, 'security.filters.dateTo')}
                className="px-3 py-2 rounded-lg border text-sm bg-white"
                style={{ borderColor: 'var(--cms-line-strong)', maxWidth: 150 }}
              />
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium"
                  style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                  data-testid="security-clear-filters"
                >
                  <X className="w-3.5 h-3.5" />
                  {t(locale, 'security.filters.clear')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table body */}
        {eventsLoading ? (
          <div className="p-4 space-y-1" aria-busy="true" data-testid="security-events-loading">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="flex items-center gap-4 px-3 py-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 rounded bg-slate-100 animate-pulse w-1/4" />
                  <div className="h-3 rounded bg-slate-100 animate-pulse w-2/3" />
                </div>
                <div className="h-6 w-16 rounded-full bg-slate-100 animate-pulse" />
              </div>
            ))}
          </div>
        ) : eventsForbidden ? (
          <div className="p-4">
            <ErrorState title={t(locale, 'audit.center.errorForbidden')} dir={dir} testId="security-events-forbidden" />
          </div>
        ) : eventsError ? (
          <div className="p-4">
            <ErrorState
              title={t(locale, 'security.events.loadError')}
              retryLabel={t(locale, 'security.events.retry')}
              onRetry={() => setEventsTick((tick) => tick + 1)}
              dir={dir}
              testId="security-events-error"
            />
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t(locale, 'security.events.emptyTitle')}
            description={t(locale, 'security.events.emptyHint')}
            dir={dir}
            testId="security-events-empty"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
                <tr>
                  <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'audit.headings.time')}</th>
                  <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'audit.headings.type')}</th>
                  <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'audit.severity.heading')}</th>
                  <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'audit.headings.description')}</th>
                  <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'audit.headings.actor')}</th>
                  <th className="text-start px-4 py-3 font-semibold text-xs uppercase tracking-wider">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--cms-line)' }}>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    onClick={() => setSelectedEvent(event)}
                    data-testid={`security-event-row-${event.id}`}
                  >
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--cms-text-soft)' }}>{dateLabel(event.createdAt, isArabic)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-sm" style={{ color: 'var(--cms-text)' }} title={event.eventType}>{securityEventLabel(event.eventType, locale)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${severityBadge(event.severity)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${severityDot(event.severity)} opacity-80`} />
                        {severityLabel(event.severity, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <p className="text-xs truncate" style={{ color: 'var(--cms-text-soft)' }} title={event.description}>{event.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}>
                        {actorLabel(event, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono" style={{ color: event.ipAddress ? 'var(--cms-text-soft)' : 'var(--cms-text-muted)' }}>{event.ipAddress || '—'}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 pb-4">
              <Pagination
                page={eventsPage}
                pageSize={PAGE_SIZE}
                total={eventsTotal}
                onPageChange={(next) => setEventsPage(next)}
                dir={dir}
                testId="security-events-pagination"
                labels={{
                  navLabel: t(locale, 'security.events.tableTitle'),
                  prev: t(locale, 'audit.viewer.prev'),
                  next: t(locale, 'audit.viewer.next'),
                  pageOf: (page, pages) => t(locale, 'audit.viewer.page') + ' ' + page + ' ' + t(locale, 'audit.viewer.of') + ' ' + pages,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ===== Event detail drawer (technical block + redaction notice) ===== */}
      <Drawer
        open={selectedEvent !== null}
        onOpenChange={(next) => { if (!next) setSelectedEvent(null); }}
        title={t(locale, 'security.detail.drawerTitle')}
        description={selectedEvent ? securityEventLabel(selectedEvent.eventType, locale) : undefined}
        dir={dir}
        size="lg"
        closeLabel={t(locale, 'security.detail.close')}
        testId="security-event-detail"
      >
        {selectedEvent && (
          <div className="space-y-4" data-testid="security-event-detail-body">
            {/* Full description — plain text only (React escapes). */}
            <section className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'security.detail.descriptionTitle')}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--cms-text)' }}>{selectedEvent.description}</p>
            </section>

            {/* Plain-language explanation per event category. */}
            <section className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)' }} data-testid="security-event-explanation">
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--cms-teal-700)' }}>{t(locale, 'security.detail.explanationTitle')}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--cms-text)' }}>{eventExplanation(selectedEvent.eventType, locale)}</p>
            </section>

            {/* Technical block. */}
            <section className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'security.detail.technicalTitle')}</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <dt style={{ color: 'var(--cms-text-muted)' }}><History className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--cms-text-muted)' }} /> {t(locale, 'security.detail.createdAt')}:</dt>
                  <dd className="font-mono" style={{ color: 'var(--cms-text)' }}>{dateLabel(selectedEvent.createdAt, isArabic)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt style={{ color: 'var(--cms-text-muted)' }}><ShieldAlert className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--cms-text-muted)' }} /> {t(locale, 'security.detail.eventType')}:</dt>
                  <dd dir="ltr" className="font-mono" style={{ color: 'var(--cms-text)' }}>{selectedEvent.eventType}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt style={{ color: 'var(--cms-text-muted)' }}><CalendarClock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--cms-text-muted)' }} /> {t(locale, 'security.detail.actor')}:</dt>
                  <dd style={{ color: 'var(--cms-text)' }}>{actorLabel(selectedEvent, locale)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt style={{ color: 'var(--cms-text-muted)' }}><Ban className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--cms-text-muted)' }} /> {t(locale, 'security.detail.ipAddress')}:</dt>
                  <dd dir="ltr" className="font-mono" style={{ color: 'var(--cms-text)' }}>{selectedEvent.ipAddress || '—'}</dd>
                </div>
                {selectedEvent.correlationId && (
                  <div className="flex items-center gap-2 sm:col-span-2">
                                        <dt style={{ color: 'var(--cms-text-muted)' }}><Info className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--cms-text-muted)' }} /> {t(locale, 'security.detail.correlationId')}:</dt>
                    <dd dir="ltr" className="font-mono break-all" style={{ color: 'var(--cms-text)' }} data-testid="security-event-correlation">{selectedEvent.correlationId}</dd>
                  </div>
                )}
                {selectedEvent.deviceFingerprint && (
                  <div className="flex items-center gap-2 sm:col-span-2">
                                        <dt style={{ color: 'var(--cms-text-muted)' }}><Fingerprint className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--cms-text-muted)' }} /> {t(locale, 'security.detail.fingerprint')}:</dt>
                    <dd dir="ltr" className="font-mono" style={{ color: 'var(--cms-text)' }} title={selectedEvent.deviceFingerprint}>
                      {selectedEvent.deviceFingerprint.slice(0, 8) + '…'}
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            {/* Fixed redaction notice. */}
            <p className="flex items-start gap-2 rounded-lg border p-3 text-[10px] leading-relaxed" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text-muted)' }} data-testid="security-event-redaction">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{t(locale, 'security.detail.redaction')}</span>
            </p>
          </div>
        )}
      </Drawer>
    </section>
  );
}
