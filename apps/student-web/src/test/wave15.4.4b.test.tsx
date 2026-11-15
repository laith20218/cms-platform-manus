import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layouts/Sidebar';
import { BottomNav } from '@/components/layouts/BottomNav';
import { SubjectModal } from '@/features/subjects/SubjectModal';
import { SubjectModalProvider, useSubjectModal, type SubjectForModal } from '@/features/subjects/SubjectModalContext';

// ---------------------------------------------------------------------------
// Wave 15.4.4b — every UI surface that pointed at the legacy /my-studies hub
// (and the old /stats, /leaderboard standalone pages for المزيد) now points
// at /study with the appropriate ?tab=. These tests pin the link TARGETS of
// the primary navigation surfaces; the redirect behavior of the old URLs is
// covered by wave15.4.4a.test.tsx.
// ---------------------------------------------------------------------------

describe('W15.4.4b — Sidebar points at /study', () => {
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

  it('بنك الأسئلة links to /study?tab=exams', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-item-exams')).toHaveAttribute('href', '/study?tab=exams');
  });

  it('تقدمي (المزيد) links to /study?tab=progress (was /stats)', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-item-stats')).toHaveAttribute('href', '/study?tab=progress');
  });

  it('لوحة الصدارة (المزيد) links to /study?tab=leaderboard (was /leaderboard)', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-item-leaderboard')).toHaveAttribute('href', '/study?tab=leaderboard');
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

  it('الاختبارات navigates to /study?subjectId=s1&tab=exams', async () => {
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
      '/study?subjectId=s1&tab=exams',
    );
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
