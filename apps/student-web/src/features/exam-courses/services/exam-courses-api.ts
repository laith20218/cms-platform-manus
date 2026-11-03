import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

/**
 * W14.4 (A.2/A.3) — student storefront for exam-course bundles ("الدورات
 * الامتحانية"). Every request carries the signed entitlement token; the backend
 * applies the W14.4 any-grant ruling ("read" gate) per subject.
 */

export interface ExamCourseListItem {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  /** Calendar year of the round (2000-2100, same convention as Exam.Year). */
  year: number;
  /** 1 = الأولى, 2 = الثانية, 3 = رابعة/صيفي. */
  semester: number;
  courseType: string;
  freeOrPaid: boolean;
  examsCount: number;
  sortOrder: number;
}

export interface ExamCourseExamItem {
  examId: string;
  titleAr: string;
  durationMinutes: number;
  totalQuestions: number;
  sortOrder: number;
  inProgress: boolean;
  completed: boolean;
  attemptCount: number;
  bestScore?: number | null;
}

export interface ExamCourseDetail {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  year: number;
  semester: number;
  courseType: string;
  freeOrPaid: boolean;
  exams: ExamCourseExamItem[];
}

export const SEMESTER_LABELS: Record<number, string> = {
  1: 'الأولى',
  2: 'الثانية',
  3: 'الرابعة',
};

export const COURSE_TYPE_LABELS: Record<string, string> = {
  First: 'دورة أولى',
  Second: 'دورة ثانية',
  Supplementary: 'دورة تكميلية',
  Model: 'دورة نموذجية',
  Practice: 'دورة تدريبية',
};

export const examCoursesApi = {
  /** Published bundles of one subject; year/semester narrow the list server-side (D4). */
  getBySubject: async (subjectId: string, year?: number | null, semester?: number | null): Promise<ExamCourseListItem[]> => {
    const config = await entitlementRequestConfig();
    const res = await apiClient.get(`/exam-courses/subject/${subjectId}`, {
      ...config,
      params: {
        ...(year != null ? { year } : {}),
        ...(semester != null ? { semester } : {}),
      },
    });
    const data = res.data?.items ?? res.data;
    return Array.isArray(data) ? data : [];
  },

  /** Bundle detail with its ordered exams (each row carries the student's attempt state). */
  getCourse: async (courseId: string): Promise<ExamCourseDetail> => {
    const res = await apiClient.get(`/exam-courses/${courseId}`, await entitlementRequestConfig());
    return res.data;
  },
};
