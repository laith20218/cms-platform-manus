import { useEffect, useState } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { fetchSecuritySummary, type SecuritySummaryDto } from '../../lib/api';
import { t, localeOf } from '../../lib/dictionary';
import type { Locale } from '../../lib/dictionary';

/**
 * SecurityStatus — the dashboard's security posture line (spec §4 §7).
 *
 * Contract: GET /api/v1/security/summary (contract F, real metrics). Honest
 * states only: loading skeleton, real numbers, or غير متاح when the feed
 * fails — never fabricated zeroes. Deep-links to the Security Center; no
 * mutation controls of any kind.
 */

type LoadState = 'loading' | 'ready' | 'unavailable';

type Props = {
  token: string;
  isArabic: boolean;
  onOpenCenter: () => void;
};

export function SecurityStatus({ token, isArabic, onOpenCenter }: Props) {
  const locale: Locale = localeOf(isArabic);
  const dir = isArabic ? 'rtl' : 'ltr';
  const [state, setState] = useState<LoadState>('loading');
  const [summary, setSummary] = useState<SecuritySummaryDto | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchSecuritySummary(token)
      .then((data) => { if (!cancelled) { setSummary(data); setState('ready'); } })
      .catch(() => { if (!cancelled) { setSummary(null); setState('unavailable'); } });
    return () => { cancelled = true; };
  }, [token]);

  const attentionNeeded = state === 'ready' && summary != null
    && (summary.activeLockouts > 0 || summary.criticalEvents7d > 0 || summary.suspiciousAlerts7d > 0);

  return (
    <section
      aria-labelledby="dashboard-security-title"
      data-testid="dashboard-security-status"
      dir={dir}
      style={{
        border: '1px solid var(--cms-line)',
        borderRadius: 'var(--cms-radius-lg, 12px)',
        background: 'var(--cms-surface)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: 'var(--cms-shadow-xs, none)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h3
          id="dashboard-security-title"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--cms-text-2xs, 11px)',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--cms-text-muted)',
            margin: 0,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              padding: 5,
              borderRadius: 'var(--cms-radius-md, 8px)',
              background: 'var(--cms-teal-50)',
              color: 'var(--cms-teal-700)',
            }}
          >
            <Lock size={13} aria-hidden="true" />
          </span>
          {t(locale, 'dashboard.securityTitle')}
        </h3>
        <button
          type="button"
          onClick={onOpenCenter}
          data-testid="dashboard-security-open"
          style={{
            padding: '5px 12px',
            borderRadius: 'var(--cms-radius-md, 8px)',
            border: '1px solid var(--cms-teal-500)',
            background: 'var(--cms-teal-50)',
            color: 'var(--cms-teal-700)',
            fontSize: 'var(--cms-text-xs, 12px)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t(locale, 'dashboard.securityOpenCenter')}
        </button>
      </div>

      {state === 'loading' && (
        <div role="status" data-testid="dashboard-security-loading" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="skeleton" style={{ width: 14, height: 14, borderRadius: 999 }} />
          <span className="skeleton" style={{ width: 180, height: 10 }} />
        </div>
      )}

      {state === 'unavailable' && (
        <p
          role="status"
          data-testid="dashboard-security-unavailable"
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--cms-text-sm, 13px)', color: 'var(--cms-text-muted)', margin: 0 }}
        >
          <ShieldAlert size={15} aria-hidden="true" />
          {t(locale, 'dashboard.securityUnavailable')}
        </p>
      )}

      {state === 'ready' && summary && (
        <div
          data-testid="dashboard-security-ready"
          style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 'var(--cms-text-sm, 13px)' }}
        >
          <span style={{ color: 'var(--cms-text-soft)' }}>
            {t(locale, 'dashboard.securityFailedLogins24h')}:{' '}
            <strong style={{ color: summary.failedLogins24h > 0 ? 'var(--cms-warning)' : 'var(--cms-text)' }}>
              {summary.failedLogins24h}
            </strong>
          </span>
          <span style={{ color: 'var(--cms-text-soft)' }}>
            {t(locale, 'dashboard.securityActiveLockouts')}:{' '}
            <strong style={{ color: summary.activeLockouts > 0 ? 'var(--cms-danger)' : 'var(--cms-text)' }}>
              {summary.activeLockouts}
            </strong>
          </span>
          <span style={{ color: 'var(--cms-text-soft)' }}>
            {t(locale, 'dashboard.securityCritical7d')}:{' '}
            <strong style={{ color: summary.criticalEvents7d > 0 ? 'var(--cms-danger)' : 'var(--cms-text)' }}>
              {summary.criticalEvents7d}
            </strong>
          </span>
          {attentionNeeded ? (
            <span style={{ color: 'var(--cms-danger)', fontWeight: 700 }} data-testid="dashboard-security-attention">
              {t(locale, 'dashboard.securityNeedsAttention')}
            </span>
          ) : (
            <span style={{ color: 'var(--cms-success)', fontWeight: 600 }}>
              {t(locale, 'dashboard.securityNoAttention')}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
