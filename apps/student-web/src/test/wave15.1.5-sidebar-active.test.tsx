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
// W16.1a — the sidebar reorganized into 2 groups: the hub links (دراستي +
// المكتبة + الكورسات + بنك الأسئلة → /study?tab=…) keep the custom
// pathname+?tab= detection; الاختبارات and لوحة الصدارة are regular NavLinks
// to the standalone /exams and /leaderboard pages; تقدمي is gone (progress
// is the hub's DEFAULT tab, so ?tab=progress folds into دراستي).
//
// Harness: mount the component under test inside a MemoryRouter seeded with
// the URL under assertion, then read the rendered state. The Sidebar is the
// component that owns the bug (the full AppShell pulls in the Auth/Theme
// providers, which are orthogonal to route matching). Active state is asserted
// through aria-current="page", which the study links carry explicitly (plain
// Links with custom pathname+?tab= detection) and NavLink items carry natively.
//
// Recon note: StudyPage falls back to tab='progress' when ?tab= is absent or
// invalid, so /study and /study?tab=progress render the same panel — دراستي
// owns both, and every tab without a dedicated sidebar item folds into it.
// ---------------------------------------------------------------------------

const STUDY_TESTIDS = [
  'sidebar-item-my-studies',
  'sidebar-item-library',
  'sidebar-item-courses',
  'sidebar-item-bank',
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

describe('Sidebar — single active study item on /study routes (15.1.5 / 16.1a)', () => {
  it('marks only دراستي active on /study without a tab param', () => {
    renderSidebarAt('/study');
    expectStudyItemsActiveState('sidebar-item-my-studies');
  });

  it('marks only دراستي active on /study?tab=progress (the hub default — تقدمي folded into دراستي)', () => {
    renderSidebarAt('/study?tab=progress');
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

  it('marks only بنك الأسئلة active on /study?tab=bank (NEW hub tab)', () => {
    renderSidebarAt('/study?tab=bank');
    expectStudyItemsActiveState('sidebar-item-bank');
  });

  it('keeps all study items inactive on /dashboard (dashboard NavLink active)', () => {
    renderSidebarAt('/dashboard');
    expectStudyItemsActiveState(null);
    expect(screen.getByTestId('sidebar-item-dashboard')).toHaveAttribute('aria-current', 'page');
  });

  // The standalone /stats page survives as a legacy alias: nothing highlights
  // there — the hub's default progress tab has no dedicated sidebar item.
  it('keeps the study items inactive on the legacy /stats alias page', () => {
    renderSidebarAt('/stats');
    expectStudyItemsActiveState(null);
  });
});

describe('Sidebar — standalone pages own their NavLink (16.1a)', () => {
  it('marks only الاختبارات active on /exams', () => {
    renderSidebarAt('/exams');
    expectStudyItemsActiveState(null);
    expect(screen.getByTestId('sidebar-item-exams')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('sidebar-item-leaderboard')).not.toHaveAttribute('aria-current');
  });

  it('keeps الاختبارات active on the /exams/:examId deep link (pathname prefix)', () => {
    renderSidebarAt('/exams/e1');
    expectStudyItemsActiveState(null);
    expect(screen.getByTestId('sidebar-item-exams')).toHaveAttribute('aria-current', 'page');
  });

  it('marks only لوحة الصدارة active on /leaderboard', () => {
    renderSidebarAt('/leaderboard');
    expectStudyItemsActiveState(null);
    expect(screen.getByTestId('sidebar-item-leaderboard')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('sidebar-item-exams')).not.toHaveAttribute('aria-current');
  });
});
