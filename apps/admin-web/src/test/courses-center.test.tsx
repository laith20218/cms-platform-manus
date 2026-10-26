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

// ================= Push 7: honest content-type sniffing on upload =================

describe('CoursesCenter — Push 7 upload typing', () => {
  it('sends the sniffed audio/mpeg for an Arabic-named MP3 (browser type empty)', async () => {
    const onError = vi.fn();
    const { container } = render(
      <UiPermissionsProvider value={{ phase: 'idle' }}>
        <CoursesCenter
          token="test-token" isArabic onError={onError} onNotice={vi.fn()}
          subjectId="s1" refreshSignal={0}
        />
      </UiPermissionsProvider>
    );

    const courseButton = await screen.findByRole('button', { name: /كورس تجريبي/ });
    fireEvent.click(courseButton);
    const uploadButton = await screen.findByRole('button', { name: /رفع وسائط/ });
    fireEvent.click(uploadButton);

    // A real MP3 whose name carries Arabic characters — jsdom leaves file.type
    // empty exactly like the user's browser did for unrecognized extensions.
    const mp3 = new File([new Uint8Array(1024)], 'test-عربي.mp3', { type: '' });
    const fileInput = await waitFor(() => container.querySelector('input[type="file"]') as HTMLInputElement);
    fireEvent.change(fileInput, { target: { files: [mp3] } });
    fireEvent.change(screen.getByPlaceholderText('عنوان الحلقة'), { target: { value: 'حلقة عربية' } });

    apiRequestMock.mockImplementation(async () => ({
      // Hotfix 10.8f — single-PUT initiate response: ONE presigned URL for the whole file.
      episodeId: 'ep-9', uploadUrl: 'https://r2/put-whole-file', fileKey: 'courses/k1/x/y',
    }));
    const startButton = await screen.findByRole('button', { name: /بدء الرفع/ });
    fireEvent.click(startButton);

    await waitFor(() => {
      const initiate = apiRequestMock.mock.calls.find(([path]) => String(path).includes('initiate-upload'));
      expect(initiate).toBeDefined();
    });
    // apiRequest(path, token, init) — the body lives on the third argument.
    const initiateCall = apiRequestMock.mock.calls.find(([path]) => String(path).includes('initiate-upload'));
    const body = JSON.parse(String(initiateCall?.[2]?.body));
    expect(body.fileName).toBe('test-عربي.mp3');
    // Sniffed from the .mp3 extension — never invented.
    expect(body.contentType).toBe('audio/mpeg');
    expect(onError).not.toHaveBeenCalledWith(expect.stringContaining('لا يمكن التعرّف'));
  });

  it('PUTs the whole file once via XHR and calls complete-upload WITHOUT parts (10.8f)', async () => {
    // Fake XHR: captures open/setRequestHeader/send, resolves the PUT with HTTP 200.
    const xhrInstances: FakeXHR[] = [];
    class FakeXHR {
      status = 0;
      onload: (() => void) | null = null;
      upload = { addEventListener: vi.fn() };
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => { this.status = 200; queueMicrotask(() => this.onload?.()); });
      addEventListener = vi.fn((type: string, listener: () => void) => { if (type === 'load') this.onload = listener; });
      constructor() { xhrInstances.push(this); }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXHR);

    // jsdom lacks URL.createObjectURL — the panel's video-resolution probe (10.7)
    // needs it for MP4 picks; stub it so the probe settles via its timeout path.
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

    try {
      apiRequestMock.mockImplementation(async (path: string) => {
        // NOTE: the initiate/complete checks MUST precede the course-detail prefix
        // check — `/api/v1/admin/courses/k1/episodes/initiate-upload` starts with
        // `/api/v1/admin/courses/k1` and would otherwise swallow them.
        if (String(path).includes('initiate-upload')) {
          return { episodeId: 'ep-9', uploadUrl: 'https://r2/put-whole-file', fileKey: 'courses/k1/x/y' };
        }
        if (String(path).includes('complete-upload')) {
          return { id: 'ep-9', courseId: 'k1', title: 'حلقة', episodeNumber: 1, sourceType: 'Upload', uploadCompleted: true, viewsCount: 0 };
        }
        if (path.startsWith('/api/v1/admin/courses?')) return { items: [COURSE], total: 1, page: 1, pageSize: 20, totalPages: 1 };
        if (path.startsWith('/api/v1/admin/courses/k1')) return { ...COURSE, description: null, coverImageUrl: null, episodes: [] };
        return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      });

      const { container } = render(
        <UiPermissionsProvider value={{ phase: 'idle' }}>
          <CoursesCenter token="test-token" isArabic onError={vi.fn()} onNotice={vi.fn()} subjectId="s1" refreshSignal={0} />
        </UiPermissionsProvider>
      );

      const courseButton = await screen.findByRole('button', { name: /كورس تجريبي/ });
      fireEvent.click(courseButton);
      const uploadButton = await screen.findByRole('button', { name: /رفع وسائط/ });
      fireEvent.click(uploadButton);

      const mp4 = new File([new Uint8Array(2048)], 'lesson.mp4', { type: 'video/mp4' });
      const fileInput = await waitFor(() => container.querySelector('input[type="file"]') as HTMLInputElement);
      fireEvent.change(fileInput, { target: { files: [mp4] } });
      fireEvent.change(screen.getByPlaceholderText('عنوان الحلقة'), { target: { value: 'درس الاختبار' } });

      fireEvent.click(await screen.findByRole('button', { name: /بدء الرفع/ }));

      await waitFor(() => {
        const complete = apiRequestMock.mock.calls.find(([path]) => String(path).includes('complete-upload'));
        expect(complete).toBeDefined();
      });

      // THE 10.8f PROOF — one XHR PUT of the whole File against the presigned URL,
      // with the sniffed Content-Type riding the request (the URL signs it):
      expect(xhrInstances).toHaveLength(1);
      expect(xhrInstances[0].open).toHaveBeenCalledWith('PUT', 'https://r2/put-whole-file');
      expect(xhrInstances[0].setRequestHeader).toHaveBeenCalledWith('Content-Type', 'video/mp4');
      expect(xhrInstances[0].send).toHaveBeenCalledWith(mp4);

      // complete-upload carries the metadata and NO parts key.
      const completeCall = apiRequestMock.mock.calls.find(([path]) => String(path).includes('complete-upload'));
      const body = JSON.parse(String(completeCall?.[2]?.body));
      expect(body.parts).toBeUndefined();
      expect(body.title).toBe('درس الاختبار');
      expect(body.targetQuality).toBe('Auto');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects an unrecognizable file (mp3.رقيق) client-side — initiate is never called', async () => {
    const onError = vi.fn();
    const { container } = render(
      <UiPermissionsProvider value={{ phase: 'idle' }}>
        <CoursesCenter
          token="test-token" isArabic onError={onError} onNotice={vi.fn()}
          subjectId="s1" refreshSignal={0}
        />
      </UiPermissionsProvider>
    );

    const courseButton = await screen.findByRole('button', { name: /كورس تجريبي/ });
    fireEvent.click(courseButton);
    const uploadButton = await screen.findByRole('button', { name: /رفع وسائط/ });
    fireEvent.click(uploadButton);

    // The user's exact mystery file: Arabic extension → no browser type, no known extension.
    const mystery = new File([new Uint8Array(1024)], 'mp3.رقيق', { type: '' });
    const fileInput = await waitFor(() => container.querySelector('input[type="file"]') as HTMLInputElement);
    fireEvent.change(fileInput, { target: { files: [mystery] } });
    fireEvent.change(screen.getByPlaceholderText('عنوان الحلقة'), { target: { value: 'ملف غامض' } });

    fireEvent.click(await screen.findByRole('button', { name: /بدء الرفع/ }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('لا يمكن التعرّف على نوع الملف'));
    });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('mp3.رقيق'));
    // Zero initiate calls — the server never sees an untypeable file.
    expect(apiRequestMock.mock.calls.some(([path]) => String(path).includes('initiate-upload'))).toBe(false);
  });
});
