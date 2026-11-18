import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layouts/Sidebar';
import { BottomNav } from '@/components/layouts/BottomNav';
import { SubjectModal } from '@/features/subjects/SubjectModal';
import { useSubjectModal, type SubjectForModal } from '@/features/subjects/SubjectModalContext';
import { SubjectModalProvider } from '@/features/subjects/SubjectModalProvider';

// ---------------------------------------------------------------------------
// Wave 15.4.4b → W16.1a — every UI surface that pointed at the legacy
// /my-studies hub (and the old /stats, /leaderboard standalone pages for
// المزيد) now points at /study with the appropriate ?tab=. W16.1a dissolves
// المزيد: الاختبارات and لوحة الصدارة point at their standalone pages
// (/exams, /leaderboard), بنك الأسئلة gets its own hub tab (?tab=bank), and
// تقدمي folds into دراستي (progress is the hub default). The redirect
// behavior of the retired URLs is covered by wave15.4.4a.test.tsx +
// my-studies.test.tsx.
// ---------------------------------------------------------------------------

describe('W16.1a — Sidebar points at the new surfaces', () => {
  function renderSidebar() {
    return render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );
  }

  it('دراستي links to /study', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-item-my-studies')).toHaveAttribute('href', '/study');
  });

  it('المكتبة links to /study?tab=library', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-item-library')).toHaveAttribute('href', '/study?tab=library');
  });

  it('الكورسات links to /study?tab=courses', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-item-courses')).toHaveAttribute('href', '/study?tab=courses');
  });

  it('بنك الأسئلة links to /study?tab=bank (NEW href — was ?tab=exams)', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-item-bank')).toHaveAttribute('href', '/study?tab=bank');
  });

  it('الاختبارات links to the standalone /exams page (NEW)', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-item-exams')).toHaveAttribute('href', '/exams');
  });

  it('لوحة الصدارة links to the standalone /leaderboard page (NEW — was ?tab=leaderboard)', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-item-leaderboard')).toHaveAttribute('href', '/leaderboard');
  });

  it('المزيد is gone — no تقدمي/تفعيل كود/الإعدادات items remain', () => {
    renderSidebar();
    expect(screen.queryByTestId('sidebar-group-more')).toBeNull();
    expect(screen.queryByTestId('sidebar-item-stats')).toBeNull();
    expect(screen.queryByTestId('sidebar-item-activate-code')).toBeNull();
    expect(screen.queryByTestId('sidebar-item-settings')).toBeNull();
  });
});

describe('W15.4.4b — BottomNav points at /study', () => {
  it('دراستي links to /study', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <BottomNav />
      </MemoryRouter>
    );
    expect(screen.getByTestId('bottomnav-item-my-studies')).toHaveAttribute('href', '/study');
  });
});

describe('W15.4.4b — SubjectModal actions point at /study', () => {
  const SUBJECT: SubjectForModal = {
    id: 's1',
    slug: 'تشريح-مرضي',
    nameAr: 'تشريح مرضي',
    scope: { content: true, exams: true, library: true, courses: true },
  };

  /** Opens the sheet for the subject via the context API (same contract the
   *  SubjectCard/MySubjectsSection "…" triggers use). */
  function SheetTrigger() {
    const { openSubjectModal } = useSubjectModal();
    return (
      <button type="button" data-testid="open-sheet" onClick={() => openSubjectModal(SUBJECT)}>
        open
      </button>
    );
  }

  it('بنك الأسئلة navigates to /study?subjectId=s1&tab=bank (W17.0 — was /exams?subjectId=s1, before that ?tab=exams)', async () => {
    render(
      <MemoryRouter>
        <SubjectModalProvider>
          <SubjectModal />
          <SheetTrigger />
        </SubjectModalProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('open-sheet'));

    expect(await screen.findByTestId('subject-action-exams')).toHaveAttribute(
      'href',
      '/study?subjectId=s1&tab=bank',
    );
    // W17.0 — the action label matches its destination (the study bank).
    expect(screen.getByTestId('subject-action-exams')).toHaveTextContent('بنك الأسئلة');
    // The sibling actions carry the same /study base (subjectId preserved).
    expect(screen.getByTestId('subject-action-library')).toHaveAttribute(
      'href',
      '/study?subjectId=s1&tab=library',
    );
    expect(screen.getByTestId('subject-action-courses')).toHaveAttribute(
      'href',
      '/study?subjectId=s1&tab=courses',
    );
    // المحتوى still routes into the subject page, not the hub.
    expect(screen.getByTestId('subject-action-content')).toHaveAttribute(
      'href',
      '/subjects/تشريح-مرضي',
    );
  });
});
