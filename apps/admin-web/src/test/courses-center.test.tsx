import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the API layer — the cascade + course list are served from static fixtures.
const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { CoursesCenter } from '../components/CoursesCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const COURSE = {
  id: 'k1', subjectId: 's1', subjectName: 'تشريح مرضي', title: 'كورس تجريبي',
  status: 'Published', episodesCount: 0, viewsCount: 0, createdAt: '2026-10-24T00:00:00Z',
};

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/admin/courses?')) return { items: [COURSE], total: 1, page: 1, pageSize: 20, totalPages: 1 };
    if (path.startsWith('/api/v1/admin/courses/k1')) return { ...COURSE, description: null, coverImageUrl: null, episodes: [] };
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  });
}

function renderCenter(isArabic: boolean) {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <CoursesCenter
        token="test-token"
        isArabic={isArabic}
        onError={vi.fn()}
        onNotice={vi.fn()}
        subjectId="s1"
        refreshSignal={0}
      />
    </UiPermissionsProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubApi();
});

// ================= Push 6 Task 1: media upload panel copy + failure UX =================

describe('CoursesCenter — media upload panel', () => {
  it('uses the media (video/audio) title on the upload button and drawer heading', async () => {
    renderCenter(true);

    // Expand the course's episode manager — the upload CTA carries the new title.
    const courseButton = await screen.findByRole('button', { name: /كورس تجريبي/ });
    fireEvent.click(courseButton);

    await waitFor(() => {
      expect(screen.getByText('رفع وسائط (فيديو/صوت)')).toBeInTheDocument();
    });
    // The OLD video-only title must be gone everywhere.
    expect(screen.queryByText('رفع فيديو (متعدد الأجزاء)')).not.toBeInTheDocument();
  });

  it('uses the English media title when the interface is English', async () => {
    renderCenter(false);

    const courseButton = await screen.findByRole('button', { name: /كورس تجريبي/ });
    fireEvent.click(courseButton);

    await waitFor(() => {
      expect(screen.getByText('Upload media (video/audio)')).toBeInTheDocument();
    });
    expect(screen.queryByText('Upload video (multipart)')).not.toBeInTheDocument();
  });

  it('opens the upload panel with the media title and the video/audio accept list', async () => {
    const { container } = renderCenter(true);

    const courseButton = await screen.findByRole('button', { name: /كورس تجريبي/ });
    fireEvent.click(courseButton);

    const uploadButton = await screen.findByRole('button', { name: /رفع وسائط/ });
    fireEvent.click(uploadButton);

    const fileInput = await waitFor(() => {
      const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
      expect(input).not.toBeNull();
      return input as HTMLInputElement;
    });
    expect(fileInput.getAttribute('accept')).toContain('audio/mpeg');
    expect(fileInput.getAttribute('accept')).toContain('video/mp4');
    // The panel heading carries the new media title too.
    expect(screen.getAllByText('رفع وسائط (فيديو/صوت)').length).toBeGreaterThanOrEqual(2);
  });
});
