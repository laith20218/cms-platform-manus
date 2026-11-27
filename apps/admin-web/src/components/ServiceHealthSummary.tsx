import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowLeftRight, RefreshCw, Server, TriangleAlert } from 'lucide-react';
import { fetchServersSummary, type ServersSummary } from '../lib/api';
import { localeOf, t } from '../lib/dictionary';
import {
  overallStatusLabel,
  overallStatusTone,
  providerStatusLabel,
  providerStatusTone,
  serversToneClasses,
} from '../lib/serversStatus';

/**
 * Phase 3 (command-center dashboard) — compact service-health summary on the
 * Overview, linking to the full read-only Servers Dashboard (/servers).
 *
 * Contract: GET /api/v1/admin/servers/summary (SuperAdmin + ServersView on the
 * backend). Honest states only — loading skeleton, real provider rows, or the
 * «تعذّر التحميل» state with retry. No fabricated metrics; no provider
 * mutation controls anywhere (the center is read-only by design). Loaded once
 * on mount + manual refresh — the full center owns conservative polling.
 */

type LoadState = 'loading' | 'ready' | 'unavailable';

export function ServiceHealthSummary({
  token,
  isArabic,
  onOpenCenter,
}: {
  token: string;
  isArabic: boolean;
  onOpenCenter: () => void;
}) {
  const locale = localeOf(isArabic);
  const [state, setState] = useState<LoadState>('loading');
  const [summary, setSummary] = useState<ServersSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (fresh: boolean) => {
    setRefreshing(true);
    try {
      const result = await fetchServersSummary(token, fresh);
      setSummary(result);
      setUpdatedAt(new Date());
      setState('ready');
    } catch {
      // Honest unavailable — never a fabricated "all systems up".
      setSummary(null);
      setState('unavailable');
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void load(false);
    // Load once per mount/token; the full Servers Dashboard owns polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const updatedLabel = updatedAt
    ? new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { timeStyle: 'short', dateStyle: 'short' }).format(updatedAt)
    : null;

  return (
    <section
      className="stat-grid service-health-summary"
      aria-labelledby="service-health-title"
      data-testid="service-health-summary"
      dir={isArabic ? 'rtl' : 'ltr'}
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
    >
      <div className="stat-card" data-testid="service-health-card">
        <header className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--cms-text)' }}>
            <span className="p-1.5 rounded-lg" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
              <Server size={15} aria-hidden="true" />
            </span>
            {t(locale, 'servers.summaryCardTitle')}
          </h3>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { void load(true); }}
              disabled={refreshing}
              aria-label={t(locale, 'servers.refreshA11y')}
              data-testid="service-health-refresh"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-2xs font-semibold disabled:opacity-50 cursor-pointer"
              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} aria-hidden="true" />
              {t(locale, 'servers.refresh')}
            </button>
            <button
              type="button"
              onClick={onOpenCenter}
              data-testid="service-health-open-center"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-2xs font-semibold cursor-pointer"
              style={{ borderColor: 'var(--cms-teal-500)', color: 'var(--cms-teal-700)', background: 'var(--cms-teal-50)' }}
            >
              <ArrowLeftRight size={13} aria-hidden="true" />
              {t(locale, 'servers.summaryCardOpenCenter')}
            </button>
          </div>
        </header>

        {state === 'loading' && (
          <div className="flex items-center gap-2 py-4" role="status" aria-label={t(locale, 'common.loading')} data-testid="service-health-loading">
            <span className="skeleton" style={{ width: 14, height: 14, borderRadius: 999 }} />
            <span className="skeleton" style={{ width: 120, height: 10 }} />
          </div>
        )}

        {state === 'unavailable' && (
          <div className="flex items-center gap-2 py-3 text-xs" role="status" data-testid="service-health-unavailable" style={{ color: 'var(--cms-danger)' }}>
            <TriangleAlert size={15} aria-hidden="true" />
            <span>{t(locale, 'servers.summaryLoadError')}</span>
            <button
              type="button"
              onClick={() => { void load(true); }}
              data-testid="service-health-retry"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-2xs font-semibold cursor-pointer"
              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
            >
              {t(locale, 'servers.retry')}
            </button>
          </div>
        )}

        {state === 'ready' && summary && (
          <div className="flex flex-col gap-3 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold ${serversToneClasses(overallStatusTone(summary.overallStatus))}`}
                data-testid="service-health-overall"
              >
                <Activity size={13} aria-hidden="true" />
                {t(locale, 'servers.overallLabel')}: {overallStatusLabel(locale, summary.overallStatus)}
              </span>
              {updatedLabel && (
                <span className="text-2xs" style={{ color: 'var(--cms-text-muted)' }}>
                  {t(locale, 'servers.checkedAt')}: {updatedLabel}
                </span>
              )}
            </div>
            <ul className="flex items-center gap-2 flex-wrap list-none p-0 m-0" aria-label={t(locale, 'servers.providerNavLabel')}>
              {summary.providers.map((provider) => (
                <li key={provider.provider} className="inline-flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-2xs font-bold ${serversToneClasses(providerStatusTone(provider.status))}`}
                  >
                    {providerStatusLabel(locale, provider.status)}
                  </span>
                  <span className="text-2xs font-semibold" style={{ color: 'var(--cms-text-soft)' }}>
                    {provider.provider}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
