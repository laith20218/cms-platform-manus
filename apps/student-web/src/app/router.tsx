import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from '@/components/layouts/AppShell';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
// W14.4 (C.3) — content protection mounts: question/exam/review surfaces carry the
// same watermark + anti-copy protection as the course player.
import { SecurityWrapper } from '@/features/security/SecurityWrapper';

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
const FavoritesPage = lazy(() => import('@/features/favorites/FavoritesPage'));
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
// W14.4 — exam courses detail (the storefront itself now lives in the hub).
const ExamCourseDetailPage = lazy(() => import('@/features/exam-courses/pages/ExamCourseDetailPage'));
const PracticePage = lazy(() => import('@/features/practice/pages/PracticePage'));

// P2-31: Hide OTP route when OtpEnabled=false
const otpEnabled = import.meta.env.VITE_OTP_ENABLED === 'true';

/**
 * W15.1 (A.3) — the exam-courses storefront moved INTO the My Studies hub
 * (MyStudiesPage ?tab=exam-courses). The standalone route is kept as a redirect
 * so every legacy deep link — bookmarks, the PracticePage back-link, the detail
 * page's back button — keeps working and PRESERVES its filter params:
 *   • the internal lens `?tab=years|categorized` maps to the namespaced
 *     `?examTab=` (the hub owns ?tab=),
 *   • subjectId + the four cascade levels pass through untouched.
 * The /exam-courses/:courseId DETAIL route stays a real page (below).
 */
function ExamCoursesRedirect() {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams();
  next.set('tab', 'exam-courses');
  const legacyTab = searchParams.get('tab');
  if (legacyTab === 'years' || legacyTab === 'categorized') next.set('examTab', legacyTab);
  for (const key of ['subjectId', 'universityId', 'collegeId', 'yearId', 'semesterId']) {
    const value = searchParams.get(key);
    if (value) next.set(key, value);
  }
  return <Navigate to={`/my-studies?${next.toString()}`} replace />;
}

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
          <Route path="/subjects/:subjectSlug/lectures/:lectureId/questions" element={<SecurityWrapper><QuestionPage /></SecurityWrapper>} />
          <Route path="/subjects/:subjectSlug/questions/:questionId" element={<SecurityWrapper><QuestionPage /></SecurityWrapper>} />
          <Route path="/favorites" element={<FavoritesPage />} />
          {/* My Studies hub — courses / exams / library tabs (Push 4 Phase 5) */}
          <Route path="/my-studies" element={<MyStudiesPage />} />
          <Route path="/my-studies/courses/:courseId" element={<CoursePlayerPage />} />
          {/* Push 10.8 — the temporary /player-test sandbox is DELETED: the real
              player stack now lives in the production course player page. */}
          {/* Backward compatibility: legacy entry points redirect into the hub.
              Deep links (/exams/:id, /subjects/:slug/library) keep working below. */}
          <Route path="/exams" element={<Navigate to="/my-studies?tab=exams" replace />} />
          <Route path="/exams/:examId" element={<SecurityWrapper><ExamPage /></SecurityWrapper>} />
          <Route path="/exams/:sessionId/review" element={<SecurityWrapper><ExamReviewPage /></SecurityWrapper>} />
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
          {/* W15.1 (A.3) — exam courses storefront REDIRECTS into the hub;
              the detail page stays a real route (below). */}
          <Route path="/exam-courses" element={<ExamCoursesRedirect />} />
          <Route path="/exam-courses/:courseId" element={<ExamCourseDetailPage />} />
          {/* W14.4 — practice player (B.1, D13): exam-model runs + categorized lens */}
          <Route path="/practice/exam/:examModelId" element={<PracticePage />} />
          <Route path="/practice/categorized/:subjectId" element={<PracticePage />} />
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
