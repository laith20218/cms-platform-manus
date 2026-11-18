import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 16.5 — admin-managed content pages replace the hardcoded Terms /
 * Privacy components and add /contact. Covers: markdown-lite rendering,
 * the Arabic error card (with backend detail + retry), the contact slug,
 * and the sanitizeActionUrl allowlist entry for the new public route.
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

import { TermsPage } from '@/features/legal/TermsPage';
import { ContactPage } from '@/features/legal/ContactPage';
import { sanitizeActionUrl } from '@/utils/sanitizeActionUrl';

const TERMS_PAGE = {
  slug: 'terms',
  titleAr: 'شروط الاستخدام — نسخة الإدارة',
  bodyAr:
    'باستخدامك لمنصة CMS الطبية، فإنك توافق على الشروط التالية:\n\n## 1. الاستخدام الشخصي\nالمحتوى التعليمي مخصص لاستخدامك الشخصي فقط.\n\n## 4. التعديلات\nقد يتم تحديث هذه الشروط من وقت لآخر.',
  updatedAt: '2026-11-18T10:00:00Z',
};

function renderPage(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockReset();
});

describe('TermsPage from the content store (W16.5)', () => {
  it('renders the admin-managed title and markdown-lite body', async () => {
    getMock.mockResolvedValue({ data: TERMS_PAGE });

    renderPage(<TermsPage />);

    expect(await screen.findByTestId('content-page-terms')).toBeInTheDocument();
    // Title from the API, not the hardcoded component.
    expect(screen.getByText('شروط الاستخدام — نسخة الإدارة')).toBeInTheDocument();
    // «## » lines render as section headings.
    expect(screen.getByRole('heading', { name: '1. الاستخدام الشخصي' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '4. التعديلات' })).toBeInTheDocument();
    // Paragraphs render as plain text.
    expect(screen.getByText('المحتوى التعليمي مخصص لاستخدامك الشخصي فقط.')).toBeInTheDocument();
    // The updated stamp renders.
    expect(screen.getByText(/آخر تحديث/)).toBeInTheDocument();
  });

  it('shows the Arabic error card with the backend detail and a retry (no raw text)', async () => {
    getMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { detail: 'لم يتم العثور على هذه الصفحة.' } },
    });

    renderPage(<TermsPage />);

    const errorCard = await screen.findByTestId('content-page-terms-error', {}, { timeout: 5000 });
    expect(errorCard).toHaveTextContent('تعذر تحميل الصفحة');
    expect(errorCard).toHaveTextContent('لم يتم العثور على هذه الصفحة.');
    expect(errorCard).toHaveTextContent('إعادة المحاولة');
    expect(document.body.textContent).not.toContain('Request failed with status code');

    // Retry refetches.
    getMock.mockResolvedValue({ data: TERMS_PAGE });
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await screen.findByTestId('content-page-terms')).toBeInTheDocument();
  });
});

describe('ContactPage (W16.5)', () => {
  it('fetches the contact slug from the content store', async () => {
    getMock.mockResolvedValue({
      data: { slug: 'contact', titleAr: 'تواصل معنا', bodyAr: 'فريق الدعم جاهز لمساعدتك.', updatedAt: '2026-11-18T10:00:00Z' },
    });

    renderPage(<ContactPage />);

    expect(await screen.findByTestId('content-page-contact')).toBeInTheDocument();
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith('/content/contact');
    });
    expect(screen.getByText('فريق الدعم جاهز لمساعدتك.')).toBeInTheDocument();
  });
});

describe('sanitizeActionUrl allows /contact (W16.5)', () => {
  it('keeps the new public route in the internal whitelist', () => {
    expect(sanitizeActionUrl('/contact', 'https://app.example.com')).toBe('/contact');
    expect(sanitizeActionUrl('/contact?ref=notif', 'https://app.example.com')).toBe('/contact?ref=notif');
  });
});
