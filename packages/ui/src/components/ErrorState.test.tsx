import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('renders an alert with title and description', () => {
    render(
      <ErrorState
        title="تعذّر تحميل المؤشرات"
        description="تحقق من الاتصال ثم أعد المحاولة."
        testId="err"
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('تعذّر تحميل المؤشرات')).toBeInTheDocument();
    expect(screen.getByText('تحقق من الاتصال ثم أعد المحاولة.')).toBeInTheDocument();
  });

  it('retry button calls onRetry when both retryLabel and onRetry are provided', () => {
    const onRetry = vi.fn();
    render(<ErrorState title="failed" retryLabel="إعادة المحاولة" onRetry={onRetry} testId="err" />);
    fireEvent.click(screen.getByTestId('err-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render a retry control when no handler is given', () => {
    render(<ErrorState title="failed" retryLabel="retry" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('warning variant tints the icon chip with the warning tokens', () => {
    render(<ErrorState title="degraded" variant="warning" />);
    const chip = document.querySelector('div [class*="rounded-full"]');
    expect(chip?.className).toContain('var(--c-warning-50)');
  });
});
