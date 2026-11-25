import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Command Center P1 — Danger Zone (D-3) + HardDeleteDialog (D-4) contract:
 *  • dryRun preview lists per-table counts and fires NOTHING destructive
 *  • execution refuses a wrong typed confirmation client-side (DELETE / حذف only)
 *  • the real wipe sends the typed confirmation + re-auth password
 *  • hard delete surfaces the backend's loud-fail child-count error inline
 *    and retrying with the cascade checkbox resends cascade=true
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  // The maintenance client functions delegate to the same mocked transport so the
  // path/body assertions below cover the real wire contract.
  adminWipe: (token: string, request: Record<string, unknown>) =>
    apiRequestMock('/api/v1/admin/system/wipe', token, { method: 'POST', body: JSON.stringify(request) }),
  adminHardDelete: (token: string, request: Record<string, unknown>) =>
    apiRequestMock('/api/v1/admin/system/hard-delete', token, { method: 'POST', body: JSON.stringify(request) }),
  ApiError: class ApiError extends Error { status = 400; },
}));

import { ApiError } from '../lib/api';
import { DangerZone } from '../components/DangerZone';
import { HardDeleteDialog } from '../components/HardDeleteDialog';

const calls: Array<{ path: string; init?: RequestInit }> = [];

// The first Danger Zone module card is the questions wipe (MODULES[0]).
async function clickFirstPreview() {
  const [previewButton] = await screen.findAllByRole('button', { name: /معاينة المحو/ });
  fireEvent.click(previewButton);
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === '/api/v1/admin/system/wipe') {
      if (body.dryRun) {
        return { module: body.module, dryRun: true, tables: [{ table: 'questions', rows: 42 }, { table: 'question_options', rows: 160 }] };
      }
      return { module: body.module, dryRun: false, tables: [{ table: 'questions', rows: 42 }] };
    }
    if (path === '/api/v1/admin/system/hard-delete') {
      if (!body.cascade && body.module === 'subject') {
        throw new ApiError('لا يمكن الحذف النهائي — توجد عناصر مرتبطة (questions=2، exams=1).', 400);
      }
      return { module: body.module, targetId: body.targetId, deleted: [{ table: 'subjects', rows: 1 }] };
    }
    return {};
  });
});

describe('DangerZone — module wipe with dry-run + typed double confirmation', () => {
  function renderZone() {
    return render(<DangerZone token="test-token" isArabic onError={vi.fn()} onNotice={vi.fn()} />);
  }

  it('previews per-table counts on dry run without any destructive request', async () => {
    renderZone();
    await clickFirstPreview();

    const dialog = await screen.findByTestId('wipe-preview-dialog');
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('الأسئلة')).toBeInTheDocument());
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('160')).toBeInTheDocument();

    const wipeCalls = calls.filter((c) => c.path === '/api/v1/admin/system/wipe');
    expect(wipeCalls).toHaveLength(1);
    expect(JSON.parse(String(wipeCalls[0].init?.body)).dryRun).toBe(true);
  });

  it('refuses a wrong confirmation word client-side; accepts DELETE and sends the password', async () => {
    const { rerender } = renderZone();
    await clickFirstPreview();
    await screen.findByTestId('wipe-preview-dialog');
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /متابعة إلى التأكيد النهائي/ }));

    const execute = screen.getByTestId('wipe-execute');
    expect(execute).toBeDisabled();

    fireEvent.change(screen.getByTestId('wipe-confirm-text'), { target: { value: 'yes' } });
    fireEvent.change(screen.getByTestId('wipe-actor-password'), { target: { value: 'pass' } });
    expect(execute).toBeDisabled();

    fireEvent.change(screen.getByTestId('wipe-confirm-text'), { target: { value: 'delete' } });
    expect(execute).toBeEnabled();
    fireEvent.click(execute);

    await waitFor(() => {
      const realCalls = calls.filter((c) => c.path === '/api/v1/admin/system/wipe');
      expect(realCalls).toHaveLength(2);
      const body = JSON.parse(String(realCalls[1].init?.body));
      expect(body.dryRun).toBe(false);
      expect(body.confirmText).toBe('delete');
      expect(body.actorPassword).toBe('pass');
      expect(body.module).toBe('questions');
    });
    rerender(<DangerZone token="test-token" isArabic onError={vi.fn()} onNotice={vi.fn()} />);
  });

  it('accepts the Arabic confirmation word حذف', async () => {
    renderZone();
    await clickFirstPreview();
    await screen.findByTestId('wipe-preview-dialog');
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /متابعة إلى التأكيد النهائي/ }));

    fireEvent.change(screen.getByTestId('wipe-confirm-text'), { target: { value: 'حذف' } });
    fireEvent.change(screen.getByTestId('wipe-actor-password'), { target: { value: 'pass' } });
    expect(screen.getByTestId('wipe-execute')).toBeEnabled();
  });
});

describe('HardDeleteDialog — loud-fail child counts + cascade retry', () => {
  it('surfaces the backend refusal inline, then resends with cascade after the checkbox', async () => {
    apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
      calls.push({ path, init });
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (path === '/api/v1/admin/system/hard-delete' && !body.cascade) {
        throw new ApiError('لا يمكن الحذف النهائي — توجد عناصر مرتبطة (questions=2، exams=1).', 400);
      }
      return { module: body.module, targetId: body.targetId, deleted: [{ table: 'subjects', rows: 1 }] };
    });

    const onDone = vi.fn();
    const { rerender } = render(
      <HardDeleteDialog
        token="test-token"
        isArabic
        target={{ module: 'subject', targetId: 's1', label: 'الباطنة' }}
        consequence="سيُحذف كل ما يتبع هذه المادة."
        onDone={onDone}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(await screen.findByTestId('hard-delete-password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByTestId('hard-delete-execute'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('questions=2');
    });

    fireEvent.click(screen.getByTestId('hard-delete-cascade'));
    fireEvent.click(screen.getByTestId('hard-delete-execute'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const bodies = calls
      .filter((c) => c.path === '/api/v1/admin/system/hard-delete')
      .map((c) => JSON.parse(String(c.init?.body)));
    expect(bodies[0].cascade).toBe(false);
    expect(bodies[1].cascade).toBe(true);
    void rerender;
  });
});
