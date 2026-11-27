/**
 * ServersCenter — PR-9: the read-only provider-monitoring dashboard
 * (super-admin only; rides the view:audit gate exactly like /security).
 *
 * Endpoints (PR-8 backend, apps/api AdminServersController):
 *   • GET /api/v1/admin/servers/summary               — overall status + the
 *     four provider head rows (status / responseTimeMs / freshness / note);
 *   • GET /api/v1/admin/servers/{render|vercel|neon|github} — per-provider
 *     envelopes with the mapped payloads (service + deploy, the two Vercel
 *     projects, the Neon project + branch, the GitHub repo + workflows);
 *   • GET /api/v1/admin/servers/{provider}/history   — bounded in-memory
 *     check history (loaded on expand only).
 *
 * READ-ONLY BY DESIGN: there is no deploy, restart, env-var, domain, billing
 * or SQL control anywhere in this component — observation only. No tokens,
 * headers, or connection material are ever displayed: monitoring credential
 * STATUS (missing/invalid/rate-limited) arrives as backend DTO fields only.
 *
 * CONSERVATIVE POLLING: auto-refetch every 5 minutes exactly
 * (SERVERS_POLL_INTERVAL_MS — see lib/serversStatus.ts for the documented
 * interval rationale), paused while the tab is hidden via
 * document.visibilitychange; the first load is immediate and manual refresh
 * (fresh=true) is always available.
 *
 * Partial failure isolation: the summary and each provider envelope fail in
 * independent state slots — one provider error renders that section's error
 * surface with retry while the rest of the dashboard stays alive.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Database,
  ExternalLink,
  Github,
  History,
  LoaderCircle,
  RotateCcw,
  Server,
  ShieldCheck,
  Triangle,
  type LucideIcon,
} from 'lucide-react';
import {
  ApiError,
  fetchServersHistory,
  fetchServersProvider,
  fetchServersSummary,
  type GithubServersData,
  type NeonServersData,
  type ProviderEnvelope,
  type ProviderHistory,
  type RenderServersData,
  type ServersProviderHead,
  type ServersProviderName,
  type ServersSummary,
  type VercelServersData,
} from '../lib/api';
import { t, localeOf, type Locale } from '../lib/dictionary';
import {
  SERVERS_POLL_INTERVAL_MS,
  overallStatusLabel,
  overallStatusTone,
  providerStatusExplanation,
  providerStatusLabel,
  providerStatusTone,
  responseTimeLabel,
  serversToneClasses,
  type ServersTone,
} from '../lib/serversStatus';
import { Badge, EmptyState, ErrorState, Skeleton } from '@cms/ui';

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

/** Wire order (render / vercel / neon / github) matching the backend summary. */
const PROVIDER_ORDER: ServersProviderName[] = ['render', 'vercel', 'neon', 'github'];

const PROVIDER_ICONS: Record<ServersProviderName, LucideIcon> = {
  render: Server,
  vercel: Triangle,
  neon: Database,
  github: Github,
};

const PROVIDER_TITLE_KEYS: Record<ServersProviderName, string> = {
  render: 'servers.providers.render.title',
  vercel: 'servers.providers.vercel.title',
  neon: 'servers.providers.neon.title',
  github: 'servers.providers.github.title',
};

/** Badge variant + extra classes per tone (text always rides along — never color-only). */
const TONE_BADGES: Record<ServersTone, { variant: 'default' | 'success' | 'warning' | 'danger'; extra?: string }> = {
  ok: { variant: 'success' },
  warn: { variant: 'warning' },
  error: { variant: 'danger' },
  neutral: { variant: 'default' },
  config: { variant: 'warning', extra: 'border border-orange-300' },
  unknown: { variant: 'default' },
};

function dateLabel(value: string | null | undefined, isArabic: boolean): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '—';
  }
}

/** First 10 chars of a commit sha (mono display only — never a full secret-looking value). */
function sha10(sha: string | null | undefined): string {
  if (!sha) return '—';
  return sha.length <= 10 ? sha : sha.slice(0, 10);
}

/** Latest checkedAt across head rows (null when none — rendered as «—»). */
function latestCheckedAt(heads: ServersProviderHead[] | undefined): string | null {
  let latest: string | null = null;
  for (const head of heads ?? []) {
    if (!head.checkedAt) continue;
    if (latest === null || new Date(head.checkedAt).getTime() > new Date(latest).getTime()) latest = head.checkedAt;
  }
  return latest;
}

function localeNumber(locale: Locale, value: number): string {
  // Arabic-Indic digits requested explicitly (modern ICU defaults render
  // plain 'ar' with Western digits) — «٦٨٠» not "680".
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-arab' : 'en').format(value);
}

// ===== Small presentational pieces =====

function StatusBadge({ status, locale, testId, large }: { status: string; locale: Locale; testId?: string; large?: boolean }) {
  const tone = providerStatusTone(status);
  const conf = TONE_BADGES[tone];
  return (
    <Badge variant={conf.variant} shape="pill" size={large ? 'lg' : 'md'} className={conf.extra} data-testid={testId}>
      {providerStatusLabel(locale, status)}
    </Badge>
  );
}

function FreshnessBadge({ freshness, locale, testId }: { freshness: { cached: boolean; ageSeconds: number } | undefined | null; locale: Locale; testId?: string }) {
  if (!freshness) return null;
  const label = freshness.cached
    ? t(locale, 'servers.freshness.cached', { seconds: localeNumber(locale, freshness.ageSeconds) })
    : t(locale, 'servers.freshness.fresh');
  return (
    <Badge variant={freshness.cached ? 'default' : 'success'} shape="pill" size="sm" data-testid={testId}>
      {label}
    </Badge>
  );
}

/** Neutral pill for provider-internal wire values (deploy state / target / conclusion) — honest verbatim, no invented vocabulary. */
function RawValueBadge({ value, testId }: { value: string | null | undefined; testId?: string }) {
  if (!value) return <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>—</span>;
  return (
    <Badge variant="default" shape="pill" size="sm" className="font-mono" data-testid={testId} title={value}>
      {value}
    </Badge>
  );
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs min-w-0">
      <dt className="shrink-0" style={{ color: 'var(--cms-text-muted)' }}>{label}:</dt>
      <dd className="min-w-0 font-medium break-words" style={{ color: 'var(--cms-text)' }}>{children}</dd>
    </div>
  );
}

// ===== Per-provider envelope fetch (isolated failure slots) =====

interface EnvelopeSlot<TData> {
  envelope: ProviderEnvelope<TData> | null;
  loading: boolean;
  error: boolean;
  forbidden: boolean;
  retry: () => void;
}

function useProviderEnvelope<TData>(
  token: string,
  provider: ServersProviderName,
  poll: { tick: number; fresh: boolean },
  locale: Locale,
  onError: (message: string) => void,
): EnvelopeSlot<TData> {
  const [envelope, setEnvelope] = useState<ProviderEnvelope<TData> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setForbidden(false);
    fetchServersProvider<TData>(token, provider, poll.fresh)
      .then((data) => {
        if (cancelled) return;
        setEnvelope(data);
        setLoading(false);
        setError(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setEnvelope(null);
        setLoading(false);
        setError(true);
        setForbidden(cause instanceof ApiError && cause.status === 403);
        onError(cause instanceof Error ? cause.message : t(locale, 'servers.summaryLoadError'));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch effect: locale/onError are read for the error toast only; listing them would refetch on every locale toggle
  }, [token, provider, poll, retryTick]);

  const retry = useCallback(() => { setRetryTick((tick) => tick + 1); }, []);
  return { envelope, loading, error, forbidden, retry };
}

// ===== Collapsible per-provider check history (load on expand only) =====

function ProviderHistoryPanel(props: {
  token: string;
  provider: ServersProviderName;
  pollTick: number;
  locale: Locale;
  isArabic: boolean;
  dir: 'rtl' | 'ltr';
  onError: (message: string) => void;
}) {
  const { token, provider, pollTick, locale, isArabic, dir, onError } = props;
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ProviderHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // Load on expand ONLY: the first open fetches; a later poll tick (or retry)
  // refetches while the panel stays open. Collapsed panels never fetch.
  useEffect(() => {
    if (!token || !open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchServersHistory(token, provider)
      .then((data) => { if (!cancelled) setHistory(data); })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setHistory(null);
        setError(true);
        onError(cause instanceof Error ? cause.message : t(locale, 'servers.history.loadError'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch effect: load-on-expand driven by open/pollTick; locale/onError only feed the error toast
  }, [token, provider, open, pollTick, retryTick]);

  const toggle = () => setOpen((value) => !value);

  return (
    <div className="border-t" style={{ borderColor: 'var(--cms-line)' }} data-testid={`servers-history-${provider}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`servers-history-body-${provider}`}
        aria-label={t(locale, 'servers.history.toggle', { provider })}
        data-testid={`servers-history-toggle-${provider}`}
        className="flex items-center gap-2 w-full min-h-11 px-4 py-2 text-start text-xs font-semibold disabled:opacity-50"
        style={{ color: 'var(--cms-text-soft)' }}
      >
        <History className="w-4 h-4 shrink-0" style={{ color: 'var(--cms-text-muted)' }} />
        <span className="flex-1">{t(locale, 'servers.history.toggle', { provider })}</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div id={`servers-history-body-${provider}`} className="px-4 pb-4 space-y-2" data-testid={`servers-history-body-${provider}`}>
          {loading ? (
            <div className="space-y-2" aria-busy="true" data-testid={`servers-history-loading-${provider}`}>
              {[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-8 w-full rounded-lg" />)}
            </div>
          ) : error ? (
            <ErrorState
              title={t(locale, 'servers.history.loadError')}
              retryLabel={t(locale, 'servers.retry')}
              onRetry={() => setRetryTick((tick) => tick + 1)}
              dir={dir}
              testId={`servers-history-error-${provider}`}
            />
          ) : !history || history.items.length === 0 ? (
            <EmptyState
              icon={History}
              title={t(locale, 'servers.history.empty')}
              dir={dir}
              testId={`servers-history-empty-${provider}`}
            />
          ) : (
            <>
              <ul className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: 'var(--cms-line)' }} data-testid={`servers-history-list-${provider}`}>
                {/* Wire order is newest-first (documented ProviderHistoryDto contract). */}
                {history.items.map((item, index) => (
                  <li key={`${item.checkedAt}-${index}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5" data-testid={`servers-history-row-${provider}-${index}`}>
                    <StatusBadge status={item.status} locale={locale} />
                    <span className="text-xs tabular-nums" style={{ color: 'var(--cms-text-soft)' }}>
                      {responseTimeLabel(locale, item.responseTimeMs)}
                    </span>
                    <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--cms-text-muted)' }} dir="ltr">
                      {dateLabel(item.checkedAt, isArabic)}
                    </span>
                    {item.reason && (
                      <span className="text-[10px] min-w-0" style={{ color: 'var(--cms-danger)' }} data-testid={`servers-history-reason-${provider}-${index}`}>
                        {item.reason}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }} data-testid={`servers-history-capacity-${provider}`}>
                {t(locale, 'servers.history.capacity', { count: localeNumber(locale, history.capacity) })}
              </p>
              {/* Backend-authored bilingual disclaimer (in-memory window since the last API restart) — verbatim. */}
              <p className="text-[10px] leading-relaxed" style={{ color: 'var(--cms-text-muted)' }} data-testid={`servers-history-window-${provider}`}>
                {t(locale, 'servers.history.windowNoteLabel')}: {history.windowNote}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ===== The dashboard =====

export function ServersCenter({ token, isArabic, onError, onNotice }: Props) {
  const locale = localeOf(isArabic);
  const dir = isArabic ? 'rtl' : 'ltr';

  // Summary strip state.
  const [summary, setSummary] = useState<ServersSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);
  const [summaryForbidden, setSummaryForbidden] = useState(false);
  const [summaryRetryTick, setSummaryRetryTick] = useState(0);

  // Shared refresh clock: { tick, fresh }. Mount → tick 0 (cache read);
  // manual refresh bumps tick with fresh=true; the 5-minute auto poll bumps
  // tick with fresh=false. Every fetch effect keys off this one object, so
  // all sections move together and the fresh flag is always consistent.
  const [poll, setPoll] = useState<{ tick: number; fresh: boolean }>({ tick: 0, fresh: false });

  // Per-provider envelopes (independent failure slots — partial failure safe).
  const renderSlot = useProviderEnvelope<RenderServersData>(token, 'render', poll, locale, onError);
  const vercelSlot = useProviderEnvelope<VercelServersData>(token, 'vercel', poll, locale, onError);
  const neonSlot = useProviderEnvelope<NeonServersData>(token, 'neon', poll, locale, onError);
  const githubSlot = useProviderEnvelope<GithubServersData>(token, 'github', poll, locale, onError);

  const slots: Record<ServersProviderName, EnvelopeSlot<RenderServersData | VercelServersData | NeonServersData | GithubServersData>> = {
    render: renderSlot,
    vercel: vercelSlot,
    neon: neonSlot,
    github: githubSlot,
  };

  const busy = summaryLoading || renderSlot.loading || vercelSlot.loading || neonSlot.loading || githubSlot.loading;

  // Summary fetch (mount + every poll tick + retry).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(false);
    setSummaryForbidden(false);
    fetchServersSummary(token, poll.fresh)
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setSummaryError(true);
        setSummaryForbidden(cause instanceof ApiError && cause.status === 403);
        onError(cause instanceof Error ? cause.message : t(locale, 'servers.summaryLoadError'));
      })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch effect: locale/onError are read for the error toast only; listing them would refetch on every locale toggle
  }, [token, poll, summaryRetryTick]);

  // CONSERVATIVE POLLING — exactly 5 minutes (SERVERS_POLL_INTERVAL_MS).
  // Interval choice: the backend caches each provider check for 60s and the
  // providers rate-limit strictly, so one request per provider per 5-minute
  // tick stays far inside every quota while keeping the panel current.
  // Pauses while the tab is hidden: document.visibilitychange tears the
  // interval down on hide and reschedules it on return.
  useEffect(() => {
    if (!token) return;
    let timerId = 0;
    const schedule = () => {
      window.clearInterval(timerId);
      timerId = window.setInterval(() => {
        setPoll((prev) => ({ tick: prev.tick + 1, fresh: false }));
      }, SERVERS_POLL_INTERVAL_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') window.clearInterval(timerId);
      else schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [token]);

  // Manual refresh — always bypasses the 60s cache (fresh=true).
  const manualRefresh = () => {
    setPoll((prev) => ({ tick: prev.tick + 1, fresh: true }));
    onNotice(t(locale, 'servers.refreshToast'));
  };

  // Provider sections + nav scrolling.
  const sectionRefs = useRef<Record<ServersProviderName, HTMLElement | null>>({ render: null, vercel: null, neon: null, github: null });
  const scrollToSection = useCallback((provider: ServersProviderName) => {
    const node = sectionRefs.current[provider];
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const lastAttempted = latestCheckedAt(summary?.providers);
  const lastSuccessful = latestCheckedAt((summary?.providers ?? []).filter((head) => head.status === 'operational' || head.status === 'degraded'));

  const providerTitle = (provider: ServersProviderName) => t(locale, PROVIDER_TITLE_KEYS[provider]);

  // ===== Provider detail content renderers (stacked sections, always visible) =====

  const renderSectionBody = (provider: ServersProviderName, envelope: ProviderEnvelope<RenderServersData | VercelServersData | NeonServersData | GithubServersData> | null): ReactNode => {
    if (!envelope) return null;
    if (provider === 'render') return renderRenderBody(envelope as ProviderEnvelope<RenderServersData>);
    if (provider === 'vercel') return renderVercelBody(envelope as ProviderEnvelope<VercelServersData>);
    if (provider === 'neon') return renderNeonBody(envelope as ProviderEnvelope<NeonServersData>);
    return renderGithubBody(envelope as ProviderEnvelope<GithubServersData>);
  };

  const renderRenderBody = (envelope: ProviderEnvelope<RenderServersData>): ReactNode => {
    const data = envelope.data;
    if (!data) {
      return <div className="p-4"><EmptyState icon={Server} title={t(locale, 'servers.noProviderData')} dir={dir} testId="servers-render-empty" /></div>;
    }
    return (
      <div className="p-4 space-y-4">
        {data.service ? (
          <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }} data-testid="servers-render-service">
            <p className="text-xs font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.providers.render.serviceHeading')}</p>
            <dl className="space-y-1.5">
              <FactRow label={t(locale, 'servers.fields.name')}><span dir="ltr">{data.service.name}</span></FactRow>
              <FactRow label={t(locale, 'servers.fields.plan')}><span dir="ltr">{data.service.plan}</span></FactRow>
              <FactRow label={t(locale, 'servers.fields.region')}>
                <span dir="ltr">{data.service.region ?? '—'}</span>
              </FactRow>
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              {data.service.suspended
                ? <Badge variant="danger" shape="pill" size="sm" data-testid="servers-render-suspended">{t(locale, 'servers.providers.render.suspended')}</Badge>
                : <Badge variant="default" shape="pill" size="sm" data-testid="servers-render-suspended">{t(locale, 'servers.providers.render.notSuspended')}</Badge>}
              {data.service.autoDeploy
                ? <Badge variant="success" shape="pill" size="sm">{t(locale, 'servers.providers.render.autoDeployOn')}</Badge>
                : <Badge variant="warning" shape="pill" size="sm">{t(locale, 'servers.providers.render.autoDeployOff')}</Badge>}
            </div>
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.noProviderData')}</p>
        )}

        {data.lastDeploy ? (
          <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }} data-testid="servers-render-deploy">
            <p className="text-xs font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.providers.render.lastDeployHeading')}</p>
            <dl className="space-y-1.5">
              <FactRow label={t(locale, 'servers.fields.id')}><code dir="ltr" className="font-mono text-xs">{data.lastDeploy.id}</code></FactRow>
              <FactRow label={t(locale, 'servers.fields.state')}><RawValueBadge value={data.lastDeploy.status} testId="servers-render-deploy-status" /></FactRow>
              <FactRow label={t(locale, 'servers.fields.commit')}>
                <code dir="ltr" className="font-mono text-xs" data-testid="servers-render-deploy-commit">{sha10(data.lastDeploy.commitSha)}</code>
              </FactRow>
              {data.lastDeploy.commitMessage ? (
                <FactRow label={t(locale, 'servers.fields.commitMessage')}>
                  {/* Backend-sanitized (control-flattened + redacted) — plain text only. */}
                  <span className="text-xs">{data.lastDeploy.commitMessage}</span>
                </FactRow>
              ) : null}
              <FactRow label={t(locale, 'servers.fields.createdAt')}><span className="text-xs">{dateLabel(data.lastDeploy.createdAt, isArabic)}</span></FactRow>
              <FactRow label={t(locale, 'servers.fields.finishedAt')}><span className="text-xs">{dateLabel(data.lastDeploy.finishedAt, isArabic)}</span></FactRow>
            </dl>
          </div>
        ) : (
          <EmptyState icon={Server} title={t(locale, 'servers.providers.render.noDeploy')} dir={dir} testId="servers-render-nodeploy" />
        )}

        <div className="rounded-lg border p-3 space-y-1.5" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }} data-testid="servers-render-metrics">
          <p className="text-xs font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.providers.render.metricsHeading')}</p>
          {!data.metricsAvailable && (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--cms-text-soft)' }}>
              <Badge variant="warning" shape="pill" size="sm">{t(locale, 'servers.providers.render.metricsUnavailable')}</Badge>
              <span className="block mt-1.5 text-[10px]" style={{ color: 'var(--cms-text-muted)' }} data-testid="servers-render-metrics-reason">{data.metricsUnavailableReason}</span>
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderVercelBody = (envelope: ProviderEnvelope<VercelServersData>): ReactNode => {
    const data = envelope.data;
    const projects = data?.projects ?? [];
    if (!data || projects.length === 0) {
      return <div className="p-4"><EmptyState icon={Triangle} title={t(locale, 'servers.noProviderData')} dir={dir} testId="servers-vercel-empty" /></div>;
    }
    return (
      <div className="p-4 space-y-3">
        <p className="text-xs font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.providers.vercel.projectsHeading')}</p>
        {projects.map((project) => (
          <article key={project.id} className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }} data-testid={`servers-vercel-project-${project.name}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold" dir="ltr" style={{ color: 'var(--cms-text)' }}>{project.name}</span>
              {project.url ? (
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t(locale, 'servers.providers.vercel.openSite', { name: project.name })}
                  data-testid={`servers-vercel-url-${project.name}`}
                  className="inline-flex items-center gap-1 text-xs underline min-h-11 py-1 px-1"
                  style={{ color: 'var(--cms-teal-700)' }}
                  dir="ltr"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[220px]">{project.url}</span>
                </a>
              ) : (
                <span className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.providers.vercel.noUrl')}</span>
              )}
            </div>
            {project.latestDeployment ? (
              <dl className="space-y-1.5" data-testid={`servers-vercel-deployment-${project.name}`}>
                <FactRow label={t(locale, 'servers.fields.state')}><RawValueBadge value={project.latestDeployment.state} /></FactRow>
                <FactRow label={t(locale, 'servers.fields.target')}>
                  {project.latestDeployment.target === 'production'
                    ? <Badge variant="primary" shape="pill" size="sm" data-testid={`servers-vercel-target-${project.name}`}>{t(locale, 'servers.providers.vercel.production')}</Badge>
                    : project.latestDeployment.target === 'preview'
                      ? <Badge variant="default" shape="pill" size="sm" data-testid={`servers-vercel-target-${project.name}`}>{t(locale, 'servers.providers.vercel.preview')}</Badge>
                      : <RawValueBadge value={project.latestDeployment.target} />}
                </FactRow>
                <FactRow label={t(locale, 'servers.fields.commit')}>
                  <code dir="ltr" className="font-mono text-xs" data-testid={`servers-vercel-commit-${project.name}`}>{sha10(project.latestDeployment.commitSha)}</code>
                  {project.latestDeployment.commitRef && (
                    <span className="ms-2 font-mono text-[10px]" dir="ltr" style={{ color: 'var(--cms-text-muted)' }} data-testid={`servers-vercel-ref-${project.name}`}>{project.latestDeployment.commitRef}</span>
                  )}
                </FactRow>
                <FactRow label={t(locale, 'servers.fields.createdAt')}><span className="text-xs">{dateLabel(project.latestDeployment.createdAt, isArabic)}</span></FactRow>
                <FactRow label={t(locale, 'servers.fields.readyAt')}><span className="text-xs">{dateLabel(project.latestDeployment.readyAt, isArabic)}</span></FactRow>
              </dl>
            ) : (
              <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.providers.vercel.noDeployment')}</p>
            )}
          </article>
        ))}
      </div>
    );
  };

  const renderNeonBody = (envelope: ProviderEnvelope<NeonServersData>): ReactNode => {
    const data = envelope.data;
    return (
      <div className="p-4 space-y-4">
        {!data ? (
          <EmptyState icon={Database} title={t(locale, 'servers.noProviderData')} dir={dir} testId="servers-neon-empty" />
        ) : (
          <>
            {data.project ? (
              <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }} data-testid="servers-neon-project">
                <p className="text-xs font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.providers.neon.projectHeading')}</p>
                <dl className="space-y-1.5">
                  <FactRow label={t(locale, 'servers.fields.name')}><span dir="ltr">{data.project.name}</span></FactRow>
                  <FactRow label={t(locale, 'servers.fields.id')}><code dir="ltr" className="font-mono text-xs">{data.project.id}</code></FactRow>
                  <FactRow label={t(locale, 'servers.fields.region')}><span dir="ltr">{data.project.regionId ?? '—'}</span></FactRow>
                </dl>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.noProviderData')}</p>
            )}
            {data.branch ? (
              <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }} data-testid="servers-neon-branch">
                <p className="text-xs font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.providers.neon.branchHeading')}</p>
                <dl className="space-y-1.5">
                  <FactRow label={t(locale, 'servers.fields.name')}><span dir="ltr">{data.branch.name}</span></FactRow>
                  <FactRow label={t(locale, 'servers.fields.state')}><span dir="ltr" className="text-xs">{data.branch.state ?? '—'}</span></FactRow>
                </dl>
                <div className="flex flex-wrap items-center gap-2">
                  {data.branch.isDefault === true && <Badge variant="primary" shape="pill" size="sm">{t(locale, 'servers.providers.neon.branchDefault')}</Badge>}
                  {data.branch.protected === true && <Badge variant="default" shape="pill" size="sm">{t(locale, 'servers.providers.neon.branchProtected')}</Badge>}
                </div>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.noProviderData')}</p>
            )}
            <div className="rounded-lg border p-3 space-y-1.5" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }} data-testid="servers-neon-usage">
              <p className="text-xs font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.providers.neon.usageHeading')}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--cms-text-soft)' }}>
                <Badge variant="warning" shape="pill" size="sm">{t(locale, 'servers.providers.neon.usageUnavailable')}</Badge>
                <span className="block mt-1.5 text-[10px]" style={{ color: 'var(--cms-text-muted)' }} data-testid="servers-neon-usage-reason">{data.usageUnavailableReason}</span>
              </p>
            </div>
          </>
        )}
        {/* Fixed bilingual note: connection material is never requested or
            rendered — shown even when no Neon data exists. */}
        <p className="flex items-start gap-2 rounded-lg border p-3 text-[10px] leading-relaxed" style={{ borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }} data-testid="servers-neon-connection-note">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{t(locale, 'servers.providers.neon.connectionStringsNever')}</span>
        </p>
      </div>
    );
  };

  const renderGithubBody = (envelope: ProviderEnvelope<GithubServersData>): ReactNode => {
    const data = envelope.data;
    if (!data) {
      return <div className="p-4"><EmptyState icon={Github} title={t(locale, 'servers.noProviderData')} dir={dir} testId="servers-github-empty" /></div>;
    }
    const repository = data.repository;
    const workflows = data.recentWorkflows ?? [];
    const workflowTone = (conclusion: string): ServersTone => {
      const value = (conclusion || '').toLowerCase();
      if (value === 'success') return 'ok';
      if (['failure', 'timed_out', 'startup_failure'].includes(value)) return 'error';
      return 'neutral';
    };
    return (
      <div className="p-4 space-y-4">
        {repository ? (
          <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }} data-testid="servers-github-repository">
            <p className="text-xs font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.providers.github.repositoryHeading')}</p>
            <dl className="space-y-1.5">
              <FactRow label={t(locale, 'servers.fields.name')}><span dir="ltr">{repository.fullName}</span></FactRow>
              <FactRow label={t(locale, 'servers.fields.visibility')}><span dir="ltr" className="text-xs">{repository.visibility}</span></FactRow>
              <FactRow label={t(locale, 'servers.fields.defaultBranch')}><code dir="ltr" className="font-mono text-xs">{repository.defaultBranch}</code></FactRow>
              <FactRow label={t(locale, 'servers.fields.pushedAt')}><span className="text-xs">{dateLabel(repository.pushedAt, isArabic)}</span></FactRow>
              <FactRow label={t(locale, 'servers.fields.openIssues')}>
                <span className="text-xs tabular-nums">{typeof repository.openIssuesCount === 'number' ? localeNumber(locale, repository.openIssuesCount) : '—'}</span>
              </FactRow>
            </dl>
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.noProviderData')}</p>
        )}
        <div className="space-y-2" data-testid="servers-github-workflows">
          <p className="text-xs font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.providers.github.workflowsHeading')}</p>
          {workflows.length === 0 ? (
            <EmptyState icon={Github} title={t(locale, 'servers.providers.github.workflowsEmpty')} dir={dir} testId="servers-github-workflows-empty" />
          ) : (
            <ul className="divide-y rounded-lg border max-h-96 overflow-y-auto" style={{ borderColor: 'var(--cms-line)' }} data-testid="servers-github-workflow-list">
              {workflows.map((run) => {
                const conclusion = run.conclusion ?? undefined;
                const tone = conclusion ? workflowTone(conclusion) : 'neutral';
                const conf = TONE_BADGES[tone];
                return (
                  <li key={run.id} className="p-2.5 space-y-1" data-testid={`servers-github-workflow-${run.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold min-w-0" style={{ color: 'var(--cms-text)' }}>{run.name}</span>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {run.status && <RawValueBadge value={run.status} />}
                        {conclusion && (
                          <Badge variant={conf.variant} shape="pill" size="sm" className={conf.extra} data-testid={`servers-github-conclusion-${run.id}`}>{conclusion}</Badge>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                      <code dir="ltr" className="font-mono">{sha10(run.headSha)}</code>
                      <span>{t(locale, 'servers.fields.createdAt')}: {dateLabel(run.createdAt, isArabic)}</span>
                      <span>{t(locale, 'servers.fields.updatedAt')}: {dateLabel(run.updatedAt, isArabic)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  };

  // ===== Provider summary card (summary strip) =====

  const renderProviderCard = (provider: ServersProviderName) => {
    const head = summary?.providers.find((row) => row.provider === provider) ?? null;
    const Icon = PROVIDER_ICONS[provider];
    const vercelProjects = provider === 'vercel' ? (vercelSlot.envelope?.data?.projects ?? null) : null;
    const openDetail = () => scrollToSection(provider);
    return (
      <article
        key={provider}
        role="button"
        tabIndex={0}
        onClick={openDetail}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openDetail();
          }
        }}
        aria-label={t(locale, 'servers.cardOpenDetail', { provider: providerTitle(provider) })}
        data-testid={`servers-card-${provider}`}
        className="rounded-xl border p-4 space-y-2 text-start cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
        style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--cms-teal-700)' }} />
            <h3 className="text-sm font-bold truncate" style={{ color: 'var(--cms-text)' }}>{providerTitle(provider)}</h3>
          </div>
          <StatusBadge status={head?.status ?? 'unknown'} locale={locale} testId={`servers-card-${provider}-status`} />
        </div>
        <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }} data-testid={`servers-card-${provider}-response`}>
          {responseTimeLabel(locale, head?.responseTimeMs)}
        </p>
        <p className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
          {t(locale, 'servers.checkedAt')}: {dateLabel(head?.checkedAt, isArabic)}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <FreshnessBadge freshness={head?.freshness} locale={locale} testId={`servers-card-${provider}-freshness`} />
        </div>
        {head?.unavailableReason && (
          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--cms-danger)' }} data-testid={`servers-card-${provider}-reason`}>
            {t(locale, 'servers.reasonLabel')}: {head.unavailableReason}
          </p>
        )}
        {head?.note && (
          <p className="text-[10px] font-mono truncate" dir="ltr" title={head.note} data-testid={`servers-card-${provider}-note`} style={{ color: 'var(--cms-text-muted)' }}>
            {head.note}
          </p>
        )}
        {vercelProjects && vercelProjects.length > 0 && (
          <ul className="space-y-1 pt-1 border-t" style={{ borderColor: 'var(--cms-line)' }} data-testid="servers-card-vercel-projects">
            {vercelProjects.map((project) => (
              <li key={project.id} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="font-mono truncate" dir="ltr" style={{ color: 'var(--cms-text-soft)' }}>{project.name}</span>
                <span className="shrink-0" style={{ color: 'var(--cms-text-muted)' }} dir="ltr">{project.latestDeployment?.state ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </article>
    );
  };

  // ===== Provider detail section shell =====

  const renderProviderSection = (provider: ServersProviderName) => {
    const slot = slots[provider];
    const Icon = PROVIDER_ICONS[provider];
    const envelope = slot.envelope;
    return (
      <section
        key={provider}
        id={`servers-section-${provider}`}
        ref={(node) => { sectionRefs.current[provider] = node; }}
        aria-label={providerTitle(provider)}
        data-testid={`servers-section-${provider}`}
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
      >
        <header className="p-4 border-b space-y-2" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--cms-teal-700)' }} />
              <h3 className="text-sm font-bold" style={{ color: 'var(--cms-text)' }}>{providerTitle(provider)}</h3>
            </div>
            {envelope && <StatusBadge status={envelope.status} locale={locale} testId={`servers-section-${provider}-status`} />}
          </div>
          {envelope && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="text-xs" style={{ color: 'var(--cms-text-soft)' }} data-testid={`servers-section-${provider}-response`}>
                {responseTimeLabel(locale, envelope.responseTimeMs)}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                {t(locale, 'servers.checkedAt')}: {dateLabel(envelope.checkedAt, isArabic)}
              </span>
              <FreshnessBadge freshness={envelope.freshness} locale={locale} testId={`servers-section-${provider}-freshness`} />
            </div>
          )}
          {envelope && (
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--cms-text-soft)' }} data-testid={`servers-section-${provider}-explanation`}>
              {providerStatusExplanation(locale, envelope.status)}
            </p>
          )}
          {envelope?.unavailableReason && (
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--cms-danger)' }} data-testid={`servers-section-${provider}-reason`}>
              {t(locale, 'servers.reasonLabel')}: {envelope.unavailableReason}
            </p>
          )}
        </header>
        {slot.forbidden ? (
          <div className="p-4">
            <ErrorState title={t(locale, 'servers.forbidden')} dir={dir} testId={`servers-section-${provider}-forbidden`} />
          </div>
        ) : slot.error ? (
          <div className="p-4">
            <ErrorState
              title={t(locale, 'servers.summaryLoadError')}
              description={t(locale, 'servers.sectionReasonUnavailable')}
              retryLabel={t(locale, 'servers.retry')}
              onRetry={slot.retry}
              dir={dir}
              testId={`servers-section-${provider}-error`}
            />
          </div>
        ) : slot.loading && !envelope ? (
          <div className="p-4 space-y-3" aria-busy="true" data-testid={`servers-section-${provider}-skeleton`}>
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        ) : (
          renderSectionBody(provider, envelope)
        )}
        <ProviderHistoryPanel
          token={token}
          provider={provider}
          pollTick={poll.tick}
          locale={locale}
          isArabic={isArabic}
          dir={dir}
          onError={onError}
        />
      </section>
    );
  };

  const overallStatus = summary?.overallStatus ?? 'unknown';
  const overallTone = overallStatusTone(overallStatus);

  return (
    <section className="space-y-6" dir={dir} data-testid="servers-center">
      {/* ===== Page header ===== */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl shrink-0" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
              {t(locale, 'navGroups.audit')}
            </p>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--cms-text)' }}>{t(locale, 'servers.title')}</h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {t(locale, 'servers.description')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={manualRefresh}
          disabled={busy}
          aria-label={t(locale, 'servers.refreshA11y')}
          aria-busy={busy}
          data-testid="servers-refresh"
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-lg border text-sm font-medium disabled:opacity-50 cursor-pointer"
          style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
        >
          {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          {t(locale, 'servers.refresh')}
        </button>
      </header>

      {/* Fixed read-only notice — no mutation controls exist anywhere below. */}
      <p className="flex items-start gap-2 rounded-lg border p-3 text-[10px] leading-relaxed" style={{ borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }} data-testid="servers-readonly-notice">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{t(locale, 'servers.readOnlyNotice')}</span>
      </p>

      {/* ===== Overall hero line ===== */}
      <div className="rounded-xl border p-4 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'servers.overallLabel')}</span>
          <span role="status" data-testid="servers-overall-status" className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-bold ${serversToneClasses(overallTone)}`}>
            <span className="w-2 h-2 rounded-full bg-current opacity-70" aria-hidden="true" />
            {overallStatusLabel(locale, overallStatus)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
          <span data-testid="servers-checked-at">
            {t(locale, 'servers.checkedAt')}: {summary ? dateLabel(summary.checkedAt, isArabic) : '—'}
          </span>
          <span data-testid="servers-last-successful">
            {t(locale, 'servers.lastSuccessfulCheck')}: {dateLabel(lastSuccessful, isArabic)}
          </span>
          <span data-testid="servers-last-attempted">
            {t(locale, 'servers.lastAttemptedCheck')}: {dateLabel(lastAttempted, isArabic)}
          </span>
        </div>
        <p className="ms-auto text-[10px] max-w-sm" style={{ color: 'var(--cms-text-soft)' }} data-testid="servers-polling-note">
          {t(locale, 'servers.pollingNote')}
        </p>
      </div>

      {/* ===== Summary strip (four provider cards) ===== */}
      {summaryForbidden ? (
        <ErrorState title={t(locale, 'servers.forbidden')} dir={dir} testId="servers-summary-forbidden" />
      ) : summaryError ? (
        <ErrorState
          title={t(locale, 'servers.summaryLoadError')}
          retryLabel={t(locale, 'servers.retry')}
          onRetry={() => setSummaryRetryTick((tick) => tick + 1)}
          dir={dir}
          testId="servers-summary-error"
        />
      ) : summaryLoading && !summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" aria-busy="true" data-testid="servers-summary-skeleton">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--cms-line)' }}>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {PROVIDER_ORDER.map((provider) => renderProviderCard(provider))}
        </div>
      ) : null}

      {/* ===== Provider nav (jumps to the stacked sections) ===== */}
      <nav aria-label={t(locale, 'servers.providerNavLabel')} data-testid="servers-provider-nav" className="flex items-center gap-2 flex-wrap">
        {PROVIDER_ORDER.map((provider) => {
          const Icon = PROVIDER_ICONS[provider];
          return (
            <button
              key={provider}
              type="button"
              onClick={() => scrollToSection(provider)}
              aria-label={t(locale, 'servers.cardOpenDetail', { provider: providerTitle(provider) })}
              data-testid={`servers-nav-${provider}`}
              className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg border text-xs font-semibold cursor-pointer"
              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
            >
              <Icon className="w-3.5 h-3.5" />
              {providerTitle(provider)}
            </button>
          );
        })}
      </nav>

      {/* ===== Stacked provider detail sections ===== */}
      <div className="space-y-4">
        {PROVIDER_ORDER.map((provider) => renderProviderSection(provider))}
      </div>

      {/* Fixed no-mutations notice (read-only by design). */}
      <p className="text-[10px] leading-relaxed text-center" style={{ color: 'var(--cms-text-muted)' }} data-testid="servers-no-mutations-notice">
        {t(locale, 'servers.noMutationsNotice')}
      </p>
    </section>
  );
}
