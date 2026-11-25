import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';

const Harness = ({ initial = true, ...props }: { initial?: boolean } & Record<string, unknown>) => {
  const [open, setOpen] = useState(initial);
  return (
    <>
      <button type="button" data-testid="opener" onClick={() => setOpen(true)}>فتح</button>
      <Dialog open={open} onOpenChange={setOpen} title="تأكيد العملية" {...(props as object)}>
        <button type="button" data-testid="first-control">أول</button>
        <button type="button" data-testid="last-control">ثانٍ</button>
      </Dialog>
    </>
  );
};

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(<Harness initial={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders as an accessible dialog: role, aria-modal, labelled name, description', () => {
    render(<Dialog open onOpenChange={vi.fn()} title="تأكيد العملية" description="هذا الإجراء لا يمكن التراجع عنه">
      <p>المحتوى</p>
    </Dialog>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('dialog', { name: 'تأكيد العملية' })).toBeInTheDocument();
    expect(screen.getByText('هذا الإجراء لا يمكن التراجع عنه')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    render(<Harness />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes on backdrop mousedown', async () => {
    const { container } = render(<Harness />);
    fireEvent.mouseDown(container.ownerDocument.querySelector('[role="presentation"]') as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes via the header close button', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('dialog-close'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('dismissGuard keeps Escape, backdrop and the close button silent', () => {
    const { container } = render(<Harness dismissGuard />);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(container.ownerDocument.querySelector('[role="presentation"]') as HTMLElement);
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-close')).toBeDisabled();
  });

  it('moves initial focus onto the panel and traps Tab inside it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());

    // Tabbable order: [dialog-close (header), first-control, last-control];
    // userEvent.tab() drives real sequential focus navigation.
    await user.tab();
    expect(screen.getByTestId('dialog-close')).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('first-control')).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('last-control')).toHaveFocus();

    // Tab from the last tabbable wraps: the trap preventDefaults and refocuses the first.
    await user.tab();
    expect(screen.getByTestId('dialog-close')).toHaveFocus();

    // Shift+Tab from the first tabbable wraps back to the last.
    await user.tab({ shift: true });
    expect(screen.getByTestId('last-control')).toHaveFocus();
  });

  it('restores focus to the invoker and unlocks body scroll on close', async () => {
    render(<Harness initial={false} />);
    const opener = screen.getByTestId('opener');
    // A real click moves focus onto the invoker before the dialog opens.
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
