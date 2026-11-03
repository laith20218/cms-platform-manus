import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

/**
 * W14.4 (A.4/B.1) — DB-backed practice (D13) over the W14.2 /practice endpoints,
 * now consumed by the student web for the first time: exam-model practice runs AND
 * the categorized (lecture → paragraph-tag) lens. The filter is echoed on every
 * answer/progress call and re-verified server-side.
 */

export interface PracticeOption {
  id: string;
  letter: string;
  text: string;
  imageUrl?: string | null;
}

export interface PracticeImage {
  id: string;
  imageUrl: string;
  altText?: string | null;
  caption?: string | null;
}

export interface PracticeQuestion {
  id: string;
  number: number;
  text: string;
  textHtml?: string | null;
  type: string;
  difficulty: string;
  paragraphTag?: string | null;
  lectureTitle?: string | null;
  options: PracticeOption[];
  images: PracticeImage[];
}

/** The (lecture, paragraphTag) lens — `untagged*` selects the "غير مصنف" bucket. */
export interface PracticeCategoryFilter {
  lectureId?: string | null;
  untaggedLecture?: boolean;
  paragraphTag?: string | null;
  untaggedTag?: boolean;
}

function filterToParams(filter?: PracticeCategoryFilter): Record<string, string | boolean> {
  if (!filter) return {};
  const params: Record<string, string | boolean> = {};
  if (filter.lectureId) params.lectureId = filter.lectureId;
  if (filter.untaggedLecture) params.untaggedLecture = true;
  if (filter.paragraphTag) params.paragraphTag = filter.paragraphTag;
  if (filter.untaggedTag) params.untaggedTag = true;
  return params;
}

function hasFilter(filter?: PracticeCategoryFilter): boolean {
  if (!filter) return false;
  return Boolean(filter.lectureId || filter.untaggedLecture || filter.paragraphTag || filter.untaggedTag);
}

export interface StartExamModelResult {
  sessionId: string;
  examModelId: string;
  created: boolean;
  status: string;
  startedAt: string;
  lastAccessedAt: string;
  score?: number | null;
  totalQuestions: number;
  questions?: PracticeQuestion[] | null;
}

export interface StartCategorizedResult {
  sessionId: string;
  anchorExamModelId: string;
  created: boolean;
  status: string;
  startedAt: string;
  lastAccessedAt: string;
  score?: number | null;
  totalQuestions: number;
  questions: PracticeQuestion[];
}

export interface SubmitAnswerResult {
  sessionId: string;
  questionId: string;
  isCorrect?: boolean | null;
  answeredCount: number;
  totalQuestions: number;
  score?: number | null;
  status: string;
  correctOptionIds?: string[] | null;
  correctAnswerText?: string | null;
  explanation?: string | null;
  explanationHtml?: string | null;
  reference?: string | null;
}

export interface PracticeProgress {
  sessionId: string;
  examModelId: string;
  status: string;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  ungradedCount: number;
  completionPercent: number;
  score?: number | null;
  startedAt: string;
  lastAccessedAt: string;
}

export interface CategorizedGroup {
  paragraphTag?: string | null;
  questionsCount: number;
}

export interface CategorizedLecture {
  lectureId?: string | null;
  lectureTitle: string;
  lectureNumber?: number | null;
  questionsCount: number;
  groups: CategorizedGroup[];
}

export interface CategorizedTree {
  subjectId: string;
  subjectName: string;
  totalQuestions: number;
  uncategorizedCount: number;
  anchorExamModelId?: string | null;
  lectures: CategorizedLecture[];
}

export const practiceApi = {
  /** The subject's practice-eligible questions grouped Lecture → ParagraphTag. */
  getCategorizedTree: async (subjectId: string): Promise<CategorizedTree> => {
    const res = await apiClient.get(`/practice/categorized/${subjectId}`, await entitlementRequestConfig());
    return res.data;
  },

  /** Idempotent start/resume of an exam-model practice run (composition set). */
  startExamModel: async (examModelId: string): Promise<StartExamModelResult> => {
    const res = await apiClient.post(`/practice/${examModelId}/start`, undefined, await entitlementRequestConfig());
    return res.data;
  },

  /** Starts (or resumes) a practice run over the filtered question set. */
  startCategorized: async (subjectId: string, filter?: PracticeCategoryFilter): Promise<StartCategorizedResult> => {
    const res = await apiClient.post(
      `/practice/categorized/${subjectId}/start`,
      {
        lectureId: filter?.lectureId ?? null,
        untaggedLecture: filter?.untaggedLecture ?? false,
        paragraphTag: filter?.paragraphTag ?? null,
        untaggedTag: filter?.untaggedTag ?? false,
      },
      await entitlementRequestConfig()
    );
    return res.data;
  },

  /** One answer with immediate feedback (correctness disclosed only post-answer). */
  submitAnswer: async (
    sessionId: string,
    questionId: string,
    selectedAnswer: string,
    filter?: PracticeCategoryFilter
  ): Promise<SubmitAnswerResult> => {
    const res = await apiClient.put(
      `/practice/${sessionId}/answer`,
      {
        questionId,
        selectedAnswer,
        lectureId: filter?.lectureId ?? null,
        untaggedLecture: filter?.untaggedLecture ?? false,
        paragraphTag: filter?.paragraphTag ?? null,
        untaggedTag: filter?.untaggedTag ?? false,
      },
      await entitlementRequestConfig()
    );
    return res.data;
  },

  /** Withdraws one answer (D13 reset story — the question returns to unanswered). */
  resetQuestion: async (sessionId: string, questionId: string): Promise<void> => {
    await apiClient.post(`/practice/${sessionId}/reset-question/${questionId}`, undefined, await entitlementRequestConfig());
  },

  /** Wipes every answer of the session; the session reopens InProgress. */
  resetAll: async (sessionId: string): Promise<void> => {
    await apiClient.post(`/practice/${sessionId}/reset`, undefined, await entitlementRequestConfig());
  },

  /** Progress; with a filter the totals are scoped to the filtered set. */
  getProgress: async (sessionId: string, filter?: PracticeCategoryFilter): Promise<PracticeProgress> => {
    const config = await entitlementRequestConfig();
    const res = await apiClient.get(`/practice/${sessionId}/progress`, {
      ...config,
      params: hasFilter(filter) ? filterToParams(filter) : {},
    });
    return res.data;
  },
};
