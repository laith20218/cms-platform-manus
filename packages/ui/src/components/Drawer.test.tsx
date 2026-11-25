import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Drawer } from './Drawer';

const Harness = ({ initial = true, ...props }: { initial?: boolean } & Record<string, unknown>) => {
  const [open, setOpen] = useState(initial);
  return (
    <Drawer open={open} onOpenChange={setOpen} title="تعديل السؤال" {...(props as object)}>
      <input data-testid="field" />
    </Drawer>
  );
};

describe('Drawer', () => {
  it('renders nothing while closed', () => {
    render(<Harness initial={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders title, description, body and footer slots as a dialog', () => {
    render(
      <Harness footer={<button type="button" data-testid="save">حفظ</button>} description="مسودة" />,
    );
    expect(screen.getByRole('dialog', { name: 'تعديل السؤال' })).toBeInTheDocument();
    expect(screen.getByText('مسودة')).toBeInTheDocument();
    expect(screen.getByTestId('field')).toBeInTheDocument();
    expect(screen.getByTestId('save')).toBeInTheDocument();
  });

  it('closes on Escape and on backdrop mousedown', async () => {
    const { rerender } = render(<Harness />);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    rerender(<Harness key="second" />);
    const backdrop = document.querySelector('[role="presentation"]') as HTMLElement;
    fireEvent.mouseDown(backdrop);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('anchors on the inline-end side by default and inline-start with side="start"', () => {
    const { rerender } = render(<Harness />);
    expect(screen.getByRole('dialog').className).toContain('end-0');

    rerender(<Harness key="start" side="start" />);
    expect(screen.getByRole('dialog').className).toContain('start-0');
  });

  it('moves focus into the panel and locks body scroll while open', async () => {
    render(<Harness />);
    const panel = screen.getByRole('dialog');
    await waitFor(() => expect(panel).toHaveFocus());
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('dismissGuard keeps Escape silent', () => {
    render(<Harness dismissGuard />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
