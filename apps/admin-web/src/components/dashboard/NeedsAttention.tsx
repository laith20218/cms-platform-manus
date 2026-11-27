import { CircleCheck, ClipboardCheck, Server, TriangleAlert } from 'lucide-react';
import { t, localeOf } from '../../lib/dictionary';
import type { Locale } from '../../lib/dictionary';

/**
 * NeedsAttention — the prioritized, actionable-conditions area of the Command
 * Center dashboard (spec §4). ONLY real conditions render here:
 *
 *   • pending question reports awaiting moderation (> 0)
 *   • service-health summary unavailable (monitoring could not be verified)
 *   • metrics feed failed (KPIs are stale / missing)
 *
 * A calm, non-alarming confirmation renders when nothing needs action. No
 * fabricated numbers — every condition comes from a real feed and carries a
 * navigation action to the center that owns it.
 */

export type NeedsAttentionInput = {
  /** Real count from the dashboard stats feed; null = feed unavailable. */
  pendingReports: number | null;
  /** Service-health summary feed state (mirrors ServiceHealthSummary). */
  serviceHealth: 'loading' | 'ready' | 'unavailable';
  /** KPI feed state. */
  statsFailed: boolean;
};

type Props = NeedsAttentionInput & {
  isArabic: boolean;
  onOpenReports: () => void;
  onOpenServers: () => void;
  onRetryStats: () => void;
};

type Condition = {
  key: string;
  tone: 'warning' | 'danger';
  icon: typeof TriangleAlert;
  title: string;
  actionLabel: string;
  onAction: () => void;
  testId: string;
};

export function NeedsAttention({
  isArabic,
  pendingReports,
  serviceHealth,
  statsFailed,
  onOpenReports,
  onOpenServers,
  onRetryStats,
}: Props) {
  const locale: Locale = localeOf(isArabic);
  const dir = isArabic ? 'rtl' : 'ltr';

  const conditions: Condition[] = [];
  if (typeof pendingReports === 'number' && pendingReports > 0) {
    conditions.push({
      key: 'reports',
      tone: 'warning',
      icon: ClipboardCheck,
      title: t(locale, 'dashboard.needs.reports', { count: pendingReports }),
      actionLabel: t(locale, 'dashboard.needs.openReports'),
      onAction: onOpenReports,
      testId: 'needs-attention-reports',
    });
  }
  if (serviceHealth === 'unavailable') {
    conditions.push({
      key: 'servers',
      tone: 'danger',
      icon: Server,
      title: t(locale, 'dashboard.needs.servers'),
      actionLabel: t(locale, 'dashboard.needs.openServers'),
      onAction: onOpenServers,
      testId: 'needs-attention-servers',
    });
  }
  if (statsFailed) {
    conditions.push({
      key: 'stats',
      tone: 'danger',
      icon: TriangleAlert,
      title: t(locale, 'dashboard.statsError'),
      actionLabel: t(locale, 'dashboard.needs.retry'),
      onAction: onRetryStats,
      testId: 'needs-attention-stats',
    });
  }

  return (
    <section
      aria-labelledby="needs-attention-title"
      data-testid="needs-attention"
      dir={dir}
      style={{
        border: '1px solid var(--cms-line)',
        borderRadius: 'var(--cms-radius-lg, 12px)',
        background: 'var(--cms-surface)',
        padding: '14px 16px',
        boxShadow: 'var(--cms-shadow-xs, none)',
      }}
    >
      <h3
        id="needs-attention-title"
        style={{
          fontSize: 'var(--cms-text-2xs, 11px)',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--cms-text-muted)',
          marginBottom: 10,
        }}
      >
        {t(locale, 'dashboard.needs.title')}
      </h3>

      {conditions.length === 0 ? (
        <p
          data-testid="needs-attention-clear"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'var(--cms-text-sm, 13px)',
            color: 'var(--cms-text-soft)',
          }}
        >
          <CircleCheck size={16} aria-hidden="true" style={{ color: 'var(--cms-success)' }} />
          {t(locale, 'dashboard.needs.clear')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conditions.map((condition) => (
            <li
              key={condition.key}
              data-testid={condition.testId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                padding: '10px 12px',
                borderRadius: 'var(--cms-radius-md, 8px)',
                border: `1px solid ${condition.tone === 'danger' ? 'var(--cms-danger)' : 'var(--cms-warning)'}`,
                background: condition.tone === 'danger' ? 'var(--cms-danger-50)' : 'var(--cms-warning-50)',
              }}
            >
              <condition.icon
                size={16}
                aria-hidden="true"
                style={{ color: condition.tone === 'danger' ? 'var(--cms-danger)' : 'var(--cms-warning)', flexShrink: 0 }}
              />
              <span
                style={{
                  flex: '1 1 240px',
                  fontSize: 'var(--cms-text-sm, 13px)',
                  fontWeight: 600,
                  color: condition.tone === 'danger' ? 'var(--cms-danger)' : 'var(--cms-warning)',
                }}
              >
                {condition.title}
              </span>
              <button
                type="button"
                onClick={condition.onAction}
                data-testid={`${condition.testId}-action`}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--cms-radius-md, 8px)',
                  border: '1px solid currentColor',
                  background: 'transparent',
                  color: 'inherit',
                  fontSize: 'var(--cms-text-xs, 12px)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {condition.actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
