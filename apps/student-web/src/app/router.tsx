import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from '@/components/layouts/AppShell';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';

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
const ExamsCatalogPage = lazy(() => import('@/features/exams/pages/ExamsCatalogPage'));
const LibraryPage = lazy(() => import('@/features/library/LibraryPage'));
const LibraryCatalogPage = lazy(() => import('@/features/library/LibraryCatalogPage'));
const SearchPage = lazy(() => import('@/features/search/SearchPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const NotificationsPage = lazy(() => import('@/features/notifications/pages/NotificationsPage'));
const StatsPage = lazy(() => import('@/features/stats/pages/StatsPage'));
const LeaderboardPage = lazy(() => import('@/features/stats/pages/LeaderboardPage'));
const TermsPage = lazy(() => import('@/features/legal/TermsPage'));
const PrivacyPage = lazy(() => import('@/features/legal/PrivacyPage'));

// P2-31: Hide OTP route when OtpEnabled=false
const otpEnabled = import.meta.env.VITE_OTP_ENABLED === 'true';

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        {/* P2-31: Only register /verify-otp if OTP is enabled */}
        {otpEnabled && <Route path="/verify-otp" element={<VerifyOtpPage />} />}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Legal pages (public, replace href="#" placeholders) */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        {/* Protected Routes (require auth) */}
        <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/subjects/:subjectSlug" element={<SubjectDetailPage />} />
          <Route path="/subjects/:subjectSlug/lectures/:lectureId" element={<LecturePage />} />
          <Route path="/subjects/:subjectSlug/lectures/:lectureId/questions" element={<QuestionPage />} />
          <Route path="/subjects/:subjectSlug/questions/:questionId" element={<QuestionPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          {/* P2-27: Independent /exams catalog page */}
          <Route path="/exams" element={<ExamsCatalogPage />} />
          <Route path="/exams/:examId" element={<ExamPage />} />
          <Route path="/exams/:sessionId/review" element={<ExamReviewPage />} />
          {/* P2-28: Independent /library catalog page */}
          <Route path="/library" element={<LibraryCatalogPage />} />
          <Route path="/subjects/:subjectSlug/library" element={<LibraryPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
        </Route>

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
