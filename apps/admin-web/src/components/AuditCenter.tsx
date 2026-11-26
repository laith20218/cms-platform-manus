/**
 * AuditCenter — institutional security audit surface.
 *
 * Composition:
 *   • Page header with eyebrow + bilingual title + subtitle
 *   • Filter bar (severity select + search) inside a bordered card
 *   • Responsive table (overflow-x-auto) with timestamp, event type (with icon),
 *     severity badge, description, actor, IP columns
 *   • Event-type icon map: LoginSuccess/LoginFailed/Logout/Session*=LogIn,
 *     Mfa*=ShieldCheck, Device*=Smartphone, Ban*=Ban, Refresh*=RefreshCw,
 *     Screenshot/Copy/Download*=ShieldAlert, default=ShieldCheck
 *   • Severity badges: Info=sky, Warning=amber, Critical=red
 *   • Skeleton loading rows
 *   • Empty state: "No security events" / "لا توجد أحداث أمنية"
 *
 * Data source: `GET /api/v1/security/alerts?count=N` — the backend endpoint currently
 * returns Critical-severity events only (filtered server-side). The UI severity filter
 * operates on the returned set so future expansions are visible without code changes.
 *
 * Design tokens (--cms-*) are applied via inline style; structural styling is pure Tailwind.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Ban, ClipboardList, LogIn,
  RefreshCw, Search, ShieldAlert, ShieldCheck, Smartphone, X,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import { t, localeOf, type Locale } from '../lib/dictionary';
import { AuditLogViewer } from './AuditLogViewer';

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

type SecurityAlert = {
  id: string;
  eventType: string;
  severity: string;
  description: string;
  studentId?: string | null;
  studentName?: string | null;
  adminId?: string | null;
  adminName?: string | null;
  ipAddress?: string | null;
  createdAt: string;
};

type LucideIcon = typeof LogIn;

const EVENT_ICON: Record<string, LucideIcon> = {
  LoginSuccess: LogIn,
  LoginFailed: LogIn,
  Logout: LogIn,
  SessionCreated: LogIn,
  SessionRevoked: LogIn,
  Refresh: RefreshCw,
  RefreshReuse: RefreshCw,
  DeviceRegistered: Smartphone,
  DeviceChange: Smartphone,
  DeviceBindingFailed: Smartphone,
  DevtoolsDetected: ShieldAlert,
  ScreenshotAttempt: ShieldAlert,
  CopyAttempt: ShieldAlert,
  DownloadAttempt: ShieldAlert,
  MfaEnabled: ShieldCheck,
  MfaDisabled: ShieldCheck,
  MfaChallenged: ShieldCheck,
  BanApplied: Ban,
  BanRevoked: Ban,
};

const SEVERITY_BADGE: Record<string, string> = {
  Info: 'text-sky-700 bg-sky-50 border-sky-200',
  Warning: 'text-amber-700 bg-amber-50 border-amber-200',
  Critical: 'text-red-700 bg-red-50 border-red-200',
};

const SEVERITY_DOT: Record<string, string> = {
  Info: 'bg-sky-500',
  Warning: 'bg-amber-500',
  Critical: 'bg-red-500',
};

const EVENT_ICON_TINT: Record<string, string> = {
  Info: 'var(--cms-info-50)',
  Warning: 'var(--cms-warning-50)',
  Critical: 'var(--cms-danger-50)',
};

const EVENT_ICON_COLOR: Record<string, string> = {
  Info: 'var(--cms-info)',
  Warning: 'var(--cms-warning)',
  Critical: 'var(--cms-danger)',
};

function dateLabel(value: string | null | undefined, isArabic: boolean) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '—';
  }
}

function eventTypeLabel(eventType: string, isArabic: boolean) {
  const arMap: Record<string, string> = {
    LoginSuccess: 'نجاح الدخول',
    LoginFailed: 'فشل الدخول',
    Logout: 'تسجيل الخروج',
    SessionCreated: 'إنشاء جلسة',
    SessionRevoked: 'إنهاء جلسة',
    Refresh: 'تجديد الجلسة',
    RefreshReuse: 'إعادة استخدام الرمز',
    DeviceRegistered: 'تسجيل جهاز',
    DeviceChange: 'تغيير جهاز',
    DeviceBindingFailed: 'فشل ربط الجهاز',
    DevtoolsDetected: 'كشف أدوات المطوّر',
    ScreenshotAttempt: 'محاولة لقطة شاشة',
    CopyAttempt: 'محاولة نسخ',
    DownloadAttempt: 'محاولة تنزيل',
    MfaEnabled: 'تفعيل التحقق الثنائي',
    MfaDisabled: 'تعطيل التحقق الثنائي',
    MfaChallenged: 'تحقق ثنائي',
    BanApplied: 'تطبيق حظر',
    BanRevoked: 'رفع حظر',
  };
  if (isArabic && arMap[eventType]) return arMap[eventType];
  // Insert spaces before capital letters for English readability.
  return eventType.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function severityLabel(severity: string, locale: Locale) {
  const value = (severity || '').toLowerCase();
  if (value === 'critical') return t(locale, 'audit.severity.critical');
  if (value === 'warning') return t(locale, 'audit.severity.warning');
  return t(locale, 'audit.severity.info');
}

function actorLabel(alert: SecurityAlert, locale: Locale) {
  if (alert.adminName) return t(locale, 'audit.actor.admin', { name: alert.adminName });
  if (alert.adminId) return t(locale, 'audit.actor.admin', { name: alert.adminId.slice(0, 8) });
  if (alert.studentName) return t(locale, 'audit.actor.student', { name: alert.studentName });
  if (alert.studentId) return t(locale, 'audit.actor.student', { name: alert.studentId.slice(0, 8) });
  return t(locale, 'audit.actor.system');
}

export function AuditCenter({ token, isArabic, onError }: Props) {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');  // P1-07: structured event-type filter
  const [dateFrom, setDateFrom] = useState('');  // P1-07: date range filter
  const [dateTo, setDateTo] = useState('');
  const [query, setQuery] = useState('');
  // P1-07: real severity counts from /audit-logs (not just /alerts which returns Critical only)
  const [realCounts, setRealCounts] = useState<{ critical: number; warning: number; info: number } | null>(null);
  const locale = localeOf(isArabic);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      // P1-07: fetch critical alerts for the table (legacy behavior preserved)
      apiRequest<SecurityAlert[]>(`/api/v1/security/alerts?count=100`, token)
        .then((data) => {
          if (cancelled) return;
          setAlerts(Array.isArray(data) ? data : []);
        })
        .catch((error) => {
          if (cancelled) return;
          if (error instanceof ApiError && error.status === 403) {
            onError(t(locale, 'audit.center.errorForbidden'));
          } else {
            onError(error instanceof Error ? error.message : t(locale, 'audit.center.errorLoad'));
          }
          setAlerts([]);
        })
        .finally(() => { if (!cancelled) setLoading(false); });

      // P1-07: fetch real severity counts from /audit-logs (returns ALL severities, not just Critical)
      const countParams = new URLSearchParams({ page: '1', pageSize: '1' });
      apiRequest<{ total: number }>(`/api/v1/security/audit-logs?${countParams}`, token)
        .then(res => { if (!cancelled) setRealCounts({ critical: 0, warning: 0, info: res.total }); })
        .catch(() => { /* silent — counts are optional */ });

      // Fetch per-severity counts (3 small requests — acceptable for the dashboard)
      Promise.all([
        apiRequest<{ total: number }>(`/api/v1/security/audit-logs?page=1&pageSize=1&severity=Critical`, token).catch(() => null),
        apiRequest<{ total: number }>(`/api/v1/security/audit-logs?page=1&pageSize=1&severity=Warning`, token).catch(() => null),
        apiRequest<{ total: number }>(`/api/v1/security/audit-logs?page=1&pageSize=1&severity=Info`, token).catch(() => null),
      ]).then(([crit, warn, info]) => {
        if (cancelled) return;
        setRealCounts({
          critical: crit?.total ?? 0,
          warning: warn?.total ?? 0,
          info: info?.total ?? 0,
        });
      });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTime = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;
    return alerts.filter((alert) => {
      if (severityFilter && alert.severity !== severityFilter) return false;
      if (eventTypeFilter && alert.eventType !== eventTypeFilter) return false;
      if (fromTime || toTime) {
        const eventTime = new Date(alert.createdAt).getTime();
        if (fromTime && eventTime < fromTime) return false;
        if (toTime && eventTime > toTime) return false;
      }
      if (!q) return true;
      return (
        alert.eventType.toLowerCase().includes(q)
        || alert.description.toLowerCase().includes(q)
        || (alert.ipAddress ?? '').toLowerCase().includes(q)
        || (alert.studentName ?? '').toLowerCase().includes(q)
        || (alert.adminName ?? '').toLowerCase().includes(q)
        || (alert.studentId ?? '').toLowerCase().includes(q)
        || (alert.adminId ?? '').toLowerCase().includes(q)
      );
    });
  }, [alerts, severityFilter, eventTypeFilter, dateFrom, dateTo, query]);

  const inputClass = 'w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors';
  // P1-07: use realCounts from /audit-logs if available, fall back to local alerts count
  const counts = useMemo(() => ({
    info: realCounts?.info ?? alerts.filter((a) => (a.severity || '').toLowerCase() === 'info').length,
    warning: realCounts?.warning ?? alerts.filter((a) => (a.severity || '').toLowerCase() === 'warning').length,
    critical: realCounts?.critical ?? alerts.filter((a) => (a.severity || '').toLowerCase() === 'critical').length,
  }), [alerts, realCounts]);

  return (
    <section className="space-y-6" dir={isArabic ? 'rtl' : 'ltr'}>
      {/* ===== Page header ===== */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className="p-2.5 rounded-xl shrink-0"
            style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
          >
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
              {t(locale, 'audit.center.eyebrow')}
            </p>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              {t(locale, 'audit.center.title')}
              <span
                className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold"
                style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}
              >
                {alerts.length}
              </span>
            </h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {t(locale, 'audit.center.subtitle')}
            </p>
          </div>
        </div>
      </header>

      {/* ===== Severity summary cards ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([
          { key: 'Critical', count: counts.critical, label: t(locale, 'audit.severity.critical'), tint: 'var(--cms-danger-50)', color: 'var(--cms-danger)' },
          { key: 'Warning', count: counts.warning, label: t(locale, 'audit.severity.warning'), tint: 'var(--cms-warning-50)', color: 'var(--cms-warning)' },
          { key: 'Info', count: counts.info, label: t(locale, 'audit.severity.info'), tint: 'var(--cms-info-50)', color: 'var(--cms-info)' },
        ]).map((card) => (
          <div
            key={card.key}
            className="rounded-xl border p-4 flex items-center gap-3"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold"
              style={{ background: card.tint, color: card.color }}
            >
              {card.count}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                {t(locale, 'audit.severity.heading')}
              </p>
              <p className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ===== Filter bar ===== */}
      <div
        className="flex flex-wrap gap-3 items-center p-4 rounded-xl border"
        style={{ background: 'var(--cms-surface)', borderColor: 'var(--cms-line)' }}
      >
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(locale, 'audit.center.searchPlaceholder')}
            className={`${inputClass} pr-10`}
            style={{ borderColor: 'var(--cms-line-strong)' }}
          />
        </div>
        <select
          value={severityFilter}
          onChange={(event) => setSeverityFilter(event.target.value)}
          className={inputClass}
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <option value="">{t(locale, 'audit.center.severityAll')}</option>
          <option value="Critical">{t(locale, 'audit.severity.critical')}</option>
          <option value="Warning">{t(locale, 'audit.severity.warning')}</option>
          <option value="Info">{t(locale, 'audit.severity.info')}</option>
        </select>
        {/* P1-07: structured event-type filter */}
        <select
          value={eventTypeFilter}
          onChange={(event) => setEventTypeFilter(event.target.value)}
          className={inputClass}
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <option value="">{t(locale, 'audit.center.eventTypeAll')}</option>
          <option value="LoginSuccess">{t(locale, 'audit.eventTypes.loginSuccess')}</option>
          <option value="LoginFailed">{t(locale, 'audit.eventTypes.loginFailed')}</option>
          <option value="Logout">{t(locale, 'audit.eventTypes.logout')}</option>
          <option value="SessionCreated">{t(locale, 'audit.eventTypes.sessionCreated')}</option>
          <option value="SessionRevoked">{t(locale, 'audit.eventTypes.sessionRevoked')}</option>
          <option value="DeviceRegistered">{t(locale, 'audit.eventTypes.deviceRegistered')}</option>
          <option value="BanIssued">{t(locale, 'audit.eventTypes.banIssued')}</option>
          <option value="BanLifted">{t(locale, 'audit.eventTypes.banLifted')}</option>
          <option value="MfaEnabled">{t(locale, 'audit.eventTypes.mfaEnabled')}</option>
          <option value="MfaDisabled">{t(locale, 'audit.eventTypes.mfaDisabled')}</option>
          <option value="PermissionChange">{t(locale, 'audit.eventTypes.permissionChange')}</option>
          <option value="RoleChange">{t(locale, 'audit.eventTypes.roleChange')}</option>
          <option value="SecurityAlert">{t(locale, 'audit.eventTypes.securityAlert')}</option>
          <option value="SuspiciousActivity">{t(locale, 'audit.eventTypes.suspiciousActivity')}</option>
        </select>
        {/* P1-07: date range filter */}
        <input
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          className={inputClass}
          style={{ borderColor: 'var(--cms-line-strong)', maxWidth: '160px' }}
          aria-label={t(locale, 'audit.center.dateFrom')}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          className={inputClass}
          style={{ borderColor: 'var(--cms-line-strong)', maxWidth: '160px' }}
          aria-label={t(locale, 'audit.center.dateTo')}
        />
        {(severityFilter || eventTypeFilter || dateFrom || dateTo || query.trim()) && (
          <button
            type="button"
            onClick={() => { setSeverityFilter(''); setEventTypeFilter(''); setDateFrom(''); setDateTo(''); setQuery(''); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors hover:bg-slate-50"
            style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
          >
            <X className="w-4 h-4" />
            {t(locale, 'audit.center.clearFilters')}
          </button>
        )}
      </div>

      {/* ===== Audit table ===== */}
      {loading ? (
        <div className="rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
          <div className="space-y-1 p-2">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="flex items-center gap-4 px-3 py-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-3.5 rounded bg-slate-100 animate-pulse w-1/4" />
                  <div className="h-3 rounded bg-slate-100 animate-pulse w-2/3" />
                </div>
                <div className="h-6 w-16 rounded-full bg-slate-100 animate-pulse shrink-0" />
                <div className="h-3 w-28 rounded bg-slate-100 animate-pulse shrink-0" />
                <div className="h-3 w-20 rounded bg-slate-100 animate-pulse shrink-0" />
              </div>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl border bg-white flex flex-col items-center justify-center text-center py-16 px-6"
          style={{ borderColor: 'var(--cms-line)' }}
        >
          <div className="p-3 rounded-full" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
            <ClipboardList className="w-7 h-7" />
          </div>
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>
            {t(locale, 'audit.center.emptyTitle')}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {alerts.length === 0
              ? t(locale, 'audit.center.emptyNoEvents')
              : t(locale, 'audit.center.emptyFiltered')}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
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
              {filtered.map((alert) => {
                const severityKey = (alert.severity || '').toLowerCase().replace(/^./, (c) => c.toUpperCase());
                const badgeClass = SEVERITY_BADGE[severityKey] ?? 'text-slate-600 bg-slate-50 border-slate-200';
                const dotClass = SEVERITY_DOT[severityKey] ?? 'bg-slate-400';
                const Icon = EVENT_ICON[alert.eventType] ?? ShieldCheck;
                const iconTint = EVENT_ICON_TINT[severityKey] ?? 'var(--cms-ivory-100)';
                const iconColor = EVENT_ICON_COLOR[severityKey] ?? 'var(--cms-text-muted)';
                return (
                  <tr key={alert.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--cms-text-soft)' }}>
                      {dateLabel(alert.createdAt, isArabic)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: iconTint, color: iconColor }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-sm" style={{ color: 'var(--cms-text)' }}>
                          {eventTypeLabel(alert.eventType, isArabic)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${badgeClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dotClass} opacity-80`} />
                        {severityLabel(alert.severity, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs leading-relaxed max-w-md" style={{ color: 'var(--cms-text-soft)' }}>
                        {alert.description}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono"
                        style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}
                      >
                        {actorLabel(alert, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono" style={{ color: alert.ipAddress ? 'var(--cms-text-soft)' : 'var(--cms-text-muted)' }}>
                        {alert.ipAddress || '—'}
                      </code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Full Audit Log Viewer — additive section (P1-06)
          Server-side filters + pagination + CSV export.
          Calls GET /api/v1/security/audit-logs (returns ALL severities, unlike /alerts above). */}
      <div className="mt-6">
        <AuditLogViewer token={token} isArabic={isArabic} onError={onError} />
      </div>
    </section>
  );
}
