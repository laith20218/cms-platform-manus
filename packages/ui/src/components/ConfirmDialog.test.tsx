import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

const makeProps = () => ({
  open: true,
  onOpenChange: vi.fn(),
  onConfirm: vi.fn(),
  title: 'حذف المدير',
});

describe('ConfirmDialog', () => {
  it('renders default Arabic labels inside an accessible dialog', () => {
    const props = makeProps();
    render(<ConfirmDialog {...props} description="سيتم حذف الحساب نهائيًا." />);
    expect(screen.getByRole('dialog', { name: 'حذف المدير' })).toBeInTheDocument();
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('تأكيد');
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('إلغاء');
  });

  it('cancel fires onOpenChange(false) and never onConfirm', () => {
    const props = makeProps();
    render(<ConfirmDialog {...props} />);
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('confirm fires onConfirm and leaves closing to the consumer (busy flows stay open)', () => {
    const props = makeProps();
    render(<ConfirmDialog {...props} />);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(props.onConfirm).toHaveBeenCalledWith(undefined);
    // The dialog is controlled: it must NOT close itself on confirm — the caller
    // keeps it open while the action runs (busy) and closes on completion.
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('danger variant renders the consequence inside the red callout, not the header', () => {
    const props = makeProps();
    render(<ConfirmDialog {...props} variant="danger" description="سيُحذف المحتوى نهائيًا مع ملفاته." />);
    expect(screen.getByText('سيُحذف المحتوى نهائيًا مع ملفاته.')).toBeInTheDocument();
    // The dialog is still named by the title only.
    expect(screen.getByRole('dialog', { name: 'حذف المدير' })).toBeInTheDocument();
    expect(screen.getByTestId('confirm-dialog-confirm').className).toContain('danger');
  });

  it('requireAcknowledge keeps confirm disabled until the operator checks the box', () => {
    const props = makeProps();
    render(<ConfirmDialog {...props} requireAcknowledge={{ label: 'أفهم أن الحذف نهائي' }} />);
    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText('أفهم أن الحذف نهائي'));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(props.onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('requireReason gates confirm on the minimum length and passes the trimmed reason', () => {
    const props = makeProps();
    render(<ConfirmDialog {...props} requireReason={{ minLength: 6 }} />);
    const confirm = screen.getByTestId('confirm-dialog-confirm');
    const reason = screen.getByTestId('confirm-dialog-reason') as HTMLTextAreaElement;
    expect(confirm).toBeDisabled();

    fireEvent.change(reason, { target: { value: 'قصير' } });
    expect(confirm).toBeDisabled();

    fireEvent.change(reason, { target: { value: '  مخالفة بنود الاستخدام  ' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(props.onConfirm).toHaveBeenCalledWith('مخالفة بنود الاستخدام');
  });

  it('busy locks the buttons and every dismissal path', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ConfirmDialog {...props} busy />);
    expect(screen.getByTestId('confirm-dialog-confirm')).toBeDisabled();
    expect(screen.getByTestId('confirm-dialog-cancel')).toBeDisabled();
    // userEvent honours disabled controls the way real browsers do: no click fires.
    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    await user.click(screen.getByTestId('confirm-dialog-cancel'));
    await user.click(screen.getByTestId('dialog-close'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('accepts English labels and direction for the EN locale', () => {
    const props = makeProps();
    render(<ConfirmDialog {...props} dir="ltr" confirmLabel="Delete" cancelLabel="Cancel" />);
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Delete');
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Cancel');
    expect(screen.getByRole('dialog').parentElement).toHaveAttribute('dir', 'ltr');
  });
});
