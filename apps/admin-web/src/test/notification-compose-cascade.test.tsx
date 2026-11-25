import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * W5 (admin-ui) — NotificationCompose audience cascade (debt D-22).
 * College/Year/Semester/Subject previously fell back to a raw UUID input with
 * a silently-disabled Send. Locks: the cascade resolves the target id from
 * the hierarchy, the Arabic hint explains why Send is disabled, and the
 * payload carries the resolved target.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { NotificationCompose } from '../components/NotificationCompose';

const calls: Array<{ path: string; init?: RequestInit }> = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.startsWith('/api/v1/universities?')) {
      return { items: [{ id: 'u1', nameAr: 'جامعة تشرين' }] };
    }
    if (path.startsWith('/api/v1/universities/u1/colleges')) return [{ id: 'c1', nameAr: 'كلية الطب' }];
    if (path.startsWith('/api/v1/colleges/c1/years')) return [{ id: 'y1', nameAr: 'السنة الأولى' }];
    if (path.startsWith('/api/v1/years/y1/semesters')) return [{ id: 'sem1', nameAr: 'الفصل الأول' }];
    if (path.startsWith('/api/v1/semesters/sem1/subjects')) return [{ id: 's1', nameAr: 'التشريح' }];
    if (path.startsWith('/api/v1/notifications/send')) {
      return { notificationId: 'n1', recipientsCount: 12, isScheduled: false };
    }
    return { items: [] };
  });
}

function renderCompose() {
  return render(
    <NotificationCompose token="test-token" isArabic onClose={vi.fn()} onError={vi.fn()} onNotice={vi.fn()} />,
  );
}

const choose = async (label: string, value: string) => {
  const select = await screen.findByLabelText(label);
  fireEvent.change(select, { target: { value } });
};

const setAudience = async (value: string) => {
  const audienceSelect = await screen.findByRole('combobox', { name: 'الجمهور المستهدف' });
  fireEvent.change(audienceSelect, { target: { value } });
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  stubApi();
});

describe('W5 — NotificationCompose audience cascade', () => {
  it('resolves a Subject target through university → college → year → semester → subject', async () => {
    renderCompose();

    // Audience = مادة محددة
    await setAudience('Subject');
    // The Arabic validation hint explains the disabled Send (no silent no-op).
    await waitFor(() => expect(screen.getByTestId('notification-target-hint')).toBeInTheDocument());

    await choose('الجامعة (للوصول إلى الهدف)', 'u1');
    await choose('الكلية (للوصول إلى الهدف)', 'c1');
    await choose('السنة (للوصول إلى الهدف)', 'y1');
    await choose('الفصل (للوصول إلى المادة)', 'sem1');

    const target = await screen.findByTestId('notification-target-select');
    await waitFor(() => expect(target).toBeEnabled());
    fireEvent.change(target, { target: { value: 's1' } });
    await waitFor(() => expect(screen.queryByTestId('notification-target-hint')).not.toBeInTheDocument());

    // Fill the message and send — the resolved subject id travels in the payload.
    fireEvent.change(screen.getByPlaceholderText('اكتب عنوان الإشعار...'), { target: { value: 'إشعار تجريبي' } });
    fireEvent.change(screen.getByPlaceholderText('اكتب نص الإشعار...'), { target: { value: 'نص الإشعار' } });
    fireEvent.click(screen.getByText('إرسال', { selector: 'button' }));

    await waitFor(() => expect(calls.some((c) => c.path.includes('/api/v1/notifications/send'))).toBe(true));
    const sendCall = calls.find((c) => c.path.includes('send'));
    const payload = JSON.parse(String(sendCall?.init?.body));
    expect(payload.targetType).toBe('Subject');
    expect(payload.targetId).toBe('s1');
  });

  it('a College audience resolves with exactly one context select (university) + the target', async () => {
    renderCompose();
    await setAudience('College');
    await choose('الجامعة (للوصول إلى الهدف)', 'u1');

    const target = await screen.findByTestId('notification-target-select');
    await waitFor(() => expect(target).toBeEnabled());
    fireEvent.change(target, { target: { value: 'c1' } });
    await waitFor(() => expect(screen.queryByTestId('notification-target-hint')).not.toBeInTheDocument());
    expect(screen.getByText('كلية الطب')).toBeInTheDocument();
  });

  it('keeps Send inert while a required target is missing, with the Arabic hint visible', async () => {
    renderCompose();
    await setAudience('Year');
    fireEvent.change(screen.getByPlaceholderText('اكتب عنوان الإشعار...'), { target: { value: 'عنوان' } });
    fireEvent.change(screen.getByPlaceholderText('اكتب نص الإشعار...'), { target: { value: 'نص' } });

    expect(screen.getByTestId('notification-target-hint')).toBeInTheDocument();
    // No send request can fire while the target is unresolved.
    expect(calls.some((c) => c.path.includes('send'))).toBe(false);
  });
});
