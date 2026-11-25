import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders the default Arabic page indicator inside a labelled nav', () => {
    render(<Pagination page={2} pageSize={20} total={100} onPageChange={vi.fn()} />);
    expect(screen.getByText('صفحة 2 من 5')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'تصفح الصفحات' })).toBeInTheDocument();
  });

  it('fires onPageChange with adjacent pages and disables at the bounds', () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pagination page={1} pageSize={20} total={100} onPageChange={onPageChange} testId="pager" />,
    );
    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    rerender(<Pagination page={5} pageSize={20} total={100} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'التالي' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('collapses to a single page and disables both sides when empty', () => {
    render(<Pagination page={1} pageSize={20} total={0} onPageChange={vi.fn()} />);
    expect(screen.getByText('صفحة 1 من 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'التالي' })).toBeDisabled();
  });

  it('accepts English labels for the EN locale', () => {
    render(
      <Pagination
        page={1}
        pageSize={10}
        total={30}
        onPageChange={vi.fn()}
        labels={{ prev: 'Previous', next: 'Next', navLabel: 'Pagination', pageOf: (p, tp) => `Page ${p} of ${tp}` }}
      />,
    );
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });
});
