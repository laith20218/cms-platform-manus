import { apiClient } from '@/services/api-client';

export interface DashboardStats {
  totalStudents: number;
  activeStudentsToday: number;
  totalQuestions: number;
  totalActiveCodes: number;
  totalActiveSubscriptions: number;
  totalLibraryFiles: number;
  totalExams: number;
  pendingReports: number;
  monthlyRevenue: number;
  revenueChangePercent: number;
}

export interface RecentActivity {
  id: string;
  type: string;
  description: string;
  actorName?: string;
  createdAt: string;
}

export interface RevenueData {
  period: string;
  revenue: number;
  codesSold: number;
  newSubscriptions: number;
}

export interface StudentGrowth {
  date: string;
  newRegistrations: number;
  activeUsers: number;
}

export interface TopSubject {
  subjectId: string;
  subjectName: string;
  questionsAnswered: number;
  averageAccuracy: number;
  activeStudents: number;
}

export interface ReportsSummary {
  totalReports: number;
  pendingReports: number;
  resolvedReports: number;
  rejectedReports: number;
  recentReports: { questionId: string; questionText: string; reportsCount: number; mostCommonReason: string; lastReportedAt: string }[];
}

export const adminApi = {
  getStats: async (): Promise<DashboardStats> => {
    const res = await apiClient.get('/admin/dashboard');
    return res.data;
  },
  getRecentActivity: async (count = 10): Promise<RecentActivity[]> => {
    const res = await apiClient.get('/admin/recent-activity', { params: { count } });
    return res.data;
  },
  getRevenue: async (months = 6): Promise<RevenueData[]> => {
    const res = await apiClient.get('/admin/revenue', { params: { months } });
    return res.data;
  },
  getStudentGrowth: async (days = 30): Promise<StudentGrowth[]> => {
    const res = await apiClient.get('/admin/student-growth', { params: { days } });
    return res.data;
  },
  getTopSubjects: async (count = 5): Promise<TopSubject[]> => {
    const res = await apiClient.get('/admin/top-subjects', { params: { count } });
    return res.data;
  },
  getReportsSummary: async (): Promise<ReportsSummary> => {
    const res = await apiClient.get('/admin/reports/summary');
    return res.data;
  },
  banStudent: async (studentId: string, reason: string, banUntil?: string) => {
    await apiClient.post(`/admin/students/${studentId}/ban`, { reason, banUntil });
  },
  unbanStudent: async (studentId: string) => {
    await apiClient.post(`/admin/students/${studentId}/unban`);
  },
  generateCodes: async (data: { scopeType: string; scopeId?: string; durationDays: number; quantity: number; prefix?: string }) => {
    const res = await apiClient.post('/admin/codes/generate', data);
    return res.data;
  },
};
