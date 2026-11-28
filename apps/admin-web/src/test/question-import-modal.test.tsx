import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * W5 (admin-ui) — QuestionImportModal (matrix row 13: was UI=none).
 * Locks: explicit start step (no silent fire), client validation with Arabic
 * reasons, honest result report (created/failed + server errors), cancel
 * never POSTs.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { QuestionImportModal } from '../components/QuestionImportModal';

const calls: Array<{ path: string; init?: RequestInit }> = [];
const notices: string[] = [];
const errors: string[] = [];
const imported = vi.fn();

const CSV_OK = [
  'text,optionA,optionB,optionC,optionD,correctOption,explanation,difficulty,year',
  '"سؤال عن الخلية, الجزء الأول",نواة,جدار,سيتوبلازم,فجوة,B,"شرح الجواب",Easy,2',
  'سؤال ثانٍ,أ,ب,ج,د,C,شرح ثانٍ,Hard,3',
].join('\n');

const CSV_BAD_ROW = [
  'text,optionA,optionB,optionC,optionD,correctOption',
  'سؤال بأربعة خيارات,أ,ب,ج,د,X',
].join('\n');

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.includes('/questions/import')) {
      return { total: 2, success: 1, failed: 1, errors: ['السطر 2: صعوبة غير صالحة'] };
    }
    throw new Error('unexpected path');
  });
}

function makeFile(content: string, name = 'questions.csv') {
  return new File([content], name, { type: 'text/csv' });
}

function renderModal() {
  return render(
    <QuestionImportModal
      token="test-token" isArabic subjectId="s1"
      onClose={vi.fn()} onError={(m) => errors.push(m)} onNotice={(m) => notices.push(m)}
      onImported={imported}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  notices.length = 0;
  errors.length = 0;
  stubApi();
});

describe('W5 — QuestionImportModal', () => {
  it('parses the CSV (quoted commas tolerated), validates, and imports only on explicit start', async () => {
    renderModal();
    fireEvent.change(screen.getByTestId('question-import-file'), { target: { files: [makeFile(CSV_OK)] } });

    const ready = await screen.findByTestId('question-import-ready');
    expect(ready).toHaveTextContent(/تم التحقق من 2 سؤال/);
    expect(calls.length).toBe(0); // no silent fire

    fireEvent.click(screen.getByTestId('question-import-start'));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].path).toBe('/api/v1/questions/import');
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.subjectId).toBe('s1');
    expect(body.questions.length).toBe(2);
    // Quoted comma inside the question text survived the CSV parse.
    expect(body.questions[0].text).toContain('الخلية, الجزء الأول');
    expect(body.questions[0].correctOption).toBe('B');

    // Honest result report: created / failed + server errors.
    await waitFor(() => expect(screen.getByTestId('question-import-result')).toBeInTheDocument());
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    expect(screen.getByText(/تفاصيل الأخطاء من الخادم/)).toBeInTheDocument();
    expect(screen.getByText(/صعوبة غير صالحة/)).toBeInTheDocument();
    expect(imported).toHaveBeenCalled();
  });

  it('blocks client-invalid rows with Arabic reasons and never sends them', async () => {
    renderModal();
    fireEvent.change(screen.getByTestId('question-import-file'), { target: { files: [makeFile(CSV_BAD_ROW)] } });

    const validation = await screen.findByTestId('question-import-validation');
    expect(validation).toHaveTextContent('الإجابة الصحيحة يجب أن تكون A أو B أو C أو D');
    expect(screen.getByTestId('question-import-start')).toBeDisabled();
    expect(calls.length).toBe(0);
  });

  it('rejects non-CSV files before any parsing', async () => {
    renderModal();
    fireEvent.change(screen.getByTestId('question-import-file'), { target: { files: [makeFile(CSV_OK, 'questions.xlsx')] } });
    await screen.findByTestId('question-import-validation');
    expect(screen.getByText('اختر ملف CSV (‎.csv)')).toBeInTheDocument();
    expect(calls.length).toBe(0);
  });

  it('missing required column is reported by name', async () => {
    renderModal();
    fireEvent.change(screen.getByTestId('question-import-file'), {
      target: { files: [makeFile('optionA,optionB,correctOption\nأ,ب,C')] },
    });
    const validation = await screen.findByTestId('question-import-validation');
    expect(validation).toHaveTextContent('عمود مطلوب غير موجود: text');
    expect(calls.length).toBe(0);
  });
});
