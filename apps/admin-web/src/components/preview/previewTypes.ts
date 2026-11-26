/**
 * PR-4 — Universal Preview data contract.
 *
 * The ONE preview view-model for the admin web. Every surface that previews a
 * question (question bank row preview, exam preview, future course/content
 * previews) normalizes its DTO into `PreviewQuestion` and renders it through
 * `QuestionPreviewBody` — one coherent student-view simulation instead of the
 * four competing hand-rolled modals that preceded it.
 *
 * The shape deliberately mirrors the student web's `QuestionRowData` contract
 * (options with letters + images, essay textarea, وصل board) so the admin
 * preview shows "the same essential rendering as Student Web" while labels
 * ride the admin dictionary (Arabic + English).
 */

export interface PreviewOption {
  id: string;
  letter: string;
  text: string;
  imageUrl?: string | null;
  /** Authoring-side flag (admin preview DTOs only) — never sent to students. */
  isCorrect?: boolean;
}

export interface PreviewImage {
  imageUrl: string;
  altText?: string | null;
  sortOrder: number;
}

export interface PreviewMatchingItem {
  id: string;
  text: string;
  sortOrder?: number;
}

export interface PreviewMatchingPair {
  promptId: string;
  targetId: string;
}

export interface PreviewMatching {
  prompts: PreviewMatchingItem[];
  targets: PreviewMatchingItem[];
  pairs: PreviewMatchingPair[];
  allowMultiMap?: boolean;
  promptNumbering?: string | null;
  targetNumbering?: string | null;
}

export interface PreviewQuestion {
  id: string;
  /** 1-based position when previewed inside an ordered list (exam preview). */
  number?: number | null;
  text: string;
  /** 'Mcq' | 'TrueFalse' | 'MultipleSelect' | 'Essay' | 'Matching' (case-insensitive lookups). */
  type: string;
  difficulty?: string | null;
  status?: string | null;
  tags?: string[];
  paragraphTag?: string | null;
  year?: number | null;
  options: PreviewOption[];
  images: PreviewImage[];
  explanation?: string | null;
  explanationHtml?: string | null;
  reference?: string | null;
  /** Choice types: the correct option id (admin preview superset). */
  correctOptionId?: string | null;
  correctOptionLetter?: string | null;
  /** Essay: the model answer (admin preview superset). */
  correctAnswerText?: string | null;
  /** Matching: the full payload including the correct pairs (admin superset). */
  matching?: PreviewMatching | null;
}

const isPreviewMatching = (value: unknown): value is PreviewMatching => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PreviewMatching>;
  return Array.isArray(candidate.prompts) && Array.isArray(candidate.targets);
};

/**
 * Normalizes the PR-4 admin question preview DTO
 * (`GET /api/v1/admin/questions/{id}/preview` — the superset).
 */
export function fromQuestionPreviewDto(dto: {
  id: string;
  text: string;
  type: string;
  difficulty: string;
  status?: string;
  tags?: string[];
  paragraphTag?: string | null;
  year?: number | null;
  options: { id: string; letter: string; text: string; imageUrl?: string | null; isCorrect?: boolean }[];
  images: { imageUrl: string; altText?: string | null; sortOrder: number }[];
  explanation?: string | null;
  explanationHtml?: string | null;
  reference?: string | null;
  correctOptionId?: string | null;
  correctOptionLetter?: string | null;
  correctAnswerText?: string | null;
  matching?: unknown;
}): PreviewQuestion {
  return {
    id: dto.id,
    text: dto.text,
    type: dto.type,
    difficulty: dto.difficulty,
    status: dto.status ?? null,
    tags: dto.tags ?? [],
    paragraphTag: dto.paragraphTag ?? null,
    year: dto.year ?? null,
    options: dto.options.map(option => ({
      id: option.id,
      letter: option.letter,
      text: option.text,
      imageUrl: option.imageUrl ?? null,
      isCorrect: option.isCorrect,
    })),
    images: dto.images.map(image => ({
      imageUrl: image.imageUrl,
      altText: image.altText ?? null,
      sortOrder: image.sortOrder ?? 0,
    })),
    explanation: dto.explanation ?? null,
    explanationHtml: dto.explanationHtml ?? null,
    reference: dto.reference ?? null,
    correctOptionId: dto.correctOptionId ?? null,
    correctOptionLetter: dto.correctOptionLetter ?? null,
    correctAnswerText: dto.correctAnswerText ?? null,
    matching: isPreviewMatching(dto.matching) ? dto.matching : null,
  };
}

/**
 * Normalizes an exam-preview question row (`GET /api/v1/admin/exams/{id}/preview`)
 * into the same view-model so the exam preview rides the universal renderer.
 */
export function fromExamPreviewQuestionDto(question: {
  questionId: string;
  sortOrder: number;
  text: string;
  type: string;
  difficulty: string;
  options: { id: string; letter: string; text: string; imageUrl?: string | null; isCorrect?: boolean }[];
  images: { imageUrl: string; altText?: string | null; sortOrder: number }[];
  paragraphTag?: string | null;
  explanation?: string | null;
  explanationHtml?: string | null;
  reference?: string | null;
  correctOptionId?: string | null;
  correctOptionLetter?: string | null;
  correctAnswerText?: string | null;
  status?: string | null;
  matching?: unknown;
}): PreviewQuestion {
  return {
    id: question.questionId,
    number: question.sortOrder,
    text: question.text,
    type: question.type,
    difficulty: question.difficulty,
    status: question.status ?? null,
    tags: [],
    paragraphTag: question.paragraphTag ?? null,
    year: null,
    options: question.options.map(option => ({
      id: option.id,
      letter: option.letter,
      text: option.text,
      imageUrl: option.imageUrl ?? null,
      isCorrect: option.isCorrect,
    })),
    images: question.images.map(image => ({
      imageUrl: image.imageUrl,
      altText: image.altText ?? null,
      sortOrder: image.sortOrder ?? 0,
    })),
    explanation: question.explanation ?? null,
    explanationHtml: question.explanationHtml ?? null,
    reference: question.reference ?? null,
    correctOptionId: question.correctOptionId ?? null,
    correctOptionLetter: question.correctOptionLetter ?? null,
    correctAnswerText: question.correctAnswerText ?? null,
    matching: isPreviewMatching(question.matching) ? question.matching : null,
  };
}

/**
 * Mirrors the BACKEND editorial-answer normalization (QuestionHandlers.NormalizeAnswer):
 * trim, collapse internal whitespace, then case-fold (ToUpperInvariant on the server —
 * a no-op for Arabic, ASCII-equivalent to JS toUpperCase for Latin).
 * Exact-string matching only — no AI, no semantic grading (owner decision #10).
 */
export function normalizePreviewAnswer(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).join(' ').toUpperCase();
}

/** Mirrors the backend MCQ/TrueFalse single-choice grading (exact option id). */
export function gradeSingleChoice(selectedId: string | undefined, correctOptionId: string | null | undefined): boolean {
  return Boolean(selectedId) && Boolean(correctOptionId) && selectedId === correctOptionId;
}

/** Mirrors the backend MultipleSelect grading (exact set equality, no extras/missing). */
export function gradeMultiChoice(selectedIds: string[], correctIds: string[]): boolean {
  if (selectedIds.length === 0 || correctIds.length === 0) return false;
  const selected = new Set(selectedIds);
  const correct = new Set(correctIds);
  if (selected.size !== correct.size) return false;
  for (const id of correct) if (!selected.has(id)) return false;
  return true;
}

/** Mirrors the backend Essay grading (normalized exact-string match). */
export function gradeEssay(answer: string, modelAnswer: string | null | undefined): boolean {
  if (!modelAnswer) return false;
  return normalizePreviewAnswer(answer) === normalizePreviewAnswer(modelAnswer);
}

/** Mirrors the backend Matching grading (all-or-nothing bijection). */
export function gradeMatching(pairs: Record<string, string>, matching: PreviewMatching): boolean {
  if (matching.prompts.length === 0) return false;
  const correct = new Map(matching.pairs.map(pair => [pair.promptId, pair.targetId]));
  return matching.prompts.every(prompt => correct.get(prompt.id) === pairs[prompt.id]);
}
