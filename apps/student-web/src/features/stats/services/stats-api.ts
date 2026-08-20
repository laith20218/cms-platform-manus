import { apiClient } from '@/services/api-client';

export interface StudentStats {
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  currentStreak: number;
  longestStreak: number;
  studyTimeMinutes: number;
  examsCompleted: number;
  favoriteCount: number;
  bySubject: { subjectId: string; subjectName: string; questionsAnswered: number; accuracy: number; completedPercentage: number }[];
  byDifficulty: { easy: { answered: number; accuracy: number }; medium: { answered: number; accuracy: number }; hard: { answered: number; accuracy: number } };
}

export interface Leaderboard {
  topStudents: LeaderboardEntry[];
  yourRank: LeaderboardEntry | null;
}

export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  studentName: string;
  avatarUrl?: string;
  questionsAnswered: number;
  accuracy: number;
  isYou: boolean;
}

export const statsApi = {
  getMyStats: async (period = 'all'): Promise<StudentStats> => {
    const res = await apiClient.get('/stats/me', { params: { period } });
    return res.data;
  },

  getLeaderboard: async (scope = 'all', scopeId?: string, period = 'all', count = 100): Promise<Leaderboard> => {
    const res = await apiClient.get('/stats/leaderboard', { params: { scope, scopeId, period, count } });
    return res.data;
  },

  getGlobalStats: async () => {
    const res = await apiClient.get('/stats/global');
    return res.data;
  },
};
