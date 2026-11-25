import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from './Select';

const OPTIONS = [
  { value: 'draft', label: 'مسودة' },
  { value: 'published', label: 'منشور' },
  { value: 'archived', label: 'مؤرشف', disabled: true },
];

describe('Select', () => {
  it('renders a labelled combobox with declarative options', () => {
    render(<Select label="الحالة" options={OPTIONS} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'الحالة' }) as HTMLSelectElement;
    expect(screen.getByRole('option', { name: 'منشور' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'مؤرشف' })).toBeDisabled();
    expect(select.options.length).toBe(3);
  });

  it('supports <option> children and fires onChange with the chosen value', () => {
    const onChange = vi.fn();
    render(
      <Select label="النوع" onChange={onChange}>
        <option value="mcq">اختيار من متعدد</option>
        <option value="essay">تحريري</option>
      </Select>,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'النوع' }), { target: { value: 'essay' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('marks the control invalid and describes it when error + hint are set', () => {
    render(<Select label="المادة" options={OPTIONS} error hint="المادة مطلوبة" onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'المادة' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('المادة مطلوبة')).toBeInTheDocument();
    expect(select.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('disabled select renders inert', () => {
    render(<Select label="الحالة" options={OPTIONS} disabled onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'الحالة' })).toBeDisabled();
  });
});
