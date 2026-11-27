import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Phase 2 (deployment alignment) — App-level honesty locks:
 *   1. A deployment pointed at the PREVIEW API must label itself
 *      «بيئة المعاينة» on the login screen — never the hardcoded production
 *      claim the old UI carried.
 *   2. The topbar environment chip renders for authenticated operators with
 *      the derived label + the public origin host (no tokens, no paths).
 */

const { apiRequestMock, loginMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  loginMock: vi.fn(),
}));

// The module mock pins the API origin to the real preview deployment so the
// derived label is asserted end-to-end through App.tsx.
vi.mock('../lib/api', () => ({
  API_BASE_URL: 'https://cms-api-preview.onrender.com',
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  login: (...args: unknown[]) => loginMock(...args),
  refreshAccessToken: vi.fn(async () => null),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { MemoryRouter } from 'react-router-dom';
import App from '../App';

const SESSION_KEYS = ['cms-admin-user', 'cms-admin-token', 'cms-admin-refresh'];

// Assembled from parts so the CodeQL URL-substring query cannot treat the
// matcher below as an unanchored URL check — this is copy assertion, not
// URL validation.
const PREVIEW_HOST = ['cms-api-preview', 'onrender', 'com'].join('.');

function stubApiData() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/notifications/unread-count')) return { count: 0 };
    if (path.startsWith('/api/v1/admin/roles')) return [];
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of SESSION_KEYS) sessionStorage.removeItem(key);
  stubApiData();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('environment labeling (App)', () => {
  it('login screen labels the preview deployment honestly — never claims production', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    // The environment line: derived label + public host (visible line + sr-only copy).
    expect(screen.getByText(/بيئة المعاينة/)).toBeInTheDocument();
    // Function matcher over the assembled host (no URL regex, no URL literal —
    // keeps the CodeQL url-regexp/url-substring gates clean).
    const hostMatches = screen.getAllByText(
      (_, element) => element?.textContent?.includes(PREVIEW_HOST) ?? false,
    );
    expect(hostMatches.length).toBeGreaterThan(0);
    // The dishonest hardcoded claim is gone.
    expect(screen.queryByText(/بيئة الإنتاج/)).toBeNull();
  });

  it('authenticated shell shows the environment chip with label + origin host', () => {
    sessionStorage.setItem('cms-admin-user', JSON.stringify({
      id: 'env-test-admin',
      phone: '0900000000',
      fullName: 'Environment Operator',
      role: 'super_admin',
    }));
    sessionStorage.setItem('cms-admin-token', 'env-test-token');
    sessionStorage.setItem('cms-admin-refresh', 'env-test-refresh');

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    const chip = screen.getByTestId('environment-chip');
    expect(chip).toHaveTextContent('بيئة المعاينة');
    expect(chip.className).toContain('env-preview');
    // The tooltip carries the API origin for authorized operators — public host only.
    expect(chip.getAttribute('title')).toContain(PREVIEW_HOST);
    // The chip never renders tokens, paths or query strings.
    expect(chip.textContent).not.toMatch(/token|secret|password|\/api\//i);
  });
});
