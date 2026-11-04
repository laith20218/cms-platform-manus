/** Push 11.3 — favorites feature types. Mirrors the backend DTOs
 *  (CMS.Application/DTOs/Favorites/FavoriteDtos.cs) exactly; the only addition is
 *  totalPages on the page envelope (reused PagedResult<T> carries it). */

export type FavoriteTargetType = 'question' | 'file' | 'episode';
export type FavoriteSort = 'recent' | 'oldest' | 'alpha';

export interface FavoriteProgress {
  lastPositionSeconds: number;
  /** Null while the server doesn't know the asset duration — the progress bar hides then. */
  durationSeconds: number | null;
  completionPercent: number | null;
}

export interface FavoriteItem {
  id: string;
  targetType: FavoriteTargetType;
  targetId: string;
  /** Every target's subject (context labels / future deep links). */
  subjectId: string;
  /** Episodes only — the course the continue/open action navigates to. */
  courseId: string | null;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  fileType: string | null;
  durationSeconds: number | null;
  processingStatus: string | null;
  createdAt: string;
  progress: FavoriteProgress | null;
}

export interface PagedFavorites {
  items: FavoriteItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface FavoriteListParams {
  type?: FavoriteTargetType;
  sort: FavoriteSort;
  page: number;
  pageSize: number;
}

// ===== W15.0 — custom favorites lists (named question collections) =====
// Mirrors CMS.Application/DTOs/Favorites/FavoriteListDtos.cs exactly.

export interface FavoriteListSummary {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  questionsCount: number;
  /** Only set when the query carried a questionId (the QuestionPage picker) —
   *  resolved server-side in the same round-trip, no N+1 per-list fetches. */
  containsQuestion: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFavoriteListPayload {
  name: string;
  description?: string | null;
  color?: string | null;
}

/** Partial update — null/omitted fields stay unchanged server-side. */
export interface UpdateFavoriteListPayload {
  name?: string | null;
  description?: string | null;
  color?: string | null;
}

export interface FavoriteListQuestionsParams {
  listId: string;
  search?: string;
  page: number;
  pageSize: number;
}
