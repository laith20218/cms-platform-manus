import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchX } from 'lucide-react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders a status region with icon, title, description and action', () => {
    render(
      <EmptyState
        icon={SearchX}
        title="لا توجد نتائج مطابقة"
        description="جرّب تغيير عوامل التصفية ثم أعد البحث."
        action={<button type="button">إزالة التصفية</button>}
        testId="empty"
      />,
    );
    const region = screen.getByRole('status');
    expect(region).toBeInTheDocument();
    expect(screen.getByText('لا توجد نتائج مطابقة')).toBeInTheDocument();
    expect(screen.getByText('جرّب تغيير عوامل التصفية ثم أعد البحث.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إزالة التصفية' })).toBeInTheDocument();
  });

  it('omits optional slots and applies the caller icon tint', () => {
    render(
      <EmptyState icon={SearchX} title="No results" iconClassName="bg-amber-50 text-amber-600" />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const chip = document.querySelector('div [class*="rounded-full"]');
    expect(chip?.className).toContain('bg-amber-50');
    expect(chip?.className).toContain('text-amber-600');
  });
});
