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
  completedLectures: number;
  readFiles: number;
  bySubject: { subjectId: string; subjectName: string; questionsAnswered: number; accuracy: number; completedPercentage: number }[];
  byDifficulty: { easy: { answered: number; accuracy: number }; medium: { answered: number; accuracy: number }; hard: { answered: number; accuracy: number } };
}

export interface Leaderboard {
  topStudents: LeaderboardEntry[];
  yourRank: LeaderboardEntry | null;
}

export interface LeaderboardEntry {
  rank: number;
  studentName: string;
  avatarUrl: string | null;
  questionsAnswered: number;
  accuracy: number;
  isYou: boolean;
}

/** GET/PUT /profile/leaderboard-sharing — mutual-sharing consent (W15.4.4.0a backend). */
export interface LeaderboardSharingDto {
  sharesLeaderboard: boolean;
}

export async function getLeaderboardSharing(): Promise<LeaderboardSharingDto> {
  const { data } = await apiClient.get('/profile/leaderboard-sharing');
  return data;
}

export async function setLeaderboardSharing(shares: boolean): Promise<LeaderboardSharingDto> {
  const { data } = await apiClient.put('/profile/leaderboard-sharing', {
    sharesLeaderboard: shares,
  });
  return data;
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
