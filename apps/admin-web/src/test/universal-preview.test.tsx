import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * PR-4 — the UNIVERSAL student-view preview renderer.
 *
 * Covers every question type through one coherent implementation:
 *  • MCQ / TrueFalse — radio options, confirm → correct/incorrect banner,
 *    the correct-answer line, the explanation block, reference footer.
 *  • MultipleSelect — checkbox options, exact-set grading (extra = wrong).
 *  • Essay — textarea, typed answer, the result display BENEATH the submitted
 *    answer (student answer → result → expected/model answer → explanation),
 *    exact-string grading mirroring the backend normalization.
 *  • Matching — click prompt → click target pairing, per-pair reveal.
 *  • Badges — Preview mode + publication status + type + difficulty + tags.
 *  • Safety — NO attempt mutation: the renderer never calls the API (there is
 *    no apiRequest import at all) and missing media degrades honestly.
 *  • Both locales — Arabic RTL labels and English.
 */

import { UniversalPreviewDialog } from '../components/preview/UniversalPreviewDialog';
import { QuestionPreviewBody } from '../components/preview/QuestionPreviewBody';
import type { PreviewQuestion } from '../components/preview/previewTypes';

const mcqQuestion: PreviewQuestion = {
  id: 'q1',
  text: 'ما هي أصغر وحدة في الجسم؟',
  type: 'Mcq',
  difficulty: 'Easy',
  status: 'Published',
  tags: ['histology', 'basics'],
  paragraphTag: 'الفصل الأول',
  year: 2025,
  options: [
    { id: 'o1', letter: 'A', text: 'الخلية', isCorrect: true },
    { id: 'o2', letter: 'B', text: 'النسيج', isCorrect: false },
    { id: 'o3', letter: 'C', text: 'العضو', isCorrect: false },
  ],
  images: [{ imageUrl: 'https://example.com/cell.png', altText: 'خلية', sortOrder: 0 }],
  explanation: 'الخلية هي أصغر وحدة تركيبية ووظيفية للجسم.',
  explanationHtml: null,
  reference: 'أساسيات التشريح، ص12',
  correctOptionId: 'o1',
  correctOptionLetter: 'A',
  correctAnswerText: null,
  matching: null,
};

const essayQuestion: PreviewQuestion = {
  id: 'q2',
  text: 'عدد أطباق القلب.',
  type: 'Essay',
  difficulty: 'Medium',
  status: 'Draft',
  tags: [],
  paragraphTag: null,
  year: null,
  options: [],
  images: [],
  explanation: 'للقلب أربعة أطباق.',
  explanationHtml: null,
  reference: null,
  correctOptionId: null,
  correctOptionLetter: null,
  correctAnswerText: 'أربعة أطباق',
  matching: null,
};

const matchingQuestion: PreviewQuestion = {
  id: 'q3',
  text: 'صل كل عضو بوظيفته.',
  type: 'Matching',
  difficulty: 'Hard',
  status: 'Published',
  tags: ['quiz'],
  paragraphTag: null,
  year: null,
  options: [],
  images: [],
  explanation: 'كل عضو مرتبط بوظيفته الفسيولوجية.',
  explanationHtml: null,
  reference: null,
  correctOptionId: null,
  correctOptionLetter: null,
  correctAnswerText: null,
  matching: {
    prompts: [
      { id: 'p1', text: 'القلب', sortOrder: 0 },
      { id: 'p2', text: 'الرئة', sortOrder: 1 },
    ],
    targets: [
      { id: 't1', text: 'ضخ الدم', sortOrder: 0 },
      { id: 't2', text: 'تبادل الغازات', sortOrder: 1 },
    ],
    pairs: [
      { promptId: 'p1', targetId: 't1' },
      { promptId: 'p2', targetId: 't2' },
    ],
    allowMultiMap: false,
    promptNumbering: null,
    targetNumbering: null,
  },
};

describe('PR-4 — UniversalPreviewDialog (badge rail + container)', () => {
  it('renders the preview-mode badge, publication status, type, difficulty and tags', () => {
    render(<UniversalPreviewDialog open onOpenChange={vi.fn()} question={mcqQuestion} isArabic />);
    expect(screen.getByText('وضع المعاينة')).toBeInTheDocument();
    expect(screen.getByTestId('universal-preview-dialog-status').textContent).toContain('منشور');
    expect(screen.getByText('اختيار من متعدد')).toBeInTheDocument();
    expect(screen.getByText('سهل')).toBeInTheDocument();
    expect(screen.getByText('#histology')).toBeInTheDocument();
    expect(screen.getByText('#basics')).toBeInTheDocument();
  });

  it('renders English labels when isArabic is false', () => {
    render(<UniversalPreviewDialog open onOpenChange={vi.fn()} question={essayQuestion} isArabic={false} />);
    expect(screen.getByText('Preview mode')).toBeInTheDocument();
    expect(screen.getByText('Essay')).toBeInTheDocument();
    expect(screen.getByText(/no attempt, grade, notification/)).toBeInTheDocument();
  });

  it('shows the honest no-mutation footer notice', () => {
    render(<UniversalPreviewDialog open onOpenChange={vi.fn()} question={mcqQuestion} isArabic />);
    expect(screen.getByText(/لا يُسجَّل أي دخول أو محاولة أو درجة أو إشعار/)).toBeInTheDocument();
  });
});

describe('PR-4 — QuestionPreviewBody (MCQ)', () => {
  it('renders options as a radiogroup with letters and images', () => {
    render(<QuestionPreviewBody question={mcqQuestion} isArabic />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').length).toBe(3);
    expect(screen.getByText('الخلية')).toBeInTheDocument();
    expect(screen.getByAltText('خلية')).toBeInTheDocument();
  });

  it('confirms a correct selection → banner + correct-answer line + explanation + reference', () => {
    render(<QuestionPreviewBody question={mcqQuestion} isArabic />);
    fireEvent.click(screen.getByTestId('preview-option-o1'));
    fireEvent.click(screen.getByTestId('preview-confirm-q1'));

    expect(screen.getByTestId('preview-feedback-banner-q1').textContent).toContain('إجابة صحيحة');
    expect(screen.getByTestId('preview-correct-answer-q1').textContent).toContain('الخلية');
    expect(screen.getByTestId('preview-explanation-q1').textContent).toContain('أصغر وحدة تركيبية');
    expect(screen.getByTestId('preview-explanation-q1').textContent).toContain('المرجع: أساسيات التشريح، ص12');
  });

  it('confirms a wrong selection → incorrect banner, no answer-line for essays only', () => {
    render(<QuestionPreviewBody question={mcqQuestion} isArabic />);
    fireEvent.click(screen.getByTestId('preview-option-o2'));
    fireEvent.click(screen.getByTestId('preview-confirm-q1'));

    expect(screen.getByTestId('preview-feedback-banner-q1').textContent).toContain('إجابة غير صحيحة');
  });

  it('locks the options after confirm and offers change-answer', () => {
    render(<QuestionPreviewBody question={mcqQuestion} isArabic />);
    fireEvent.click(screen.getByTestId('preview-option-o1'));
    fireEvent.click(screen.getByTestId('preview-confirm-q1'));

    expect(screen.queryByTestId('preview-confirm-q1')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-reset-q1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('preview-reset-q1'));
    expect(screen.getByTestId('preview-confirm-q1')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-feedback-banner-q1')).not.toBeInTheDocument();
  });
});

describe('PR-4 — QuestionPreviewBody (Essay: result beneath the submitted answer)', () => {
  it('types an answer, confirms, and sees student answer → model answer → explanation', () => {
    render(<QuestionPreviewBody question={essayQuestion} isArabic />);
    fireEvent.change(screen.getByTestId('preview-essay-q2'), { target: { value: 'أربعة أطباق' } });
    fireEvent.click(screen.getByTestId('preview-confirm-q2'));

    // The student answer is displayed beneath the submitted written answer.
    expect(screen.getByTestId('preview-your-answer-q2').textContent).toContain('أربعة أطباق');
    // The expected/model answer per the existing contract.
    expect(screen.getByText(/الإجابة النموذجية: أربعة أطباق/)).toBeInTheDocument();
    // The explanation.
    expect(screen.getByTestId('preview-explanation-q2').textContent).toContain('للقلب أربعة أطباق');
    // Correct (exact-string) result.
    expect(screen.getByTestId('preview-feedback-banner-q2').textContent).toContain('إجابة صحيحة');
  });

  it('grades exactly like production: whitespace/case normalization, no semantics', () => {
    render(<QuestionPreviewBody question={essayQuestion} isArabic />);
    fireEvent.change(screen.getByTestId('preview-essay-q2'), { target: { value: '  أربعة     أطباق  ' } });
    fireEvent.click(screen.getByTestId('preview-confirm-q2'));
    expect(screen.getByTestId('preview-feedback-banner-q2').textContent).toContain('إجابة صحيحة');
  });

  it('a semantically-close but different answer stays incorrect', () => {
    render(<QuestionPreviewBody question={essayQuestion} isArabic />);
    fireEvent.change(screen.getByTestId('preview-essay-q2'), { target: { value: 'أربعة حجرات تقريباً' } });
    fireEvent.click(screen.getByTestId('preview-confirm-q2'));
    expect(screen.getByTestId('preview-feedback-banner-q2').textContent).toContain('إجابة غير صحيحة');
  });
});

describe('PR-4 — QuestionPreviewBody (Matching board)', () => {
  it('pairs by click-click, confirms, and reveals per-pair correctness', () => {
    render(<QuestionPreviewBody question={matchingQuestion} isArabic />);
    expect(screen.getByTestId('preview-matching-q3')).toBeInTheDocument();

    // Click prompt p1, then its correct target t1.
    fireEvent.click(screen.getByTestId('preview-matching-prompt-p1'));
    fireEvent.click(screen.getByTestId('preview-matching-target-t1'));
    // Stealing: p2 takes t1 → p1 loses its pair (single-map bijection).
    fireEvent.click(screen.getByTestId('preview-matching-prompt-p2'));
    fireEvent.click(screen.getByTestId('preview-matching-target-t1'));
    // Confirm stays disabled while a prompt is unpaired.
    expect((screen.getByTestId('preview-confirm-q3') as HTMLButtonElement).disabled).toBe(true);
    // Re-pair p1 with the remaining (wrong) target t2.
    fireEvent.click(screen.getByTestId('preview-matching-prompt-p1'));
    fireEvent.click(screen.getByTestId('preview-matching-target-t2'));

    fireEvent.click(screen.getByTestId('preview-confirm-q3'));

    expect(screen.getByTestId('preview-feedback-banner-q3').textContent).toContain('إجابة غير صحيحة');
    // Per-pair reveal: each wrong pair discloses its correct target.
    expect(screen.getByTestId('preview-matching-pair-p1').textContent).toContain('ضخ الدم');
    expect(screen.getByTestId('preview-matching-pair-p2').textContent).toContain('تبادل الغازات');
  });

  it('refuses to confirm before every prompt is paired', () => {
    render(<QuestionPreviewBody question={matchingQuestion} isArabic />);
    fireEvent.click(screen.getByTestId('preview-matching-prompt-p1'));
    fireEvent.click(screen.getByTestId('preview-matching-target-t1'));

    expect((screen.getByTestId('preview-confirm-q3') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('PR-4 — QuestionPreviewBody (MultipleSelect + safety)', () => {
  const multiQuestion: PreviewQuestion = {
    ...mcqQuestion,
    id: 'q4',
    type: 'MultipleSelect',
    correctOptionId: 'o1',
    options: [
      { id: 'o1', letter: 'A', text: 'أ', isCorrect: true },
      { id: 'o2', letter: 'B', text: 'ب', isCorrect: true },
      { id: 'o3', letter: 'C', text: 'ج', isCorrect: false },
    ],
  };

  it('grades exact-set: both correct options → correct; extra option → incorrect', () => {
    const { unmount } = render(<QuestionPreviewBody question={multiQuestion} isArabic />);
    fireEvent.click(screen.getByTestId('preview-option-o1'));
    fireEvent.click(screen.getByTestId('preview-option-o2'));
    fireEvent.click(screen.getByTestId('preview-confirm-q4'));
    expect(screen.getByTestId('preview-feedback-banner-q4').textContent).toContain('إجابة صحيحة');
    unmount();

    render(<QuestionPreviewBody question={multiQuestion} isArabic />);
    fireEvent.click(screen.getByTestId('preview-option-o1'));
    fireEvent.click(screen.getByTestId('preview-option-o2'));
    fireEvent.click(screen.getByTestId('preview-option-o3'));
    fireEvent.click(screen.getByTestId('preview-confirm-q4'));
    expect(screen.getByTestId('preview-feedback-banner-q4').textContent).toContain('إجابة غير صحيحة');
  });

  it('degrades missing images honestly instead of a broken glyph', () => {
    render(<QuestionPreviewBody question={mcqQuestion} isArabic />);
    fireEvent(screen.getByAltText('خلية'), new Event('error'));
    expect(screen.getByTestId('preview-image-0-missing')).toBeInTheDocument();
    expect(screen.getByText(/تعذر تحميل الصورة/)).toBeInTheDocument();
  });

  it('renders an honest unavailable state when a choice question has no options', () => {
    const bare: PreviewQuestion = { ...mcqQuestion, options: [] };
    render(<QuestionPreviewBody question={bare} isArabic />);
    expect(screen.getByTestId('preview-options-unavailable')).toBeInTheDocument();
    expect(screen.getByText('خيارات هذا السؤال غير متوفرة.')).toBeInTheDocument();
  });
});

describe('PR-4 — preview grading helpers mirror the backend contract', () => {
  it('normalizePreviewAnswer mirrors NormalizeAnswer (trim/collapse/uppercase)', async () => {
    const { normalizePreviewAnswer, gradeEssay, gradeMultiChoice, gradeSingleChoice, gradeMatching } = await import('../components/preview/previewTypes');
    expect(normalizePreviewAnswer('  هِيستولوجي   Tissue ')).toBe('هِيستولوجي TISSUE');
    expect(gradeEssay('  four   Chambers ', 'Four chambers')).toBe(true);
    expect(gradeEssay('five chambers', 'four chambers')).toBe(false);
    expect(gradeMultiChoice(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(gradeMultiChoice(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
    expect(gradeSingleChoice('x', 'x')).toBe(true);
    expect(gradeSingleChoice('x', 'y')).toBe(false);
    expect(gradeMatching({ p1: 't1', p2: 't2' }, matchingQuestion.matching!)).toBe(true);
    expect(gradeMatching({ p1: 't2', p2: 't1' }, matchingQuestion.matching!)).toBe(false);
  });

  it('the preview module makes no API imports (pure local simulation)', async () => {
    // Static guarantee: the renderer tree cannot mutate student data because it
    // never touches the API client.
    const moduleSource = (await import('../components/preview/QuestionPreviewBody?raw')).default as string;
    expect(moduleSource).not.toContain("from '../../lib/api'");
    expect(moduleSource).not.toContain('apiRequest');
    expect(moduleSource).not.toContain('/answer');
  });
});
