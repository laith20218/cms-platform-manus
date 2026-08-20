// CMS Shared Types

export interface User {
  id: string;
  phone: string;
  fullName: string;
  role: 'student' | 'admin' | 'super_admin';
  avatarUrl?: string | null;
  university?: { id: string; nameAr: string };
  college?: { id: string; nameAr: string };
}

export interface Question {
  id: string;
  text: string;
  type: 'mcq' | 'true_false' | 'multiple_select';
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  options: QuestionOption[];
  correctAnswer?: string;
  explanation?: string;
  isFavorite?: boolean;
}

export interface QuestionOption {
  id: string;
  letter: string;
  text: string;
  isCorrect?: boolean;
}

export interface Subject {
  id: string;
  nameAr: string;
  nameEn?: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  totalQuestions: number;
  totalLectures: number;
  userProgress?: {
    questionsAnswered: number;
    accuracy: number;
    completedPercentage: number;
  };
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail: string;
  traceId: string;
  errorCode?: string;
  errors?: Record<string, string[]>;
}
