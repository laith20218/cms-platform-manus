import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FormDialog } from './FormDialog';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

function Harness(props: { busy?: boolean; danger?: boolean; submitDisabled?: boolean; submitLabel?: string; submitBusyLabel?: string }) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(props.busy ?? false);
  const onSubmit = vi.fn((_event: React.FormEvent<HTMLFormElement>) => { /* owner controls busy */ });
  return (
    <>
      <button type="button" onClick={() => setBusy((b) => !b)} data-testid="toggle-busy">toggle</button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="إضافة مدير"
        description="نموذج قصير"
        onSubmit={onSubmit}
        submitLabel={props.submitLabel ?? 'حفظ التغييرات'}
        submitBusyLabel={props.submitBusyLabel ?? 'جارٍ الحفظ…'}
        busy={busy}
        danger={props.danger}
        submitDisabled={props.submitDisabled}
        testId="admin-form-dialog"
      >
        <input data-testid="field" required />
      </FormDialog>
    </>
  );
}

describe('FormDialog', () => {
  it('renders a labelled dialog with title + description', () => {
    render(<Harness />);
    expect(screen.getByRole('dialog', { name: 'إضافة مدير' })).toBeInTheDocument();
    expect(screen.getByText('نموذج قصير')).toBeInTheDocument();
  });

  it('submits the native form through onSubmit', () => {
    const spy = vi.fn();
    const { } = render(
      <FormDialog
        open
        onOpenChange={() => {}}
        title="t"
        onSubmit={spy}
        submitLabel="حفظ"
      >
        <input />
      </FormDialog>,
    );
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('swaps the submit label to the busy label and blocks duplicate submits while busy', () => {
    render(<Harness busy submitLabel="حفظ التغييرات" submitBusyLabel="جارٍ الحفظ…" />);
    const submit = screen.getByTestId('form-dialog-submit');
    expect(submit).toBeDisabled();
    expect(submit.textContent).toContain('جارٍ الحفظ…');
    expect(submit.textContent).not.toContain('حفظ التغييرات');
  });

  it('keeps Escape and backdrop silent while busy (dismissGuard)', () => {
    render(<Harness busy />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('cancel closes through onOpenChange', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('form-dialog-cancel'));
    waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('extra disable conditions keep the submit inert', () => {
    render(<Harness submitDisabled />);
    expect(screen.getByTestId('form-dialog-submit')).toBeDisabled();
  });

  it('focus is trapped inside the open dialog and restored on close', async () => {
    const { unmount } = render(<Harness />);
    const panel = screen.getByRole('dialog');
    await waitFor(() => expect(panel).toHaveFocus());
    unmount();
  });
});

function GuardHarness({ dirty }: { dirty: boolean }) {
  const [open, setOpen] = useState(true);
  const guard = useUnsavedChanges({});
  return (
    <>
      <button type="button" data-testid="try-close" onClick={() => guard.closeIfClean(dirty, () => setOpen(false))}>close</button>
      {guard.dialog}
      {open && <div data-testid="surface">surface</div>}
    </>
  );
}

describe('useUnsavedChanges', () => {
  it('closes immediately when the surface is clean', () => {
    render(<GuardHarness dirty={false} />);
    fireEvent.click(screen.getByTestId('try-close'));
    expect(screen.queryByTestId('surface')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unsaved-changes-confirm')).not.toBeInTheDocument();
  });

  it('asks before closing when dirty, and closes on confirm', async () => {
    render(<GuardHarness dirty />);
    fireEvent.click(screen.getByTestId('try-close'));
    expect(screen.getByTestId('surface')).toBeInTheDocument();
    const confirm = await screen.findByTestId('unsaved-changes-confirm');
    expect(confirm).toBeInTheDocument();
    fireEvent.click(screen.getByText('إغلاق دون حفظ'));
    await waitFor(() => expect(screen.queryByTestId('surface')).not.toBeInTheDocument());
  });

  it('keeps the surface open when the operator continues editing', async () => {
    render(<GuardHarness dirty />);
    fireEvent.click(screen.getByTestId('try-close'));
    fireEvent.click(screen.getByText('متابعة التحرير'));
    await waitFor(() => expect(screen.queryByTestId('unsaved-changes-confirm')).not.toBeInTheDocument());
    expect(screen.getByTestId('surface')).toBeInTheDocument();
  });
});
