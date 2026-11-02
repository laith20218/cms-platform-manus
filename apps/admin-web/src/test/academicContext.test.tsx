import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useAcademicContext } from '../lib/academicContext';

/**
 * W14.3 Phase A (D4) — shared URL-persisted academic context.
 * These tests exercise the hook through a MemoryRouter: reading the context
 * from the URL, writing it back with downstream-reset semantics, hydration,
 * clearing, and cross-consumer sharing (the "navigate between centers and the
 * context survives" guarantee — a second consumer of the same router sees the
 * selection the first one wrote).
 */

function Probe({ label }: { label: string }) {
  const academic = useAcademicContext();
  const location = useLocation();
  const ids = {
    universityId: academic.universityId,
    collegeId: academic.collegeId,
    yearId: academic.yearId,
    semesterId: academic.semesterId,
    subjectId: academic.subjectId,
  };
  return (
    <section aria-label={label}>
      <div data-testid={`${label}-ids`}>{JSON.stringify(ids)}</div>
      <div data-testid={`${label}-url`}>{location.search}</div>
      <button onClick={() => academic.chooseUniversity('u9')}>pick-university-{label}</button>
      <button onClick={() => academic.chooseCollege('c9')}>pick-college-{label}</button>
      <button onClick={() => academic.chooseYear('y9')}>pick-year-{label}</button>
      <button onClick={() => academic.chooseSemester('s9')}>pick-semester-{label}</button>
      <button onClick={() => academic.chooseSubject('sub9')}>pick-subject-{label}</button>
      <button onClick={() => academic.hydrate({ universityId: 'h1', subjectId: 'sub-h1' })}>hydrate-{label}</button>
      <button onClick={() => academic.clear()}>clear-{label}</button>
    </section>
  );
}

const renderAt = (entry: string, secondConsumer = false) => render(
  <MemoryRouter initialEntries={[entry]}>
    <Probe label="a" />
    {secondConsumer && <Probe label="b" />}
  </MemoryRouter>,
);

const idsOf = (label: string) => JSON.parse(screen.getByTestId(`${label}-ids`).textContent ?? '{}');

describe('useAcademicContext (W14.3 D4 — URL-persisted academic context)', () => {
  it('reads an existing context from the URL query string', () => {
    renderAt('/?univ=u1&college=c1&year=y1&semester=s1&subject=sub1');
    expect(idsOf('a')).toEqual({
      universityId: 'u1', collegeId: 'c1', yearId: 'y1', semesterId: 's1', subjectId: 'sub1',
    });
  });

  it('defaults to empty strings when the URL has no academic parameters', () => {
    renderAt('/other?foo=bar');
    expect(idsOf('a')).toEqual({
      universityId: '', collegeId: '', yearId: '', semesterId: '', subjectId: '',
    });
  });

  it('chooseUniversity writes ?univ= and clears every downstream selection', () => {
    renderAt('/?univ=u1&college=c1&year=y1&semester=s1&subject=sub1');
    fireEvent.click(screen.getByText('pick-university-a'));
    expect(screen.getByTestId('a-url').textContent).toBe('?univ=u9');
    expect(idsOf('a')).toEqual({
      universityId: 'u9', collegeId: '', yearId: '', semesterId: '', subjectId: '',
    });
  });

  it('chooseCollege keeps the university and clears year/semester/subject', () => {
    renderAt('/?univ=u1&college=c1&year=y1&semester=s1&subject=sub1');
    fireEvent.click(screen.getByText('pick-college-a'));
    expect(screen.getByTestId('a-url').textContent).toBe('?univ=u1&college=c9');
    expect(idsOf('a').universityId).toBe('u1');
    expect(idsOf('a').collegeId).toBe('c9');
    expect(idsOf('a').yearId).toBe('');
    expect(idsOf('a').semesterId).toBe('');
    expect(idsOf('a').subjectId).toBe('');
  });

  it('chooseSubject keeps the whole chain and writes only the subject', () => {
    renderAt('/?univ=u1&college=c1&year=y1&semester=s1');
    fireEvent.click(screen.getByText('pick-subject-a'));
    expect(screen.getByTestId('a-url').textContent).toBe('?univ=u1&college=c1&year=y1&semester=s1&subject=sub9');
    expect(idsOf('a').subjectId).toBe('sub9');
  });

  it('hydrate merges ids into the URL without downstream clearing', () => {
    renderAt('/?college=c1&year=y1');
    fireEvent.click(screen.getByText('hydrate-a'));
    expect(screen.getByTestId('a-url').textContent).toBe('?college=c1&year=y1&univ=h1&subject=sub-h1');
  });

  it('clear removes every academic parameter and leaves foreign parameters alone', () => {
    renderAt('/?univ=u1&subject=sub1&keep=me');
    fireEvent.click(screen.getByText('clear-a'));
    expect(screen.getByTestId('a-url').textContent).toBe('?keep=me');
  });

  it('A.3 — a second consumer of the same router sees the context the first one wrote', () => {
    renderAt('/?univ=u1&subject=sub1', true);
    // Both consumers read the same URL context (center switch ≙ remount on the same URL).
    expect(idsOf('a')).toEqual(idsOf('b'));
    // The first consumer changes the context; the second sees the update.
    fireEvent.click(screen.getByText('pick-semester-a'));
    expect(idsOf('b')).toEqual({
      universityId: 'u1', collegeId: '', yearId: '', semesterId: 's9', subjectId: '',
    });
  });
});
