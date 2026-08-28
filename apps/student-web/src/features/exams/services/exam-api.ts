import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

export interface ExamOption { id: string; letter: string; text: string; textHtml?: string | null; imageUrl?: string | null }
export interface ExamImage { id: string; imageUrl: string; altText?: string | null; caption?: string | null; sortOrder: number }
export interface ExamQuestion {
  id: string;
  sourceQuestionId: string;
  number: number;
  type: 'Mcq' | 'TrueFalse' | 'MultipleSelect' | string;
  text: string;
  textHtml?: string | null;
  options: ExamOption[];
  images: ExamImage[];
  savedAnswer?: string | null;
}
export interface ExamSession {
  sessionId: string;
  examId: string;
  examTitle: string;
  status: 'InProgress' | 'Completed' | 'TimedOut' | 'Cancelled' | string;
  totalQuestions: number;
  durationMinutes: number;
  startedAt: string;
  expiresAt: string;
  currentQuestionOrder: number;
  questions: ExamQuestion[];
}
export interface ExamResult {
  sessionId: string;
  status: string;
  isResultVisible: boolean;
  score?: number | null;
  passed?: boolean | null;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  unansweredQuestions: number;
  durationSeconds: number;
  canReview: boolean;
  weakestTopics: { tag: string; accuracy: number }[];
  comparison?: { yourScore: number; averageScore: number; topScore: number } | null;
}
export interface ExamReviewOption { id: string; letter: string; text: string; isCorrect: boolean; isUserAnswer: boolean }
export interface ExamReviewQuestion { id: string; sourceQuestionId: string; number: number; type: string; text: string; options: ExamReviewOption[]; userAnswer?: string | null; correctAnswer?: string | null; isCorrect?: boolean | null; explanation?: string | null }
export interface ExamReview { sessionId: string; showCorrectAnswers: boolean; showExplanations: boolean; questions: ExamReviewQuestion[] }

function idempotencyKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const examApi = {
  getBySubject: async (subjectId: string) => {
    const res = await apiClient.get(`/exams/by-subject/${subjectId}`, await entitlementRequestConfig());
    return res.data;
  },
  getById: async (id: string) => {
    const res = await apiClient.get(`/exams/${id}`, await entitlementRequestConfig());
    return res.data;
  },
  start: async (examId: string) => {
    const config = await entitlementRequestConfig();
    const key = idempotencyKey();
    const res = await apiClient.post(`/exams/${examId}/start`, { mode: 'test', idempotencyKey: key }, {
      ...config,
      headers: { ...config.headers, 'Idempotency-Key': key },
    });
    return res.data as ExamSession;
  },
  getSession: async (sessionId: string) => {
    const res = await apiClient.get(`/exams/sessions/${sessionId}`, await entitlementRequestConfig());
    return res.data as ExamSession;
  },
  saveAnswer: async (sessionId: string, questionId: string, answer: string | null, currentQuestionOrder: number, clearAnswer = false) => {
    const res = await apiClient.put(`/exams/sessions/${sessionId}/questions/${questionId}/answer`, { questionId, answer, currentQuestionOrder, clearAnswer }, await entitlementRequestConfig());
    return res.data as { sessionId: string; questionId: string; savedAnswer?: string | null; answeredQuestions: number; currentQuestionOrder: number; expiresAt: string; status: string };
  },
  saveProgress: async (sessionId: string, questionId: string, currentQuestionOrder: number) => examApi.saveAnswer(sessionId, questionId, null, currentQuestionOrder),
  submit: async (sessionId: string) => {
    const res = await apiClient.post(`/exams/sessions/${sessionId}/submit`, {}, await entitlementRequestConfig());
    return res.data as ExamResult;
  },
  cancel: async (sessionId: string) => {
    await apiClient.post(`/exams/sessions/${sessionId}/cancel`, {}, await entitlementRequestConfig());
  },
  getResults: async (sessionId: string) => {
    const res = await apiClient.get(`/exams/sessions/${sessionId}/results`, await entitlementRequestConfig());
    return res.data as ExamResult;
  },
  getReview: async (sessionId: string) => {
    const res = await apiClient.get<ExamReview>(`/exams/sessions/${sessionId}/review`, await entitlementRequestConfig());
    return res.data;
  },
};
