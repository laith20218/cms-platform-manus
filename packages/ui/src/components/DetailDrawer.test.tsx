import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DetailDrawer } from './DetailDrawer';

const Harness = (props: { status?: 'loading' | 'ready' | 'empty' | 'error'; onRetry?: () => void; footer?: React.ReactNode }) => {
  const [open, setOpen] = useState(true);
  return (
    <DetailDrawer
      open={open}
      onOpenChange={setOpen}
      title="ملف الطالب"
      description="سامر خالد · 0936185126"
      status={props.status ?? 'ready'}
      onRetry={props.onRetry}
      footer={props.footer}
      testId="student-detail-drawer"
      {...(props.status === 'error' ? { errorTitle: 'تعذّر تحميل التفاصيل' } : {})}
    >
      <p data-testid="detail-body">بيانات جاهزة</p>
    </DetailDrawer>
  );
};

describe('DetailDrawer', () => {
  it('renders the loading skeleton with a status role (no fake values)', () => {
    render(<Harness status="loading" />);
    expect(screen.getByTestId('detail-drawer-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-body')).not.toBeInTheDocument();
  });

  it('renders children only in the ready state', () => {
    render(<Harness status="ready" />);
    expect(screen.getByTestId('detail-body')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-drawer-loading')).not.toBeInTheDocument();
  });

  it('renders an honest empty state (never an alarm)', () => {
    render(<Harness status="empty" />);
    expect(screen.getByTestId('detail-drawer-empty')).toBeInTheDocument();
    expect(screen.getByText('لا توجد بيانات')).toBeInTheDocument();
  });

  it('renders the error state with Retry wired to onRetry', async () => {
    const onRetry = vi.fn();
    render(<Harness status="error" onRetry={onRetry} />);
    const retry = screen.getByTestId('detail-drawer-retry');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('is a labelled dialog with title and description', () => {
    render(<Harness status="ready" />);
    expect(screen.getByRole('dialog', { name: 'ملف الطالب' })).toBeInTheDocument();
    expect(screen.getByText('سامر خالد · 0936185126')).toBeInTheDocument();
  });

  it('closes on Escape and anchors logically (RTL → inline-end)', async () => {
    render(<Harness status="ready" />);
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('end-0');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('moves focus into the panel (focus trap contract inherited from Drawer)', async () => {
    render(<Harness status="ready" />);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
  });

  it('renders the sticky footer actions when provided', () => {
    render(<Harness status="ready" footer={<button type="button" data-testid="detail-action">إغلاق</button>} />);
    expect(screen.getByTestId('detail-action')).toBeInTheDocument();
  });
});
