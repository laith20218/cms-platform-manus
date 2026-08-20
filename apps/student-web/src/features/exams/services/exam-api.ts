import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

export interface ExamReviewOption {
  id: string;
  letter: string;
  text: string;
  isCorrect: boolean;
  isUserAnswer: boolean;
}

export interface ExamReviewQuestion {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation?: string | null;
  options: ExamReviewOption[];
}

export interface ExamReview {
  sessionId: string;
  questions: ExamReviewQuestion[];
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

  start: async (examId: string, mode: string = 'test') => {
    const res = await apiClient.post(`/exams/${examId}/start`, { mode }, await entitlementRequestConfig());
    return res.data;
  },

  submit: async (sessionId: string, answers: { questionId: string; selectedOptionId: string; durationSeconds: number }[]) => {
    const res = await apiClient.post(`/exams/sessions/${sessionId}/submit`, { answers }, await entitlementRequestConfig());
    return res.data;
  },

  getResults: async (sessionId: string) => {
    const res = await apiClient.get(`/exams/sessions/${sessionId}/results`, await entitlementRequestConfig());
    return res.data;
  },

  getReview: async (sessionId: string) => {
    const res = await apiClient.get<ExamReview>(`/exams/sessions/${sessionId}/review`, await entitlementRequestConfig());
    return res.data;
  },
};
