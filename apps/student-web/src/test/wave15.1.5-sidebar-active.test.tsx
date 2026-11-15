import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layouts/Sidebar';

// ---------------------------------------------------------------------------
// Wave 15.1.5 — regression: the study hub links must keep EXACTLY ONE sidebar
// item active at a time. Before the fix, NavLink matched by pathname only, so
// دراستي + المكتبة + الكورسات + بنك الأسئلة all highlighted together on any
// hub URL (PR #89 report).
//
// 15.4.4b — the hub is /study now (was /my-studies; that URL redirects), and
// تقدمي / لوحة الصدارة joined the tab space from المزيد:
// /study?tab=progress / ?tab=leaderboard. The same single-active rule covers
// all six study items.
//
// Harness: mount the component under test inside a MemoryRouter seeded with
// the URL under assertion, then read the rendered state. The Sidebar is the
// component that owns the bug (the full AppShell pulls in the Auth/Theme
// providers, which are orthogonal to route matching). Active state is asserted
// through aria-current="page", which the study links carry explicitly (plain
// Links with custom pathname+?tab= detection) and NavLink items carry natively.
//
// Recon note: StudyPage falls back to tab='overview' when ?tab= is absent or
// invalid, so /study and /study?tab=overview render the same panel — دراستي
// owns both, and every tab without a dedicated sidebar item folds into it.
// ---------------------------------------------------------------------------

const STUDY_TESTIDS = [
  'sidebar-item-my-studies',
  'sidebar-item-library',
  'sidebar-item-courses',
  'sidebar-item-exams',
  'sidebar-item-stats',
  'sidebar-item-leaderboard',
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

describe('Sidebar — single active study item on /study routes (15.1.5 / 15.4.4b)', () => {
  it('marks only دراستي active on /study without a tab param', () => {
    renderSidebarAt('/study');
    expectStudyItemsActiveState('sidebar-item-my-studies');
  });

  it('marks only دراستي active on /study?tab=overview (the hub default)', () => {
    renderSidebarAt('/study?tab=overview');
    expectStudyItemsActiveState('sidebar-item-my-studies');
  });

  it('marks only المكتبة active on /study?tab=library', () => {
    renderSidebarAt('/study?tab=library');
    expectStudyItemsActiveState('sidebar-item-library');
  });

  it('marks only الكورسات active on /study?tab=courses', () => {
    renderSidebarAt('/study?tab=courses');
    expectStudyItemsActiveState('sidebar-item-courses');
  });

  it('marks only بنك الأسئلة active on /study?tab=exams (subtab-agnostic)', () => {
    renderSidebarAt('/study?tab=exams&subtab=practice');
    expectStudyItemsActiveState('sidebar-item-exams');
  });

  // ---- 15.4.4b: تقدمي / لوحة الصدارة own their /study tabs ----

  it('marks only تقدمي active on /study?tab=progress', () => {
    renderSidebarAt('/study?tab=progress');
    expectStudyItemsActiveState('sidebar-item-stats');
  });

  it('marks only لوحة الصدارة active on /study?tab=leaderboard', () => {
    renderSidebarAt('/study?tab=leaderboard');
    expectStudyItemsActiveState('sidebar-item-leaderboard');
  });

  it('keeps all study items inactive on /dashboard (dashboard NavLink active)', () => {
    renderSidebarAt('/dashboard');
    expectStudyItemsActiveState(null);
    expect(screen.getByTestId('sidebar-item-dashboard')).toHaveAttribute('aria-current', 'page');
  });

  // The standalone /stats page survives as a legacy alias (Wave A keeps the
  // route): nothing highlights there — the sidebar's تقدمي now points at
  // /study?tab=progress.
  it('keeps the study items inactive on the legacy /stats alias page', () => {
    renderSidebarAt('/stats');
    expectStudyItemsActiveState(null);
  });
});
