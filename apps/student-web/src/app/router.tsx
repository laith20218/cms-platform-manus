import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from '@/components/layouts/AppShell';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

// Lazy-loaded pages
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));
const VerifyOtpPage = lazy(() => import('@/features/auth/pages/VerifyOtpPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then(({ DashboardPage }) => ({ default: DashboardPage })));
const SubjectsPage = lazy(() => import('@/features/subjects/SubjectsPage'));
const SubjectDetailPage = lazy(() => import('@/features/subjects/SubjectDetailPage'));
const LecturePage = lazy(() => import('@/features/subjects/LecturePage'));
const QuestionPage = lazy(() => import('@/features/questions/QuestionPage'));
const FavoritesPage = lazy(() => import('@/features/questions/FavoritesPage'));
const ExamPage = lazy(() => import('@/features/exams/pages/ExamPage'));
const ExamReviewPage = lazy(() => import('@/features/exams/pages/ExamReviewPage'));
const LibraryPage = lazy(() => import('@/features/library/LibraryPage'));
// Push 4 Phase 5 — My Studies hub + course player
const MyStudiesPage = lazy(() => import('@/features/my-studies/pages/MyStudiesPage'));
const CoursePlayerPage = lazy(() => import('@/features/my-studies/pages/CoursePlayerPage'));
const SearchPage = lazy(() => import('@/features/search/SearchPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const NotificationsPage = lazy(() => import('@/features/notifications/pages/NotificationsPage'));
const StatsPage = lazy(() => import('@/features/stats/pages/StatsPage'));
const LeaderboardPage = lazy(() => import('@/features/stats/pages/LeaderboardPage'));
const TermsPage = lazy(() => import('@/features/legal/TermsPage'));
const PrivacyPage = lazy(() => import('@/features/legal/PrivacyPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const ActivateCodePage = lazy(() => import('@/features/subscriptions/ActivateCodePage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

// P2-31: Hide OTP route when OtpEnabled=false
const otpEnabled = import.meta.env.VITE_OTP_ENABLED === 'true';

export function AppRoutes() {
  return (
    <RouteBoundary>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        {otpEnabled && <Route path="/verify-otp" element={<VerifyOtpPage />} />}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Legal pages */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/subjects/:subjectSlug" element={<SubjectDetailPage />} />
          <Route path="/subjects/:subjectSlug/lectures/:lectureId" element={<LecturePage />} />
          <Route path="/subjects/:subjectSlug/lectures/:lectureId/questions" element={<QuestionPage />} />
          <Route path="/subjects/:subjectSlug/questions/:questionId" element={<QuestionPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          {/* My Studies hub — courses / exams / library tabs (Push 4 Phase 5) */}
          <Route path="/my-studies" element={<MyStudiesPage />} />
          <Route path="/my-studies/courses/:courseId" element={<CoursePlayerPage />} />
          {/* Push 10.8 — the temporary /player-test sandbox is DELETED: the real
              player stack now lives in the production course player page. */}
          {/* Backward compatibility: legacy entry points redirect into the hub.
              Deep links (/exams/:id, /subjects/:slug/library) keep working below. */}
          <Route path="/exams" element={<Navigate to="/my-studies?tab=exams" replace />} />
          <Route path="/exams/:examId" element={<ExamPage />} />
          <Route path="/exams/:sessionId/review" element={<ExamReviewPage />} />
          <Route path="/library" element={<Navigate to="/my-studies?tab=library" replace />} />
          <Route path="/subjects/:subjectSlug/library" element={<LibraryPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          {/* 5C: Missing features */}
          <Route path="/activate-code" element={<ActivateCodePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* 404 page (replaces wildcard redirect) */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </RouteBoundary>
  );
}

/** Suspense boundary that also catches lazy-chunk crashes (e.g. a failed
 *  chunk download mid-deploy) — the ErrorBoundary shows a Retry card instead
 *  of a white screen (Push 8). */
function RouteBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
