import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 17.5 — integration polish: cross-checks that the 17.x surfaces compose
 * coherently and that no stale links/labels survived.
 *
 * Locks:
 *  1. SubjectDetailPage's tab row deep-links straight into /study (no legacy
 *     /my-studies redirect hop), with the bank label = destination.
 *  2. The global trail resolves GUID subject params through the subject-detail
 *     cache (LibraryPage's key) — no raw-GUID prettification in the trail.
 *  3. The retired «دورات» lens labels stay retired in the bank storefront.
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

import SubjectDetailPage from '@/features/subjects/SubjectDetailPage';
import { buildTrail } from '@/components/layouts/PathTrail';
import { StudyPage } from '@/features/study/pages/StudyPage';

const SUBJECT = {
  id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي',
  totalQuestions: 10, totalLectures: 2, totalFiles: 1, totalExams: 3,
  contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'],
};

describe('W17.5 — SubjectDetail tab row deep-links into /study directly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/تشريح-مرضي')) return { data: SUBJECT };
      if (url.includes('/subjects/s1/lectures')) return { data: [] };
      return { data: [] };
    });
  });

  it('links بنك الأسئلة and الكورسات at /study without the /my-studies hop', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/subjects/تشريح-مرضي']}>
          <Routes>
            <Route path="/subjects/:subjectSlug" element={<SubjectDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.findAllByText('تشريح مرضي');
    expect(screen.getByText('بنك الأسئلة')).toHaveAttribute('href', '/study?subjectId=s1&tab=bank');
    expect(screen.getByText('الكورسات')).toHaveAttribute('href', '/study?subjectId=s1&tab=courses');
    // No legacy /my-studies links remain on the page.
    const links = Array.from(document.querySelectorAll('a[href*="/my-studies"]'));
    expect(links).toHaveLength(0);
  });
});

describe('W17.5 — trail resolves GUID subjects via the detail cache', () => {
  it('uses the LibraryPage-shaped cache before prettifying the param', () => {
    const client = new QueryClient();
    // LibraryPage writes the 2-element key when resolving a GUID deep link.
    client.setQueryData(['subject', '11111111-2222-3333-4444-555555555555'], { nameAr: 'التشريح المرضي' });

    const trail = buildTrail('/subjects/11111111-2222-3333-4444-555555555555/library', '', client);
    expect(trail[2].label).toBe('التشريح المرضي');
    expect(trail[3].label).toBe('المكتبة');
  });
});

describe('W17.5 — bank storefront keeps the questions terminology', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) {
        return { data: [{ id: 's1', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams'] }] };
      }
      return { data: [] };
    });
  });

  it('renders أسئلة السنوات / أسئلة مصنّفة with no «دورات» lens labels', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/study?tab=bank&subjectId=s1']}>
          <Routes>
            <Route path="/study" element={<StudyPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('exam-courses-tab-years')).toHaveTextContent('أسئلة السنوات');
    expect(screen.queryByText('دورات سنوات')).toBeNull();
    expect(screen.queryByText('دورات مصنفة')).toBeNull();
    expect(screen.queryByText('الدورات الامتحانية')).toBeNull();
  });
});
