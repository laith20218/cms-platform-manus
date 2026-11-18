import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 16.4 — student preferences: font-size (per-account persistence via
 * /student/preferences) + dynamic platform version (GET /system/version).
 */

const { getMock, postMock, putMock, toastErrorMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: (...args: unknown[]) => putMock(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

import SettingsPage from '@/features/settings/SettingsPage';
import { applyFontSizeStep, isFontSizeStep, readStoredFontSizeStep } from '@/features/settings/font-size';

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Default GET router: preferences + sharing + version. */
function stubGets(overrides: { preferences?: unknown; version?: unknown; sharing?: unknown } = {}) {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/student/preferences')) {
      if ('preferences' in overrides) return { data: overrides.preferences };
      return { data: { lastFilter: 'year-2026', fontSize: 'lg' } };
    }
    if (url.includes('/system/version')) {
      if ('version' in overrides) return { data: overrides.version };
      return { data: { version: '16.4.0-rc1' } };
    }
    if (url.includes('/profile/leaderboard-sharing')) {
      return { data: overrides.sharing ?? { sharesLeaderboard: false } };
    }
    return { data: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
  toastErrorMock.mockReset();
  localStorage.clear();
  document.documentElement.style.fontSize = '';
});

// ================= font-size: pure helpers =================

describe('font-size helpers (W16.4)', () => {
  it('validates steps and defaults invalid stored values to md', () => {
    expect(isFontSizeStep('xl')).toBe(true);
    expect(isFontSizeStep('huge')).toBe(false);
    localStorage.setItem('cms-font-size', 'nonsense');
    expect(readStoredFontSizeStep()).toBe('md');
  });

  it('applyFontSizeStep scales the root element', () => {
    applyFontSizeStep('xl');
    expect(document.documentElement.style.fontSize).toBe('20px');
  });
});

// ================= font-size: SettingsPage control =================

describe('SettingsPage font-size control (W16.4)', () => {
  it('adopts the server preference on load and renders the control', async () => {
    stubGets();

    renderSettings();

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith('/student/preferences');
    });
    // Server value 'lg' wins over the (empty) local mirror.
    await waitFor(() => {
      expect(document.documentElement.style.fontSize).toBe('18px');
    });
    expect(localStorage.getItem('cms-font-size')).toBe('lg');
    expect(await screen.findByTestId('font-size-options')).toBeInTheDocument();
    expect(screen.getByTestId('font-size-lg').getAttribute('aria-checked')).toBe('true');
  });

  it('choose() persists merged preferences and applies optimistically', async () => {
    stubGets();
    putMock.mockResolvedValue({ data: { lastFilter: 'year-2026', fontSize: 'xl' } });

    renderSettings();
    await screen.findByTestId('font-size-options');

    fireEvent.click(screen.getByTestId('font-size-xl'));

    await waitFor(() => {
      expect(putMock).toHaveBeenCalledWith(
        '/student/preferences',
        expect.objectContaining({ fontSize: 'xl', lastFilter: 'year-2026' })
      );
    });
    // Read-merge-write must never drop keys owned by other features.
    const [, body] = putMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toHaveProperty('lastFilter', 'year-2026');
    await waitFor(() => {
      expect(document.documentElement.style.fontSize).toBe('20px');
    });
    expect(localStorage.getItem('cms-font-size')).toBe('xl');
  });

  it('a failed save reverts the size and explains in Arabic (no raw text)', async () => {
    stubGets();
    putMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { detail: 'تعذّر حفظ التفضيلات من الخادم.' } },
    });

    renderSettings();
    await waitFor(() => {
      expect(document.documentElement.style.fontSize).toBe('18px'); // server 'lg'
    });

    fireEvent.click(screen.getByTestId('font-size-sm'));

    await waitFor(() => {
      expect(screen.getByTestId('font-size-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('font-size-error')).toHaveTextContent('تعذّر حفظ التفضيلات من الخادم.');
    // Reverted to the previous step.
    await waitFor(() => {
      expect(document.documentElement.style.fontSize).toBe('18px');
    });
    expect(document.body.textContent).not.toContain('Request failed with status code');
  });
});

// ================= dynamic version =================

describe('SettingsPage dynamic version (W16.4)', () => {
  it('shows the backend version from GET /system/version', async () => {
    stubGets();

    renderSettings();

    await waitFor(() => {
      expect(screen.getByTestId('platform-version')).toHaveTextContent('الإصدار 16.4.0-rc1');
    });
  });

  it('silently falls back to 1.0.0 when the endpoint fails', async () => {
    stubGets({ version: undefined });
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/system/version')) throw { isAxiosError: true, response: { status: 503, data: {} } };
      if (url.includes('/student/preferences')) return { data: {} };
      if (url.includes('/profile/leaderboard-sharing')) return { data: { sharesLeaderboard: false } };
      return { data: [] };
    });

    renderSettings();

    await waitFor(() => {
      expect(screen.getByTestId('platform-version')).toHaveTextContent('الإصدار 1.0.0');
    });
    // Cosmetic data — no student-facing error surface for the version.
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('api-error-detail')).not.toBeInTheDocument();
  });
});
