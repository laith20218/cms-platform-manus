import { RefreshCw, ShieldCheck, TriangleAlert, Wifi, WifiOff } from 'lucide-react';
import { t, localeOf } from '../../lib/dictionary';
import type { Locale } from '../../lib/dictionary';

/**
 * CommandHeader — the Command Center's masthead (dashboard spec §4).
 *
 * Structure: Arabic title + concise subtitle, then the environment/API status
 * strip (environment chip, truthful API connectivity, last-updated timestamp,
 * refresh control). One primary safe action only — تحديث البيانات. No
 * fabricated states: the connectivity pill mirrors the shell's real health
 * probe, the environment chip is derived from the API origin, and the stale
 * note appears only when metrics actually failed.
 */

type Props = {
  isArabic: boolean;
  /** Derived environment label (production / preview / local…). */
  environmentLabel: string;
  /** Shell-level health probe state. */
  apiStatus: 'healthy' | 'degraded' | 'unknown';
  /** Formatted last-update label ('—' while loading). */
  updatedLabel: string;
  /** Refresh is the single primary action of the header. */
  onRefresh: () => void;
  refreshing: boolean;
  /** Honest reason line when metrics could not be loaded. */
  statsFailed: boolean;
};

export function CommandHeader({
  isArabic,
  environmentLabel,
  apiStatus,
  updatedLabel,
  onRefresh,
  refreshing,
  statsFailed,
}: Props) {
  const locale: Locale = localeOf(isArabic);
  const dir = isArabic ? 'rtl' : 'ltr';

  const apiLabel = apiStatus === 'healthy'
    ? t(locale, 'dashboard.commandApiHealthy')
    : apiStatus === 'degraded'
      ? t(locale, 'dashboard.commandApiDegraded')
      : t(locale, 'dashboard.commandApiUnknown');

  return (
    <section className="command-header" dir={dir} data-testid="dashboard-command-header">
      <div className="command-header-main">
        <h2>{t(locale, 'shell.command')}</h2>
        <p>{t(locale, 'shell.commandSub')}</p>
      </div>

      {/* Environment / API status strip — truthful, derived, never fabricated. */}
      <div
        className="command-header-strip"
        data-testid="dashboard-command-strip"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--cms-space-3, 12px)',
          marginTop: 'var(--cms-space-3, 12px)',
        }}
      >
        <span
          className="command-env-chip"
          data-testid="dashboard-env-chip"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid var(--cms-line-strong, var(--cms-line))',
            fontSize: 'var(--cms-text-2xs, 11px)',
            fontWeight: 700,
            color: 'var(--cms-text-soft)',
            background: 'var(--cms-surface)',
          }}
        >
          <ShieldCheck size={13} aria-hidden="true" style={{ color: 'var(--cms-teal-700)' }} />
          {environmentLabel}
        </span>

        <span
          className="command-api-chip"
          data-testid="dashboard-api-chip"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid var(--cms-line-strong, var(--cms-line))',
            fontSize: 'var(--cms-text-2xs, 11px)',
            fontWeight: 700,
            color: apiStatus === 'healthy' ? 'var(--cms-success)' : apiStatus === 'degraded' ? 'var(--cms-danger)' : 'var(--cms-text-muted)',
            background: 'var(--cms-surface)',
          }}
        >
          {apiStatus === 'healthy'
            ? <Wifi size={13} aria-hidden="true" />
            : <WifiOff size={13} aria-hidden="true" />}
          {t(locale, 'dashboard.commandApiLabel')}: {apiLabel}
        </span>

        <span
          className="command-updated"
          data-testid="dashboard-updated"
          style={{
            fontSize: 'var(--cms-text-2xs, 11px)',
            color: 'var(--cms-text-muted)',
          }}
        >
          {t(locale, 'dashboard.lastUpdated')}: {updatedLabel}
        </span>

        <span style={{ marginInlineStart: 'auto' }}>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            data-testid="dashboard-refresh"
            className="command-refresh"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 'var(--cms-radius-md, 8px)',
              border: '1px solid var(--cms-teal-700)',
              background: 'var(--cms-teal-700)',
              color: '#fff',
              fontSize: 'var(--cms-text-xs, 12px)',
              fontWeight: 600,
              cursor: refreshing ? 'default' : 'pointer',
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
            {refreshing ? t(locale, 'dashboard.commandRefreshing') : t(locale, 'dashboard.commandRefresh')}
          </button>
        </span>
      </div>

      {statsFailed && (
        <p
          role="status"
          data-testid="dashboard-command-stale"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            fontSize: 'var(--cms-text-2xs, 11px)',
            color: 'var(--cms-warning)',
          }}
        >
          <TriangleAlert size={13} aria-hidden="true" />
          {t(locale, 'dashboard.commandStale')}
        </p>
      )}
    </section>
  );
}
