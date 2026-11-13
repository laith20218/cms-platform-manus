import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layouts/Sidebar';

// ---------------------------------------------------------------------------
// Wave 15.1.5 — regression: the 4 /my-studies hub links must keep EXACTLY ONE
// sidebar item active at a time. Before the fix, NavLink matched by pathname
// only, so دراستي + المكتبة + الكورسات + بنك الأسئلة all highlighted together
// on any /my-studies URL (PR #89 report).
//
// Harness: same pattern as push6.test.tsx's renderApp — mount the component
// under test inside a MemoryRouter seeded with the URL under assertion, then
// read the rendered state. The Sidebar is the component that owns the bug
// (the full AppShell pulls in the Auth/Theme providers, which are orthogonal
// to route matching). Active state is asserted through aria-current="page",
// which the 4 study links carry explicitly (plain Links with custom
// pathname+?tab= detection) and NavLink items carry natively.
//
// Recon note: MyStudiesPage falls back to tab='courses' when ?tab= is absent,
// so /my-studies and /my-studies?tab=courses render the same panel — but the
// sidebar must still highlight only دراستي vs only الكورسات respectively.
// ---------------------------------------------------------------------------

const STUDY_TESTIDS = [
  'sidebar-item-my-studies',
  'sidebar-item-library',
  'sidebar-item-courses',
  'sidebar-item-exams',
] as const;

function renderSidebarAt(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Sidebar />
    </MemoryRouter>
  );
}

/**
 * Exactly one study item carries aria-current="page" — the named one when
 * activeTestid is provided, none at all when it is null.
 */
function expectStudyItemsActiveState(activeTestid: string | null) {
  for (const testid of STUDY_TESTIDS) {
    const item = screen.getByTestId(testid);
    if (testid === activeTestid) {
      expect(item).toHaveAttribute('aria-current', 'page');
    } else {
      expect(item).not.toHaveAttribute('aria-current');
    }
  }
}

describe('Sidebar — single active study item on /my-studies routes (15.1.5)', () => {
  it('marks only دراستي active on /my-studies without a tab param', () => {
    renderSidebarAt('/my-studies');
    expectStudyItemsActiveState('sidebar-item-my-studies');
  });

  it('marks only المكتبة active on /my-studies?tab=library', () => {
    renderSidebarAt('/my-studies?tab=library');
    expectStudyItemsActiveState('sidebar-item-library');
  });

  it('marks only الكورسات active on /my-studies?tab=courses', () => {
    renderSidebarAt('/my-studies?tab=courses');
    expectStudyItemsActiveState('sidebar-item-courses');
  });

  it('marks only بنك الأسئلة active on /my-studies?tab=exams', () => {
    renderSidebarAt('/my-studies?tab=exams');
    expectStudyItemsActiveState('sidebar-item-exams');
  });

  it('keeps all 4 study items inactive on /dashboard (dashboard NavLink active)', () => {
    renderSidebarAt('/dashboard');
    expectStudyItemsActiveState(null);
    expect(screen.getByTestId('sidebar-item-dashboard')).toHaveAttribute('aria-current', 'page');
  });
});
