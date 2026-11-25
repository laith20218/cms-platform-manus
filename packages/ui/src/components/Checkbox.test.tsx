import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('exposes native checkbox semantics with a visible label', () => {
    render(<Checkbox checked onCheckedChange={vi.fn()} label="نشر فوري" description="يظهر للطلاب مباشرة" />);
    const box = screen.getByRole('checkbox', { name: 'نشر فوري', checked: true });
    expect(box).toBeEnabled();
    expect(screen.getByText('يظهر للطلاب مباشرة')).toBeInTheDocument();
  });

  it('unchecked click reports true, checked click reports false', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Checkbox checked={false} onCheckedChange={onChange} label="تحديد" />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد' }));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<Checkbox checked onCheckedChange={onChange} label="تحديد" />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('label clicks toggle the control (label association)', () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onChange} label="تحديد الكل" />);
    fireEvent.click(screen.getByText('تحديد الكل'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('indeterminate state reports mixed and resolves to checked on click', () => {
    const onChange = vi.fn();
    render(<Checkbox checked="indeterminate" onCheckedChange={onChange} label="تحديد جزئي" />);
    const box = screen.getByRole('checkbox', { name: 'تحديد جزئي' }) as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    expect(box).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('disabled checkbox stays silent', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked disabled onCheckedChange={onChange} label="مقفل" />);
    // userEvent honours disabled controls the way real browsers do: no click fires.
    await user.click(screen.getByRole('checkbox', { name: 'مقفل' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'مقفل' })).toBeDisabled();
  });

  it('works without a visible label via aria-label', () => {
    render(<Checkbox checked={false} onCheckedChange={vi.fn()} aria-label="تحديد الصف" />);
    expect(screen.getByRole('checkbox', { name: 'تحديد الصف' })).toBeInTheDocument();
  });
});
