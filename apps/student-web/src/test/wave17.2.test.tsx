import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 17.2 — the global path trail + logical Back.
 *
 * Locks:
 *  1. The explicit route→trail map: ancestors are links (correct hrefs),
 *     the current segment is plain text (aria-current="page").
 *  2. The Back control navigates to the PARENT SEGMENT of the path model
 *     (never history.back()), and hides when no parent exists (dashboard).
 *  3. Dynamic labels resolve from existing query caches (my-subjects,
 *     lectures) with a prettified fallback — no fetch.
 *  4. The trail mounts once, above the outlet, for every authenticated page
 *     (AppShell integration).
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PathTrail, buildTrail } from '@/components/layouts/PathTrail';
import { AppShell } from '@/components/layouts/AppShell';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { AuthProvider } from '@/app/providers/AuthProvider';

function makeClient(seeded?: { subjects?: unknown[]; lectures?: unknown[] }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seeded?.subjects) client.setQueryData(['my-subjects-entitled'], seeded.subjects);
  if (seeded?.lectures) client.setQueryData(['lectures', 's1'], seeded.lectures);
  return client;
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe" data-path={location.pathname} data-search={location.search} />;
}

function renderTrailAt(path: string, client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <PathTrail />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ================= 1. The explicit trail map =================

describe('W17.2 — buildTrail map', () => {
  const client = makeClient({
    subjects: [{ id: 's1', slug: 'تشريح-مرضي', nameAr: 'التشريح المرضي' }],
    lectures: [{ id: 'lec1', titleAr: 'محاضرة القلب' }],
  });

  it('resolves subject and lecture labels from query caches', () => {
    const trail = buildTrail('/subjects/تشريح-مرضي/lectures/lec1/questions', '', client);
    expect(trail.map((s) => s.label)).toEqual(['الرئيسية', 'المواد', 'التشريح المرضي', 'محاضرة القلب', 'الأسئلة']);
    expect(trail[2].to).toBe('/subjects/تشريح-مرضي');
    expect(trail[3].to).toBe('/subjects/تشريح-مرضي/lectures/lec1');
    expect(trail[4].to).toBeUndefined();
  });

  it('falls back to a prettified slug when no cache hit', () => {
    const trail = buildTrail('/subjects/فيزياء-طبية', '', client);
    expect(trail[2].label).toBe('فيزياء طبية');
  });

  it('maps the study hub tabs and the course-bundle leaf', () => {
    expect(buildTrail('/study', '?tab=library', client).map((s) => s.label))
      .toEqual(['الرئيسية', 'دراستي', 'المكتبة']);
    expect(buildTrail('/study', '?tab=bank&courseId=ec1', client).map((s) => s.label))
      .toEqual(['الرئيسية', 'دراستي', 'بنك الأسئلة', 'أسئلة السنوات']);
    // The bundle's parent Back target is the bank tab.
    const bank = buildTrail('/study', '?tab=bank&courseId=ec1', client);
    expect(bank[2].to).toBe('/study?tab=bank');
  });

  it('maps the exams tree (subtab, exam, review, practice runs)', () => {
    expect(buildTrail('/exams', '?subtab=practice', client).map((s) => s.label))
      .toEqual(['الرئيسية', 'الاختبارات', 'التدريب']);
    expect(buildTrail('/exams/ex1', '', client).map((s) => s.label))
      .toEqual(['الرئيسية', 'الاختبارات', 'اختبار']);
    expect(buildTrail('/practice/exam/em1', '', client).map((s) => s.label))
      .toEqual(['الرئيسية', 'الاختبارات', 'التدريب', 'جلسة تدريب']);
  });

  it('falls back to home > current for unmapped routes (never a blank bar)', () => {
    expect(buildTrail('/some-future-page', '', client).map((s) => s.label))
      .toEqual(['الرئيسية', 'الصفحة الحالية']);
  });
});

// ================= 2. Rendering + logical Back =================

describe('W17.2 — PathTrail rendering and Back', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders links for ancestors and plain text for the current segment', () => {
    renderTrailAt('/subjects', makeClient());

    expect(screen.getByTestId('path-trail-segment-0')).toHaveAttribute('href', '/dashboard');
    expect(screen.getByTestId('path-trail-segment-0').textContent).toBe('الرئيسية');
    expect(screen.getByTestId('path-trail-current-1')).toHaveTextContent('المواد');
    expect(screen.getByTestId('path-trail-current-1').tagName).toBe('SPAN');
  });

  it('Back goes to the parent segment of the path model (not history.back)', () => {
    renderTrailAt('/subjects/تشريح-مرضي/lectures/lec1', makeClient({
      subjects: [{ id: 's1', slug: 'تشريح-مرضي', nameAr: 'التشريح المرضي' }],
      lectures: [{ id: 'lec1', titleAr: 'محاضرة القلب' }],
    }));

    const back = screen.getByTestId('path-trail-back');
    expect(back.getAttribute('aria-label')).toBe('رجوع إلى التشريح المرضي');
    fireEvent.click(back);

    // Landed on the SUBJECT page — the parent in the path model — regardless
    // of how the student arrived at the lecture.
    expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/subjects/تشريح-مرضي');
  });

  it('hides Back on the parentless root (dashboard)', () => {
    renderTrailAt('/dashboard', makeClient());

    expect(screen.queryByTestId('path-trail-back')).toBeNull();
    expect(screen.getByTestId('path-trail-current-0')).toHaveTextContent('الرئيسية');
  });

  it('hides Back when the only ancestor is the current root itself', () => {
    renderTrailAt('/settings', makeClient());

    // Parent = الرئيسية (/dashboard) — Back exists and targets the dashboard.
    expect(screen.getByTestId('path-trail-back').getAttribute('aria-label')).toBe('رجوع إلى الرئيسية');
  });
});

// ================= 3. AppShell integration =================

describe('W17.2 — AppShell mounts the trail once, above the outlet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockImplementation(async () => ({ data: [] }));
  });

  it('renders the trail before the page content on every authenticated page', async () => {
    // jsdom lacks matchMedia — stub it (ThemeProvider probes the color scheme).
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={['/settings']}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/settings" element={<div data-testid="dummy-page">صفحة</div>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );

    const trail = await screen.findByTestId('path-trail');
    expect(trail).toBeInTheDocument();
    expect(screen.getByTestId('dummy-page')).toBeInTheDocument();
    // Order: the trail precedes the page content in the main region.
    const main = screen.getByTestId('app-main');
    expect(main.contains(trail)).toBe(true);
    expect(trail.compareDocumentPosition(screen.getByTestId('dummy-page')) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // The retired local breadcrumbs never come back.
    expect(screen.queryByTestId('library-breadcrumb')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('path-trail-current-1')).toHaveTextContent('الإعدادات'));
  });
});
