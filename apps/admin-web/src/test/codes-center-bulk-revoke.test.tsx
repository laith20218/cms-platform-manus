import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * W3 (admin-ui) — CodesCenter bulk revoke (debt D-09).
 *
 * Locks:
 *  1. Bulk revoke fires ONLY after an explicit danger confirm with a
 *     mandatory reason — the typed reason travels to the API (previously a
 *     single unconfirmed click with a hardcoded English reason).
 *  2. Per-item failures are surfaced honestly with the surviving codes
 *     (previously swallowed silently with a bare catch-and-continue).
 *  3. Code + redemption statuses render through the Arabic glossary —
 *     raw enum wire values never leak (D-23).
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { CodesCenter } from '../components/CodesCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const ACTIVE_A = {
  id: 'cA', code: 'CMS-AAAA-1111', scopeType: 'Subject', contentScope: 'questions_exams',
  isPublic: true, scopeName: 'التشريح', status: 'Active', redemptionCount: 2,
  createdAt: '2026-01-01T00:00:00Z', expiresAt: null, usedAt: null, usedByName: null,
};
const ACTIVE_B = {
  id: 'cB', code: 'CMS-BBBB-2222', scopeType: 'Subject', contentScope: 'lectures_text',
  isPublic: false, scopeName: 'الفيسيولوجي', status: 'Active', redemptionCount: 1,
  createdAt: '2026-01-02T00:00:00Z', expiresAt: null, usedAt: null, usedByName: null,
};
const REVOKED = {
  id: 'cR', code: 'CMS-RRRR-3333', scopeType: 'Year', contentScope: 'full_year',
  isPublic: false, scopeName: 'السنة الأولى', status: 'Revoked', redemptionCount: 0,
  createdAt: '2026-01-03T00:00:00Z', expiresAt: null, usedAt: null, usedByName: null,
};

const revokeCalls: Array<{ id: string; body: string }> = [];
const notices: string[] = [];
const errors: string[] = [];

function stubApi({ failSecond = false } = {}) {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    if (path.startsWith('/api/v1/admin/codes?')) {
      return { items: [ACTIVE_A, ACTIVE_B, REVOKED], total: 3, page: 1, pageSize: 100, totalPages: 1 };
    }
    if (/\/api\/v1\/admin\/codes\/c[AB]\/revoke$/.test(path) && init?.method === 'POST') {
      const id = path.includes('cA') ? 'cA' : 'cB';
      if (failSecond && id === 'cB') throw new Error('scope check failed');
      revokeCalls.push({ id, body: String(init?.body ?? '') });
      return { revokedCount: 1, revokedSubscriptions: 1 };
    }
    return { items: [], total: 0, page: 1, pageSize: 100, totalPages: 1 };
  });
}

function renderCenter() {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <CodesCenter token="test-token" isArabic onError={(m) => errors.push(m)} onNotice={(m) => notices.push(m)} />
    </UiPermissionsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  revokeCalls.length = 0;
  notices.length = 0;
  errors.length = 0;
});

describe('W3 — CodesCenter bulk revoke', () => {
  it('requires the danger confirm + a mandatory reason; the typed reason travels to the API', async () => {
    stubApi();
    renderCenter();
    await screen.findByText('CMS-AAAA-1111');

    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد CMS-AAAA-1111' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد CMS-BBBB-2222' }));
    fireEvent.click(screen.getByTitle('إبطال المحدد'));

    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(screen.getByRole('dialog', { name: 'إبطال الرموز المحددة' })).toBeInTheDocument();
    expect(screen.getByText(/سيُبطَل 2 رمز/)).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    expect(revokeCalls.length).toBe(0);

    fireEvent.change(screen.getByTestId('confirm-dialog-reason'), { target: { value: 'تسريب أكواد في مجموعة عامة' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(revokeCalls.length).toBe(2));
    expect(revokeCalls[0].body).toContain('تسريب أكواد في مجموعة عامة');
    expect(notices.some((m) => m.includes('تم إبطال 2'))).toBe(true);
  });

  it('surfaces per-item failures honestly instead of swallowing them', async () => {
    stubApi({ failSecond: true });
    renderCenter();
    await screen.findByText('CMS-AAAA-1111');

    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد CMS-AAAA-1111' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد CMS-BBBB-2222' }));
    fireEvent.click(screen.getByTitle('إبطال المحدد'));
    fireEvent.change(screen.getByTestId('confirm-dialog-reason'), { target: { value: 'سبب تدقيق واضح' } });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(revokeCalls.length).toBe(1));
    await waitFor(() => {
      expect(errors.some((m) => m.includes('فشل 1') && m.includes('CMS-BBBB-2222'))).toBe(true);
    });
    expect(notices.length).toBe(0);
  });

  it('cancel never sends a revoke request', async () => {
    stubApi();
    renderCenter();
    await screen.findByText('CMS-AAAA-1111');
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد CMS-AAAA-1111' }));
    fireEvent.click(screen.getByTitle('إبطال المحدد'));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(revokeCalls.length).toBe(0);
  });
});

describe('W3 — CodesCenter status glossary', () => {
  it('renders Arabic code statuses; raw enums never leak', async () => {
    stubApi();
    renderCenter();
    await screen.findByText('CMS-AAAA-1111');
    // Two active rows render the chip + the status filter's option also says «نشط».
    expect(screen.getAllByText('نشط').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('مُبطَل')).toBeInTheDocument();
    for (const raw of ['Active', 'Revoked', 'Expired', 'Used']) {
      expect(document.body.textContent, `raw enum leak: ${raw}`).not.toContain(raw);
    }
  });
});
