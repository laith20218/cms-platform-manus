import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from './Breadcrumbs';

describe('Breadcrumbs', () => {
  it('renders a nav landmark with an ordered list and marks the last item current', () => {
    render(
      <Breadcrumbs
        items={[{ label: 'الإدارة' }, { label: 'بنك الأسئلة' }]}
        navLabel="مسار التنقل"
        testId="crumbs"
      />,
    );
    expect(screen.getByRole('navigation', { name: 'مسار التنقل' })).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('بنك الأسئلة')).toHaveAttribute('aria-current', 'page');
    // Intermediate crumb is not marked current.
    expect(screen.getByText('الإدارة')).not.toHaveAttribute('aria-current');
  });

  it('RTL direction renders separators and keeps reading order', () => {
    const { container } = render(
      <Breadcrumbs items={[{ label: 'A' }, { label: 'B' }, { label: 'C' }]} navLabel="nav" dir="rtl" />,
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('dir', 'rtl');
    // Two separators between three crumbs (svg chevrons are aria-hidden).
    const separators = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(separators).toHaveLength(2);
    const crumbs = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(crumbs).toEqual(['A', 'B', 'C']);
  });

  it('renders intermediate crumbs as links while the current page stays text', () => {
    render(
      <Breadcrumbs
        items={[{ label: 'Admin', href: '/' }, { label: 'Question Bank' }]}
        navLabel="breadcrumb"
      />,
    );
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Question Bank' })).not.toBeInTheDocument();
  });
});
