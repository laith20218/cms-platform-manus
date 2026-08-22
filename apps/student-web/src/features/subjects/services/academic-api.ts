import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

export interface AcademicPage<T> {
  items: T[];
}

export interface UniversitySummary {
  id: string;
  nameAr: string;
  collegesCount: number;
}

export interface CollegeSummary {
  id: string;
  nameAr: string;
  yearsCount: number;
}

export interface AcademicYearSummary {
  id: string;
  nameAr: string;
  semestersCount: number;
}

export interface SemesterSummary {
  id: string;
  nameAr: string;
  subjectsCount: number;
}

export interface SubjectSummary {
  id: string;
  slug: string;
  nameAr: string;
  color?: string | null;
  totalQuestions: number;
  totalLectures: number;
  totalFiles: number;
  lastContentUpdatedAt?: string | null;
  userProgress?: { completedPercentage: number } | null;
}

export interface SubjectDetail extends SubjectSummary {
  description?: string | null;
  totalExams: number;
}

export interface LectureSummary {
  id: string;
  lectureNumber: number;
  titleAr: string;
  questionsCount: number;
  durationMinutes?: number | null;
  description?: string | null;
  instructorName?: string | null;
  sourceReference?: string | null;
  userProgress?: number;
  isCompleted: boolean;
  completedAt?: string | null;
}

export const academicApi = {
  getUniversities: async (page = 1, pageSize = 50) => {
    const res = await apiClient.get<AcademicPage<UniversitySummary>>('/universities', { params: { page, pageSize } });
    return res.data;
  },
  getColleges: async (universityId: string) => {
    const res = await apiClient.get<CollegeSummary[]>(`/universities/${universityId}/colleges`);
    return res.data;
  },
  getYears: async (collegeId: string) => {
    const res = await apiClient.get<AcademicYearSummary[]>(`/colleges/${collegeId}/years`);
    return res.data;
  },
  getSemesters: async (yearId: string) => {
    const res = await apiClient.get<SemesterSummary[]>(`/years/${yearId}/semesters`);
    return res.data;
  },
  getSubjects: async (semesterId: string) => {
    const res = await apiClient.get<SubjectSummary[]>(`/semesters/${semesterId}/subjects`);
    return res.data;
  },
  getSubjectBySlug: async (slug: string) => {
    const res = await apiClient.get<SubjectDetail>(`/subjects/${slug}`, await entitlementRequestConfig());
    return res.data;
  },
  getLectures: async (subjectId: string) => {
    const res = await apiClient.get<LectureSummary[]>(`/subjects/${subjectId}/lectures`, await entitlementRequestConfig());
    return res.data;
  },
  getLecture: async (lectureId: string) => {
    const res = await apiClient.get<LectureSummary>(`/lectures/${lectureId}`, await entitlementRequestConfig());
    return res.data;
  },
  completeLecture: async (lectureId: string) => {
    await apiClient.post(`/lectures/${lectureId}/complete`, undefined, await entitlementRequestConfig());
  },
};
