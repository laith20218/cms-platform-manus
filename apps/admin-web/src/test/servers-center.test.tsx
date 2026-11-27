import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../lib/api';

/**
 * PR-9 — ServersCenter tests.
 *
 * Covers the read-only provider-monitoring dashboard:
 *   • the summary strip — four provider cards, overall badge mapping, honest
 *     missing_credentials surface (backend Arabic reason verbatim + «غير
 *     متاح» response time for -1, never an invented number), freshness badge
 *     (cached with age vs fresh);
 *   • manual refresh — every helper called with fresh=true;
 *   • per-provider detail sections — render service + deploy + metrics chip,
 *     vercel two projects with production/preview targets, neon project +
 *     branch + usage-unavailable + the fixed connection note, github
 *     repository + workflows;
 *   • the collapsible history panel — load on expand only, rows, the honest
 *     bilingual windowNote + capacity note;
 *   • partial failure isolation (one provider rejects → that section errors,
 *     the rest render) + retry, 403 forbidden surfaces, empty workflows;
 *   • polling — asserted through the exported 5-minute constant (no fake
 *     timers, no flaky interval assertions);
 *   • dictionary integrity for the new servers.* keys in both locales.
 *
 * All API helpers are mocked (PR-8 backend ships in the stacked branch).
 */

const { fetchServersSummaryMock, fetchServersProviderMock, fetchServersHistoryMock } = vi.hoisted(() => ({
  fetchServersSummaryMock: vi.fn(),
  fetchServersProviderMock: vi.fn(),
  fetchServersHistoryMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error {
    status = 500;
    errorCode?: string;
    constructor(message: string, status?: number, errorCode?: string) {
      super(message);
      this.status = status ?? 500;
      this.errorCode = errorCode;
    }
  },
  fetchServersSummary: (...args: unknown[]) => fetchServersSummaryMock(...args),
  fetchServersProvider: (...args: unknown[]) => fetchServersProviderMock(...args),
  fetchServersHistory: (...args: unknown[]) => fetchServersHistoryMock(...args),
}));

import { ServersCenter } from '../components/ServersCenter';
import { SERVERS_POLL_INTERVAL_MS, overallStatusLabel, providerStatusLabel } from '../lib/serversStatus';

// ===== Fixtures (wire shapes mirror MonitoringDtos.cs exactly) =====

const SUMMARY = {
  overallStatus: 'degraded',
  checkedAt: '2026-11-24T08:00:00Z',
  providers: [
    {
      provider: 'render',
      status: 'operational',
      checkedAt: '2026-11-24T07:59:50Z',
      responseTimeMs: 680,
      unavailableReason: null,
      freshness: { cached: true, ageSeconds: 40 },
      note: 'service cms-api · plan free · deploy live @ abc12345',
    },
    {
      provider: 'vercel',
      status: 'operational',
      checkedAt: '2026-11-24T07:59:55Z',
      responseTimeMs: 320,
      unavailableReason: null,
      freshness: { cached: false, ageSeconds: 0 },
      note: '2 projects · latest READY',
    },
    {
      provider: 'neon',
      status: 'missing_credentials',
      checkedAt: '2026-11-24T07:59:30Z',
      responseTimeMs: -1,
      unavailableReason: 'بيانات الاعتماد غير مُهيّأة',
      freshness: { cached: false, ageSeconds: 0 },
      note: 'credentials not configured',
    },
    {
      provider: 'github',
      status: 'rate_limited',
      checkedAt: '2026-11-24T07:58:00Z',
      responseTimeMs: 210,
      unavailableReason: 'provider rate limit (429)',
      freshness: { cached: true, ageSeconds: 12 },
      note: 'provider rate limit',
    },
  ],
};

const RENDER_ENVELOPE = {
  provider: 'render',
  status: 'operational',
  checkedAt: '2026-11-24T07:59:50Z',
  responseTimeMs: 680,
  unavailableReason: null,
  freshness: { cached: true, ageSeconds: 40 },
  data: {
    service: { id: 'srv-cms', name: 'cms-api', suspended: false, autoDeploy: true, plan: 'free', region: 'oregon' },
    lastDeploy: {
      id: 'dep-1',
      status: 'live',
      commitSha: 'abcdef1234567890abcdef',
      commitMessage: 'fix: question import validation',
      createdAt: '2026-11-20T10:00:00Z',
      finishedAt: '2026-11-20T10:03:00Z',
    },
    metricsAvailable: false,
    metricsUnavailableReason: 'metrics not exposed on this plan',
  },
};

const VERCEL_ENVELOPE = {
  provider: 'vercel',
  status: 'operational',
  checkedAt: '2026-11-24T07:59:55Z',
  responseTimeMs: 320,
  unavailableReason: null,
  freshness: { cached: false, ageSeconds: 0 },
  data: {
    projects: [
      {
        id: 'prj-admin',
        name: 'admin-web',
        latestDeployment: {
          id: 'dpl-1',
          state: 'READY',
          target: 'production',
          commitSha: 'abcdef1234567890abcdef',
          commitRef: 'main',
          createdAt: '2026-11-21T09:00:00Z',
          readyAt: '2026-11-21T09:02:00Z',
        },
        url: 'https://admin.example.com',
      },
      {
        id: 'prj-student',
        name: 'student-web',
        latestDeployment: {
          id: 'dpl-2',
          state: 'BUILDING',
          target: 'preview',
          commitSha: '1234567890abcdef1234',
          commitRef: 'feat/pr-9',
          createdAt: '2026-11-22T09:00:00Z',
          readyAt: null,
        },
        url: 'https://student.example.com',
      },
    ],
  },
};

const NEON_MISSING_CREDENTIALS_ENVELOPE = {
  provider: 'neon',
  status: 'missing_credentials',
  checkedAt: '2026-11-24T07:59:30Z',
  responseTimeMs: -1,
  unavailableReason: 'بيانات الاعتماد غير مُهيّأة',
  freshness: { cached: false, ageSeconds: 0 },
  data: null,
};

const NEON_OK_ENVELOPE = {
  provider: 'neon',
  status: 'operational',
  checkedAt: '2026-11-24T07:59:30Z',
  responseTimeMs: 260,
  unavailableReason: null,
  freshness: { cached: false, ageSeconds: 0 },
  data: {
    project: { id: 'neon-prj-1', name: 'cms-db', regionId: 'aws-eu-central-1' },
    branch: { id: 'br-1', name: 'main', isDefault: true, protected: true, state: 'ready' },
    usage: null,
    usageUnavailableReason: 'consumption metrics not exposed by the scoped key/plan',
  },
};

const GITHUB_ENVELOPE = {
  provider: 'github',
  status: 'operational',
  checkedAt: '2026-11-24T07:58:00Z',
  responseTimeMs: 210,
  unavailableReason: null,
  freshness: { cached: true, ageSeconds: 12 },
  data: {
    repository: {
      name: 'cms-platform',
      fullName: 'cliver/cms-platform',
      visibility: 'private',
      defaultBranch: 'main',
      pushedAt: '2026-11-23T18:00:00Z',
      openIssuesCount: 3,
    },
    recentWorkflows: [
      { id: 101, name: 'CI', headSha: 'abcdef1234567890abcdef', status: 'completed', conclusion: 'success', createdAt: '2026-11-23T17:00:00Z', updatedAt: '2026-11-23T17:05:00Z' },
      { id: 102, name: 'Deploy', headSha: '0987654321abcdef0987', status: 'completed', conclusion: 'failure', createdAt: '2026-11-23T16:00:00Z', updatedAt: '2026-11-23T16:02:00Z' },
    ],
  },
};

const RENDER_HISTORY = {
  provider: 'render',
  capacity: 60,
  windowNote: 'السجل في الذاكرة منذ آخر إعادة تشغيل للخدمة — in-memory history since the last API restart',
  items: [
    { checkedAt: '2026-11-24T07:59:50Z', status: 'operational', responseTimeMs: 680, reason: null },
    { checkedAt: '2026-11-24T07:54:50Z', status: 'down', responseTimeMs: 1500, reason: 'upstream timeout' },
  ],
};

const DEFAULT_ENVELOPES: Record<string, unknown> = {
  render: RENDER_ENVELOPE,
  vercel: VERCEL_ENVELOPE,
  neon: NEON_MISSING_CREDENTIALS_ENVELOPE,
  github: GITHUB_ENVELOPE,
};

const onError = vi.fn();
const onNotice = vi.fn();

function renderCenter() {
  return render(
    <MemoryRouter initialEntries={['/servers']}>
      <ServersCenter token="test-token" isArabic onError={onError} onNotice={onNotice} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchServersSummaryMock.mockResolvedValue(SUMMARY);
  fetchServersProviderMock.mockImplementation(async (_token: string, provider: string) => DEFAULT_ENVELOPES[provider]);
  fetchServersHistoryMock.mockResolvedValue(RENDER_HISTORY);
});

describe('PR-9 ServersCenter — summary strip', () => {
  it('renders the four provider cards from the summary', async () => {
    renderCenter();
    await screen.findByTestId('servers-card-render');
    expect(screen.getByTestId('servers-card-vercel')).toBeInTheDocument();
    expect(screen.getByTestId('servers-card-neon')).toBeInTheDocument();
    expect(screen.getByTestId('servers-card-github')).toBeInTheDocument();
    // Card titles come from the dictionary (bilingual).
    expect(screen.getByTestId('servers-card-render')).toHaveTextContent('Render — استضافة الـ API');
    expect(screen.getByTestId('servers-card-neon')).toHaveTextContent('Neon — قاعدة البيانات');
    // The backend head note is surfaced verbatim.
    expect(screen.getByTestId('servers-card-render-note')).toHaveTextContent('service cms-api · plan free');
  });

  it('maps the overall badge from the wire value (role=status)', async () => {
    renderCenter();
    const badge = await screen.findByTestId('servers-overall-status');
    expect(badge).toHaveTextContent('متدنٍ');
    expect(badge).toHaveAttribute('role', 'status');
  });

  it('maps a different overall wire value through the same registry', async () => {
    fetchServersSummaryMock.mockResolvedValueOnce({ ...SUMMARY, overallStatus: 'down' });
    renderCenter();
    expect(await screen.findByTestId('servers-overall-status')).toHaveTextContent('متوقف');
  });

  it('shows the missing_credentials Arabic reason honestly + «غير متاح» (never an invented number)', async () => {
    renderCenter();
    await screen.findByTestId('servers-card-neon');
    // Backend-authored Arabic reason, verbatim.
    expect(screen.getByTestId('servers-card-neon-reason')).toHaveTextContent('بيانات الاعتماد غير مُهيّأة');
    // responseTimeMs -1 → honest «غير متاح», not 0/1/any number.
    expect(screen.getByTestId('servers-card-neon-response')).toHaveTextContent('غير متاح');
    expect(screen.getByTestId('servers-card-neon-response')).not.toHaveTextContent('٦٨٠');
    // Real values render locale-formatted.
    expect(screen.getByTestId('servers-card-render-response')).toHaveTextContent('٦٨٠ ملّي');
  });

  it('renders the freshness badge cached-vs-fresh and the last-check line', async () => {
    renderCenter();
    await screen.findByTestId('servers-card-render');
    expect(screen.getByTestId('servers-card-render-freshness')).toHaveTextContent('مخزّن مؤقتاً');
    expect(screen.getByTestId('servers-card-render-freshness')).toHaveTextContent('٤٠');
    expect(screen.getByTestId('servers-card-vercel-freshness')).toHaveTextContent('فحص جديد');
    // last successful / last attempted derived from the provider heads
    // (Arabic-locale date rendering — no Latin time format assumed).
    expect(screen.getByTestId('servers-last-successful')).toHaveTextContent('7:59');
    expect(screen.getByTestId('servers-last-attempted')).toHaveTextContent('7:59');
  });

  it('calls every helper with fresh=true on manual refresh', async () => {
    renderCenter();
    await screen.findByTestId('servers-card-render');
    fetchServersSummaryMock.mockClear();
    fetchServersProviderMock.mockClear();
    fireEvent.click(screen.getByTestId('servers-refresh'));
    await waitFor(() => {
      expect(fetchServersSummaryMock).toHaveBeenCalledWith('test-token', true);
      expect(fetchServersProviderMock).toHaveBeenCalledWith('test-token', 'render', true);
      expect(fetchServersProviderMock).toHaveBeenCalledWith('test-token', 'vercel', true);
      expect(fetchServersProviderMock).toHaveBeenCalledWith('test-token', 'neon', true);
      expect(fetchServersProviderMock).toHaveBeenCalledWith('test-token', 'github', true);
    });
  });

  it('shows the honest summary error state with retry', async () => {
    fetchServersSummaryMock.mockRejectedValueOnce(new Error('network down'));
    renderCenter();
    expect(await screen.findByTestId('servers-summary-error')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('servers-summary-error-retry'));
    await waitFor(() => {
      expect(fetchServersSummaryMock).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the honest forbidden (403) surface for the summary', async () => {
    fetchServersSummaryMock.mockRejectedValueOnce(new ApiError('لا تملك صلاحية عرض حالة الخوادم', 403));
    renderCenter();
    expect(await screen.findByTestId('servers-summary-forbidden')).toHaveTextContent('لا تملك صلاحية عرض حالة الخوادم');
    expect(onError).toHaveBeenCalled();
  });

  it('renders the fixed read-only notice and no mutation affordances anywhere', async () => {
    renderCenter();
    expect(await screen.findByTestId('servers-readonly-notice')).toHaveTextContent('لوحة عرض فقط');
    expect(screen.getByTestId('servers-no-mutations-notice')).toHaveTextContent('عن قصد لا توجد في هذه اللوحة أزرار نشر أو إعادة تشغيل');
    expect(screen.getByTestId('servers-polling-note')).toHaveTextContent('كل ٥ دقائق');
    // Read-only by design: no button anywhere reads as an operational command.
    for (const button of screen.getAllByRole('button')) {
      const label = button.getAttribute('aria-label') ?? button.textContent ?? '';
      expect(label).not.toMatch(/إعادة تشغيل|restart|deploy now|نشر الآن|redeploy|rollback/i);
    }
  });
});

describe('PR-9 ServersCenter — per-provider detail sections', () => {
  it('renders the Render service facts, last deploy and honest metrics chip', async () => {
    renderCenter();
    const service = await screen.findByTestId('servers-render-service');
    expect(service).toHaveTextContent('cms-api');
    expect(service).toHaveTextContent('free');
    expect(service).toHaveTextContent('oregon');
    expect(service).toHaveTextContent('النشر التلقائي مفعّل');
    const deploy = screen.getByTestId('servers-render-deploy');
    expect(deploy).toHaveTextContent('dep-1');
    // commitSha rendered as the first 10 chars only (mono).
    expect(screen.getByTestId('servers-render-deploy-commit')).toHaveTextContent('abcdef1234');
    expect(screen.getByTestId('servers-render-deploy-commit')).not.toHaveTextContent('abcdef1234567890abcdef');
    expect(deploy).toHaveTextContent('fix: question import validation');
    expect(screen.getByTestId('servers-render-metrics')).toHaveTextContent('مقاييس الأداء غير متاحة في هذه الخطة');
    expect(screen.getByTestId('servers-render-metrics-reason')).toHaveTextContent('metrics not exposed on this plan');
  });

  it('renders both Vercel projects (admin + student) with targets and safe links', async () => {
    renderCenter();
    expect(await screen.findByTestId('servers-vercel-project-admin-web')).toBeInTheDocument();
    expect(screen.getByTestId('servers-vercel-project-student-web')).toBeInTheDocument();
    expect(screen.getByTestId('servers-vercel-target-admin-web')).toHaveTextContent('إنتاج');
    expect(screen.getByTestId('servers-vercel-target-student-web')).toHaveTextContent('معاينة');
    expect(screen.getByTestId('servers-vercel-commit-admin-web')).toHaveTextContent('abcdef1234');
    expect(screen.getByTestId('servers-vercel-ref-student-web')).toHaveTextContent('feat/pr-9');
    const link = screen.getByTestId('servers-vercel-url-admin-web');
    expect(link).toHaveAttribute('href', 'https://admin.example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // The Vercel summary card splits the two projects visually.
    expect(screen.getByTestId('servers-card-vercel-projects')).toHaveTextContent('admin-web');
    expect(screen.getByTestId('servers-card-vercel-projects')).toHaveTextContent('student-web');
  });

  it('renders Neon project + branch + the honest usage-unavailable chip + the fixed connection note', async () => {
    fetchServersProviderMock.mockImplementation(async (_token: string, provider: string) =>
      provider === 'neon' ? NEON_OK_ENVELOPE : DEFAULT_ENVELOPES[provider]);
    renderCenter();
    const project = await screen.findByTestId('servers-neon-project');
    expect(project).toHaveTextContent('cms-db');
    expect(project).toHaveTextContent('neon-prj-1');
    expect(project).toHaveTextContent('aws-eu-central-1');
    const branch = screen.getByTestId('servers-neon-branch');
    expect(branch).toHaveTextContent('main');
    expect(branch).toHaveTextContent('افتراضي');
    expect(branch).toHaveTextContent('محمي');
    expect(screen.getByTestId('servers-neon-usage')).toHaveTextContent('الاستهلاك غير متاح لهذا المفتاح/الخطة');
    expect(screen.getByTestId('servers-neon-usage-reason')).toHaveTextContent('consumption metrics not exposed by the scoped key/plan');
    expect(screen.getByTestId('servers-neon-connection-note')).toHaveTextContent('لا تُعرض سلاسل الاتصال أبداً في هذه اللوحة');
  });

  it('shows the Neon connection note even when no Neon data exists', async () => {
    renderCenter();
    expect(await screen.findByTestId('servers-neon-connection-note')).toHaveTextContent('لا تُعرض سلاسل الاتصال أبداً');
    expect(screen.getByTestId('servers-neon-empty')).toBeInTheDocument();
  });

  it('renders the GitHub repository and recent workflow runs', async () => {
    renderCenter();
    const repository = await screen.findByTestId('servers-github-repository');
    expect(repository).toHaveTextContent('cliver/cms-platform');
    expect(repository).toHaveTextContent('private');
    expect(repository).toHaveTextContent('main');
    expect(repository).toHaveTextContent('٣');
    const workflow = screen.getByTestId('servers-github-workflow-101');
    expect(workflow).toHaveTextContent('CI');
    expect(workflow).toHaveTextContent('abcdef1234');
    expect(screen.getByTestId('servers-github-conclusion-101')).toHaveTextContent('success');
    expect(screen.getByTestId('servers-github-conclusion-102')).toHaveTextContent('failure');
  });

  it('renders the honest empty state when no workflow runs exist', async () => {
    fetchServersProviderMock.mockImplementation(async (_token: string, provider: string) =>
      provider === 'github'
        ? { ...GITHUB_ENVELOPE, data: { repository: GITHUB_ENVELOPE.data.repository, recentWorkflows: [] } }
        : DEFAULT_ENVELOPES[provider]);
    renderCenter();
    expect(await screen.findByTestId('servers-github-workflows-empty')).toHaveTextContent('لا توجد تشغيلات سير عمل حديثة مسجلة');
  });

  it('isolates partial failure: one provider rejects, the rest still render + retry works', async () => {
    fetchServersProviderMock.mockImplementation(async (_token: string, provider: string) => {
      if (provider === 'render') throw new Error('network down');
      return DEFAULT_ENVELOPES[provider];
    });
    renderCenter();
    expect(await screen.findByTestId('servers-section-render-error')).toBeInTheDocument();
    // The other sections are unaffected.
    expect(screen.getByTestId('servers-vercel-project-admin-web')).toBeInTheDocument();
    expect(screen.getByTestId('servers-github-repository')).toBeInTheDocument();
    expect(screen.getByTestId('servers-neon-connection-note')).toBeInTheDocument();
    // Per-section retry re-fetches only that provider.
    fetchServersProviderMock.mockClear();
    fireEvent.click(screen.getByTestId('servers-section-render-error-retry'));
    await waitFor(() => {
      expect(fetchServersProviderMock).toHaveBeenCalledWith('test-token', 'render', false);
    });
  });

  it('shows the honest forbidden (403) surface for one provider section', async () => {
    fetchServersProviderMock.mockImplementation(async (_token: string, provider: string) => {
      if (provider === 'github') throw new ApiError('Forbidden', 403);
      return DEFAULT_ENVELOPES[provider];
    });
    renderCenter();
    expect(await screen.findByTestId('servers-section-github-forbidden')).toBeInTheDocument();
  });
});

describe('PR-9 ServersCenter — check history panel', () => {
  it('loads on expand only, renders rows + the windowNote + capacity', async () => {
    renderCenter();
    await screen.findByTestId('servers-section-render');
    // Collapsed → no history fetch (load-on-expand only).
    expect(fetchServersHistoryMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('servers-history-toggle-render'));
    await waitFor(() => {
      expect(fetchServersHistoryMock).toHaveBeenCalledWith('test-token', 'render');
    });
    const body = await screen.findByTestId('servers-history-body-render');
    expect(body).toBeInTheDocument();
    // Newest-first rows: status badge + response time + reason surfaced honestly.
    expect(screen.getByTestId('servers-history-row-render-0')).toHaveTextContent('يعمل');
    expect(screen.getByTestId('servers-history-row-render-0')).toHaveTextContent('٦٨٠ ملّي');
    expect(screen.getByTestId('servers-history-row-render-1')).toHaveTextContent('متوقف');
    expect(screen.getByTestId('servers-history-reason-render-1')).toHaveTextContent('upstream timeout');
    // The backend bilingual window disclaimer + capacity note render verbatim.
    expect(screen.getByTestId('servers-history-window-render')).toHaveTextContent('السجل في الذاكرة منذ آخر إعادة تشغيل للخدمة');
    expect(screen.getByTestId('servers-history-window-render')).toHaveTextContent('in-memory history since the last API restart');
    expect(screen.getByTestId('servers-history-capacity-render')).toHaveTextContent('٦٠');
  });

  it('shows the honest history error state with retry', async () => {
    fetchServersHistoryMock.mockRejectedValueOnce(new Error('network down'));
    renderCenter();
    await screen.findByTestId('servers-section-render');
    fireEvent.click(screen.getByTestId('servers-history-toggle-render'));
    expect(await screen.findByTestId('servers-history-error-render')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('servers-history-error-render-retry'));
    await waitFor(() => {
      expect(fetchServersHistoryMock).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the honest empty history state after a restart', async () => {
    fetchServersHistoryMock.mockResolvedValueOnce({ ...RENDER_HISTORY, items: [] });
    renderCenter();
    await screen.findByTestId('servers-section-render');
    fireEvent.click(screen.getByTestId('servers-history-toggle-render'));
    expect(await screen.findByTestId('servers-history-empty-render')).toHaveTextContent('لا توجد فحوصات مسجلة بعد إعادة التشغيل الأخيرة');
  });
});

describe('PR-9 ServersCenter — conservative polling', () => {
  it('polls exactly every 5 minutes (the exported constant), not asserted in test time', () => {
    // The polling interval is asserted through the documented exported
    // constant (no fake timers — the interval never fires inside test time).
    expect(SERVERS_POLL_INTERVAL_MS).toBe(300_000);
    expect(SERVERS_POLL_INTERVAL_MS / 60_000).toBe(5);
  });
});

describe('PR-9 ServersCenter — status vocabulary + dictionary integrity', () => {
  it('maps EVERY provider status to a bilingual label (no raw enum leaks)', () => {
    const statuses = ['operational', 'degraded', 'down', 'unavailable', 'missing_credentials', 'invalid_credentials', 'rate_limited'];
    for (const status of statuses) {
      expect(providerStatusLabel('ar', status), `ar label for ${status}`).not.toBe(status);
      expect(providerStatusLabel('en', status), `en label for ${status}`).not.toBe(status);
    }
    // Unknown values fall back to an explicit localized «unknown».
    expect(providerStatusLabel('ar', 'weird-value')).toBe('غير معروفة');
    expect(providerStatusLabel('en', 'weird-value')).toBe('Unknown');
  });

  it('maps EVERY overall status to a bilingual label', () => {
    for (const status of ['healthy', 'degraded', 'down', 'unavailable', 'unknown']) {
      expect(overallStatusLabel('ar', status)).not.toBe(status);
      expect(overallStatusLabel('en', status)).not.toBe(status);
    }
    expect(overallStatusLabel('ar', 'healthy')).toBe('سليم');
    expect(overallStatusLabel('en', 'down')).toBe('Down');
  });

  it('resolves every new servers-center key in BOTH locales (no raw paths)', async () => {
    const { t, hasDictKey } = await import('../lib/dictionary');
    const keys = [
      'servers.title',
      'servers.description',
      'servers.readOnlyNotice',
      'servers.noMutationsNotice',
      'servers.pollingNote',
      'servers.refresh',
      'servers.refreshA11y',
      'servers.refreshToast',
      'servers.overallLabel',
      'servers.checkedAt',
      'servers.lastSuccessfulCheck',
      'servers.lastAttemptedCheck',
      'servers.responseTime',
      'servers.responseTimeUnavailable',
      'servers.unavailable',
      'servers.reasonLabel',
      'servers.summaryLoadError',
      'servers.forbidden',
      'servers.retry',
      'servers.providerNavLabel',
      'servers.cardOpenDetail',
      'servers.sectionReasonUnavailable',
      'servers.noProviderData',
      'servers.status.operational',
      'servers.status.degraded',
      'servers.status.down',
      'servers.status.unavailable',
      'servers.status.missingCredentials',
      'servers.status.invalidCredentials',
      'servers.status.rateLimited',
      'servers.status.unknown',
      'servers.overall.healthy',
      'servers.overall.degraded',
      'servers.overall.down',
      'servers.overall.unavailable',
      'servers.overall.unknown',
      'servers.statusExplanation.operational',
      'servers.statusExplanation.degraded',
      'servers.statusExplanation.down',
      'servers.statusExplanation.unavailable',
      'servers.statusExplanation.missingCredentials',
      'servers.statusExplanation.invalidCredentials',
      'servers.statusExplanation.rateLimited',
      'servers.statusExplanation.unknown',
      'servers.freshness.cached',
      'servers.freshness.fresh',
      'servers.fields.name',
      'servers.fields.plan',
      'servers.fields.region',
      'servers.fields.commit',
      'servers.fields.createdAt',
      'servers.fields.finishedAt',
      'servers.fields.readyAt',
      'servers.fields.updatedAt',
      'servers.providers.render.title',
      'servers.providers.render.metricsUnavailable',
      'servers.providers.render.suspended',
      'servers.providers.render.autoDeployOn',
      'servers.providers.vercel.title',
      'servers.providers.vercel.production',
      'servers.providers.vercel.preview',
      'servers.providers.vercel.noDeployment',
      'servers.providers.neon.title',
      'servers.providers.neon.branchDefault',
      'servers.providers.neon.branchProtected',
      'servers.providers.neon.usageUnavailable',
      'servers.providers.neon.connectionStringsNever',
      'servers.providers.github.title',
      'servers.providers.github.workflowsEmpty',
      'servers.history.toggle',
      'servers.history.capacity',
      'servers.history.windowNoteLabel',
      'servers.history.empty',
      'servers.history.loadError',
    ];
    for (const key of keys) {
      expect(hasDictKey(key), `missing bilingual entry for ${key}`).toBe(true);
      expect(t('ar', key)).not.toBe(key);
      expect(t('en', key)).not.toBe(key);
    }
    // nav.servers exists for the sidebar + palette label.
    expect(t('ar', 'nav.servers')).toBe('لوحة الخوادم');
    expect(t('en', 'nav.servers')).toBe('Servers Dashboard');
  });

  it('renders the bilingual rate_limited explanation line beside the badge', async () => {
    fetchServersProviderMock.mockImplementation(async (_token: string, provider: string) =>
      provider === 'github'
        ? { ...GITHUB_ENVELOPE, status: 'rate_limited', unavailableReason: 'provider rate limit (429)' }
        : DEFAULT_ENVELOPES[provider]);
    renderCenter();
    expect(await screen.findByTestId('servers-section-github-explanation')).toHaveTextContent('حد معدل استدعاءات المزوّد — المحاولة أُعيدت ٤٢٩');
    expect(screen.getByTestId('servers-section-github-reason')).toHaveTextContent('provider rate limit (429)');
  });
});
