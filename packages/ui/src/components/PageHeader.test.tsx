import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsersRound } from 'lucide-react';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders eyebrow, title, count badge, description and actions', () => {
    render(
      <PageHeader
        icon={UsersRound}
        eyebrow="Central administration"
        title="Administrator directory"
        count={12}
        description="Manage administrators from this institutional center."
        actions={<button type="button">Add administrator</button>}
        testId="page-header"
      />,
    );
    expect(screen.getByText('Central administration')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Administrator directory/ })).toBeInTheDocument();
    expect(screen.getByTestId('page-header-count')).toHaveTextContent('12');
    expect(screen.getByText('Manage administrators from this institutional center.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add administrator' })).toBeInTheDocument();
  });

  it('renders a semantic header landmark and omits optional slots', () => {
    render(<PageHeader title="بنك الأسئلة" testId="ph" />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByTestId('ph-count')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'بنك الأسئلة' })).toBeInTheDocument();
  });

  it('applies the caller icon tint over the neutral default', () => {
    render(
      <PageHeader
        icon={UsersRound}
        title="t"
        iconClassName="bg-teal-50 text-teal-700"
        testId="ph"
      />,
    );
    const chip = document.querySelector('header [class*="rounded-xl"]');
    expect(chip?.className).toContain('bg-teal-50');
    expect(chip?.className).toContain('text-teal-700');
  });
});
