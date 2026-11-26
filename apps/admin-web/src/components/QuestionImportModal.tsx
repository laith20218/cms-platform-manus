/**
 * QuestionImportModal — bulk MCQ import (W5-A, matrix row 13: was UI=none).
 *
 * API contract (recon-verified, QuestionsController):
 *   POST /api/v1/questions/import  body { subjectId, lectureId?, questions[] }
 *   question row: { text, optionA..D, correctOption, explanation, difficulty,
 *                   tags?, year?, reference? }
 *   → ImportResultDto { total, success, failed, errors[] }
 *
 * The endpoint accepts structured JSON (not a file), so the modal parses the
 * operator's CSV client-side and maps it to the API rows (documented in the
 * PR). Explicit «start import» step — a mis-click cannot fire silently.
 * Honest three-part result report: created / failed / backend errors.
 */
import { useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, LoaderCircle, Upload, XCircle } from 'lucide-react';
import { Button, Dialog } from '@cms/ui';
import { apiRequest } from '../lib/api';
import { t, localeOf } from '../lib/dictionary';

type ImportRow = {
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string;
  explanation: string;
  difficulty: string;
  tags: string;
  year: string;
  reference: string;
};

type ImportResult = {
  total: number;
  success: number;
  failed: number;
  errors: string[];
};

type Props = {
  token: string;
  isArabic: boolean;
  subjectId: string;
  onClose: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onImported: () => void | Promise<void>;
};

const MAX_ROWS = 500;
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

/** RFC-4180-ish CSV line splitter: quoted fields, "" escapes, CRLF tolerated. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  text: 'text', question: 'text', 'نص': 'text', 'النص': 'text',
  optiona: 'optionA', a: 'optionA', 'الخيارأ': 'optionA',
  optionb: 'optionB', b: 'optionB', 'الخيارب': 'optionB',
  optionc: 'optionC', c: 'optionC', 'الخيارج': 'optionC',
  optiond: 'optionD', d: 'optionD', 'الخيرالد': 'optionD',
  correctoption: 'correctOption', answer: 'correctOption', correct: 'correctOption', 'الإجابة': 'correctOption',
  explanation: 'explanation', 'الشرح': 'explanation',
  difficulty: 'difficulty', 'الصعوبة': 'difficulty',
  tags: 'tags', 'الوسوم': 'tags',
  year: 'year', 'السنة': 'year',
  reference: 'reference', 'المرجع': 'reference',
};

function mapRows(table: string[][]): { rows: ImportRow[]; parseErrors: string[] } {
  const parseErrors: string[] = [];
  if (table.length === 0) {
    return { rows: [], parseErrors: ['EMPTY'] };
  }
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  const indexByField = new Map<keyof ImportRow, number>();
  header.forEach((name, index) => {
    const field = HEADER_ALIASES[name];
    if (field && !indexByField.has(field)) indexByField.set(field, index);
  });
  for (const required of ['text', 'optionA', 'optionB', 'optionC', 'optionD', 'correctOption'] as const) {
    if (!indexByField.has(required)) {
      parseErrors.push(`MISSING_COLUMN:${required}`);
      return { rows: [], parseErrors };
    }
  }
  const rows: ImportRow[] = [];
  table.slice(1).forEach((cells, rowIndex) => {
    const get = (field: keyof ImportRow) => (cells[indexByField.get(field) ?? -1] ?? '').trim();
    rows.push({
      text: get('text'), optionA: get('optionA'), optionB: get('optionB'),
      optionC: get('optionC'), optionD: get('optionD'),
      correctOption: get('correctOption').toUpperCase(),
      explanation: get('explanation'),
      difficulty: get('difficulty') ? get('difficulty').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'Medium',
      tags: get('tags'), year: get('year'), reference: get('reference'),
    });
    void rowIndex;
  });
  return { rows, parseErrors };
}

/** Client-side row validation — blocks obviously-invalid rows before any request. */
function rowProblems(row: ImportRow, index: number): string | null {
  if (!row.text) return `ROW_${index + 1}_TEXT`;
  for (const key of ['optionA', 'optionB', 'optionC', 'optionD'] as const) {
    if (!row[key]) return `ROW_${index + 1}_${key}`;
  }
  if (!['A', 'B', 'C', 'D'].includes(row.correctOption)) return `ROW_${index + 1}_CORRECT`;
  if (!DIFFICULTIES.includes(row.difficulty)) return `ROW_${index + 1}_DIFFICULTY`;
  if (row.year && !/^\d{1,4}$/.test(row.year)) return `ROW_${index + 1}_YEAR`;
  return null;
}

/** Reads file text with a FileReader fallback (File#text is not universal). */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read-error'));
    reader.readAsText(file);
  });
}

const problemLabel = (code: string, isArabic: boolean): string => {
  const match = /^ROW_(\d+)_(.+)$/.exec(code);
  if (!match) return code;
  const [, row, what] = match;
  const labels: Record<string, [string, string]> = {
    TEXT: ['نص السؤال فارغ', 'question text is empty'],
    optionA: ['الخيار A فارغ', 'option A is empty'],
    optionB: ['الخيار B فارغ', 'option B is empty'],
    optionC: ['الخيار C فارغ', 'option C is empty'],
    optionD: ['الخيار D فارغ', 'option D is empty'],
    CORRECT: ['الإجابة الصحيحة يجب أن تكون A أو B أو C أو D', 'correct answer must be A, B, C or D'],
    DIFFICULTY: ['الصعوبة يجب أن تكون Easy أو Medium أو Hard', 'difficulty must be Easy, Medium or Hard'],
    YEAR: ['السنة يجب أن تكون رقمًا', 'year must be a number'],
  };
  const [ar, en] = labels[what] ?? [code, code];
  // PR-3: the row-error template moved to the dictionary (questions.rowError);
  // the message token keeps the legacy per-locale problem text selection.
  return t(localeOf(isArabic), 'questions.rowError', { row, message: isArabic ? ar : en });
};

export function QuestionImportModal({ token, isArabic, subjectId, onClose, onError, onNotice, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const dir = isArabic ? 'rtl' : 'ltr';

  // PR-2 (lint closure): the dictionary literal is memoized per locale — the
  // raw ternary recreated the object every render, so the useMemo at the
  // parseErrorLabels consumer had unstable deps (react-hooks/exhaustive-deps).
  const t = useMemo(() => isArabic
    ? {
        title: 'استيراد أسئلة (CSV)',
        intro: 'ارفع ملف CSV يحتوي أسئلة اختيار من متعدد. الأعمدة المطلوبة: text، optionA…optionD، correctOption. الأعمدة الاختيارية: explanation، difficulty، tags، year، reference. الحد الأقصى 500 سؤال.',
        pick: 'اختيار الملف',
        picked: 'الملف المحدد',
        start: 'بدء الاستيراد',
        cancel: 'إلغاء',
        close: 'إتمام',
        ready: (n: number) => `تم التحقق من ${n} سؤالًا وجاهزية الاستيراد`,
        invalid: 'أخطاء التحقق (صحّح الملف ثم أعد الاختيار):',
        missingColumn: (c: string) => `عمود مطلوب غير موجود: ${c}`,
        empty: 'الملف فارغ أو لا يحتوي أسئلة',
        notCsv: 'اختر ملف CSV (‎.csv)',
        tooMany: (max: number) => `الملف يتجاوز الحد الأقصى (${max} سؤال)`,
        sending: 'جارٍ الاستيراد…',
        resultOk: (n: number) => `تم استيراد ${n} سؤال`,
        resultFail: 'فشل الاستيراد',
        reportTotal: 'الإجمالي',
        reportSuccess: 'أُنشئت',
        reportFailed: 'فشلت',
        reportErrors: 'تفاصيل الأخطاء من الخادم:',
        restart: 'استيراد ملف آخر',
      }
    : {
        title: 'Import questions (CSV)',
        intro: 'Upload a CSV of MCQ questions. Required columns: text, optionA…optionD, correctOption. Optional: explanation, difficulty, tags, year, reference. Max 500 questions.',
        pick: 'Choose file',
        picked: 'Selected file',
        start: 'Start import',
        cancel: 'Cancel',
        close: 'Done',
        ready: (n: number) => `${n} question(s) validated and ready to import`,
        invalid: 'Validation errors (fix the file, then re-choose):',
        missingColumn: (c: string) => `Required column missing: ${c}`,
        empty: 'The file is empty or contains no questions',
        notCsv: 'Choose a CSV (.csv) file',
        tooMany: (max: number) => `The file exceeds the limit (${max} questions)`,
        sending: 'Importing…',
        resultOk: (n: number) => `${n} question(s) imported`,
        resultFail: 'Import failed',
        reportTotal: 'Total',
        reportSuccess: 'Created',
        reportFailed: 'Failed',
        reportErrors: 'Server error details:',
        restart: 'Import another file',
      }, [isArabic]);

  const parseErrorLabels = useMemo(
    () => parseErrors.map((code) => {
      const missing = /^MISSING_COLUMN:(.+)$/.exec(code);
      if (missing) return t.missingColumn(missing[1]);
      if (code === 'EMPTY') return t.empty;
      if (code === 'NOT_CSV') return t.notCsv;
      if (code === 'TOO_MANY') return t.tooMany(MAX_ROWS);
      return code;
    }),
    [parseErrors, t],
  );

  const reset = () => {
    setFile(null);
    setRows(null);
    setParseErrors([]);
    setRowErrors([]);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const pick = (picked: File | null) => {
    setResult(null);
    setRows(null);
    setParseErrors([]);
    setRowErrors([]);
    setFile(picked);
    if (!picked) return;
    if (!/\.csv$/i.test(picked.name)) {
      setParseErrors(['NOT_CSV']);
      return;
    }
    void readFileText(picked).then((text) => {
      const table = parseCsv(text);
      if (table.length === 0) { setParseErrors(['EMPTY']); return; }
      if (table.length - 1 > MAX_ROWS) { setParseErrors(['TOO_MANY']); return; }
      const mapped = mapRows(table);
      if (mapped.parseErrors.length > 0) { setParseErrors(mapped.parseErrors); return; }
      const problems = mapped.rows
        .map((row, index) => rowProblems(row, index))
        .filter((p): p is string => p !== null);
      setRows(mapped.rows);
      setRowErrors(problems);
    }).catch(() => setParseErrors(['EMPTY']));
  };

  const importRows = async () => {
    if (!rows || rowErrors.length > 0 || busy) return;
    setBusy(true);
    try {
      const response = await apiRequest<ImportResult>('/api/v1/questions/import', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId,
          lectureId: null,
          questions: rows.map((row) => ({
            text: row.text,
            optionA: row.optionA,
            optionB: row.optionB,
            optionC: row.optionC,
            optionD: row.optionD,
            correctOption: row.correctOption,
            explanation: row.explanation,
            difficulty: row.difficulty,
            tags: row.tags || null,
            year: row.year ? Number(row.year) : null,
            reference: row.reference || null,
          })),
        }),
      });
      setResult(response);
      if (response.success > 0) {
        onNotice(t.resultOk(response.success));
        await onImported();
      } else {
        onError(t.resultFail);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : t.resultFail);
    } finally {
      setBusy(false);
    }
  };

  const canStart = rows !== null && rowErrors.length === 0 && parseErrors.length === 0 && !busy;

  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next && !busy) onClose(); }}
      title={t.title}
      description={t.intro}
      dir={dir}
      size="lg"
      dismissGuard={busy}
      testId="question-import-modal"
    >
      <div className="px-5 py-4 space-y-4">
        {result === null ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
              aria-label={t.pick}
              data-testid="question-import-file"
              className="block w-full text-xs rounded-lg border p-2.5"
              style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
            />
            {file && rows === null && parseErrors.length === 0 && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                {file.name}
              </div>
            )}
            {rows !== null && rowErrors.length === 0 && parseErrors.length === 0 && (
              <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--cms-success)' }} data-testid="question-import-ready">
                <CheckCircle2 className="w-4 h-4" />
                {t.ready(rows.length)}
              </div>
            )}
            {(parseErrorLabels.length > 0 || rowErrors.length > 0) && (
              <div
                className="rounded-lg border p-3 space-y-1.5"
                style={{ borderColor: 'var(--cms-danger)', background: 'var(--cms-danger-50)' }}
                data-testid="question-import-validation"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--cms-danger)' }}>
                  <XCircle className="w-4 h-4" />
                  {t.invalid}
                </div>
                <ul className="text-[11px] list-disc ps-5 space-y-0.5" style={{ color: 'var(--cms-danger)' }}>
                  {parseErrorLabels.map((label) => <li key={label}>{label}</li>)}
                  {rowErrors.slice(0, 20).map((code) => <li key={code}>{problemLabel(code, isArabic)}</li>)}
                  {rowErrors.length > 20 && <li>… +{rowErrors.length - 20}</li>}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3" data-testid="question-import-result">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--cms-line)' }}>
                <div className="text-lg font-bold" style={{ color: 'var(--cms-text)' }}>{result.total}</div>
                <div className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>{t.reportTotal}</div>
              </div>
              <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--cms-success)', background: 'var(--cms-success-50)' }}>
                <div className="text-lg font-bold" style={{ color: 'var(--cms-success)' }}>{result.success}</div>
                <div className="text-[10px]" style={{ color: 'var(--cms-success)' }}>{t.reportSuccess}</div>
              </div>
              <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--cms-danger)', background: 'var(--cms-danger-50)' }}>
                <div className="text-lg font-bold" style={{ color: 'var(--cms-danger)' }}>{result.failed}</div>
                <div className="text-[10px]" style={{ color: 'var(--cms-danger)' }}>{t.reportFailed}</div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--cms-danger)' }}>
                  <AlertCircle className="w-4 h-4" />
                  {t.reportErrors}
                </div>
                <ul className="text-[11px] list-disc ps-5 max-h-40 overflow-y-auto space-y-0.5" style={{ color: 'var(--cms-text-soft)' }} data-testid="question-import-server-errors">
                  {result.errors.map((error, index) => <li key={index}>{error}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 rounded-b-2xl border-t border-[color:var(--c-border)] bg-[color:var(--c-bg-elevated)] px-5 py-3.5">
        {result === null ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => { if (!busy) onClose(); }} disabled={busy}>
              {t.cancel}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              disabled={!canStart}
              icon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => void importRows()}
              data-testid="question-import-start"
            >
              {t.start}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={reset} icon={<FileUp className="h-3.5 w-3.5" />}>
              {t.restart}
            </Button>
            <Button variant="primary" size="sm" onClick={onClose} data-testid="question-import-done">
              {t.close}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
