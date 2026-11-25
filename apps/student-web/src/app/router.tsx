import { Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from '@/components/layouts/AppShell';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
// W14.4 (C.3) — content protection mounts: question/exam/review surfaces carry the
// same watermark + anti-copy protection as the course player.
import { SecurityWrapper } from '@/features/security/SecurityWrapper';
// W15.4.4a — /my-studies cutover: legacy hub URLs transparently redirect to /study.
import { MyStudiesRedirect } from '@/app/MyStudiesRedirect';

// Lazy-loaded pages
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));
const VerifyOtpPage = lazy(() => import('@/features/auth/pages/VerifyOtpPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then(({ DashboardPage }) => ({ default: DashboardPage })));
// W15.4.1 — parallel /study hub (6 tabs). Not linked from the nav yet; the
// 15.4.4 cutover redirects /my-studies here.
const StudyPage = lazy(() => import('@/features/study/pages/StudyPage').then(({ StudyPage }) => ({ default: StudyPage })));
const SubjectsPage = lazy(() => import('@/features/subjects/SubjectsPage'));
const SubjectDetailPage = lazy(() => import('@/features/subjects/SubjectDetailPage'));
const LecturePage = lazy(() => import('@/features/subjects/LecturePage'));
const QuestionPage = lazy(() => import('@/features/questions/QuestionPage'));
const FavoritesPage = lazy(() => import('@/features/favorites/FavoritesPage'));
const ExamPage = lazy(() => import('@/features/exams/pages/ExamPage'));
const ExamReviewPage = lazy(() => import('@/features/exams/pages/ExamReviewPage'));
// W16.1a — the exams surface (الاختبارات + التدريب sub-tabs) is a standalone
// page now; /study?tab=exams redirects here.
const ExamsPage = lazy(() => import('@/features/exams/pages/ExamsPage').then(({ ExamsPage }) => ({ default: ExamsPage })));
const LibraryPage = lazy(() => import('@/features/library/LibraryPage'));
const CoursePlayerPage = lazy(() => import('@/features/my-studies/pages/CoursePlayerPage'));
const SearchPage = lazy(() => import('@/features/search/SearchPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const NotificationsPage = lazy(() => import('@/features/notifications/pages/NotificationsPage'));
const StatsPage = lazy(() => import('@/features/stats/pages/StatsPage'));
const LeaderboardPage = lazy(() => import('@/features/stats/pages/LeaderboardPage'));
const TermsPage = lazy(() => import('@/features/legal/TermsPage'));
const PrivacyPage = lazy(() => import('@/features/legal/PrivacyPage'));
// W16.5 — admin-managed contact page (public route, like terms/privacy).
const ContactPage = lazy(() => import('@/features/legal/ContactPage'));
// W3 (UX 2A) — the offline exam player route: PUBLIC (the page is served by the
// dedicated CmsOfflineExam bridge inside OfflineExamWebActivity's WebView, not
// by the web session); a plain browser gets the honest "Android app only" state.
const OfflineExamPage = lazy(() => import('@/features/offline/OfflineExamPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const ActivateCodePage = lazy(() => import('@/features/subscriptions/ActivateCodePage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const PracticePage = lazy(() => import('@/features/practice/pages/PracticePage'));

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
        {/* W16.5 — admin-managed contact page (content store, anonymous). */}
        <Route path="/contact" element={<ContactPage />} />
        {/* W3 (UX 2A) — offline exam player for downloaded question packages; the
            dedicated WebView bridge (window.CmsOfflineExam) is the only data source. */}
        <Route path="/offline-exam/:packageId" element={<OfflineExamPage />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          {/* W15.4.1 — parallel /study hub: direct URL only until the 15.4.4 cutover. */}
          <Route path="/study" element={<StudyPage />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/subjects/:subjectSlug" element={<SubjectDetailPage />} />
          <Route path="/subjects/:subjectSlug/lectures/:lectureId" element={<LecturePage />} />
          <Route path="/subjects/:subjectSlug/lectures/:lectureId/questions" element={<SecurityWrapper><QuestionPage /></SecurityWrapper>} />
          <Route path="/subjects/:subjectSlug/questions/:questionId" element={<SecurityWrapper><QuestionPage /></SecurityWrapper>} />
          <Route path="/favorites" element={<FavoritesPage />} />
          {/* W15.4.4a — /my-studies cutover: the legacy hub redirects into /study
              (tab map in MyStudiesRedirect: practice → exams&subtab=practice,
              exam-courses → /study?tab=bank, library/courses/exams → ?tab=X).
              /my-studies/courses/:courseId below still renders the real player. */}
          <Route path="/my-studies" element={<MyStudiesRedirect />} />
          <Route path="/my-studies/courses/:courseId" element={<CoursePlayerPage />} />
          {/* Push 10.8 — the temporary /player-test sandbox is DELETED: the real
              player stack now lives in the production course player page. */}
          {/* Backward compatibility: legacy entry points redirect to the new
              surfaces directly (15.4.4a — no chain via /my-studies). Deep links
              (/exams/:id, /subjects/:slug/library) keep working below.
              W16.1a (R1): /exams is the exams page itself now — the hub's
              ?tab=exams redirects here (StudyPage), not the other way around. */}
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/:examId" element={<SecurityWrapper><ExamPage /></SecurityWrapper>} />
          <Route path="/exams/:sessionId/review" element={<SecurityWrapper><ExamReviewPage /></SecurityWrapper>} />
          <Route path="/library" element={<Navigate to="/study?tab=library" replace />} />
          <Route path="/subjects/:subjectSlug/library" element={<LibraryPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          {/* 5C: Missing features */}
          <Route path="/activate-code" element={<ActivateCodePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* W16.1b (D2-a) — legacy /exam-courses routes redirect into the hub's
              bank tab: the storefront (ExamCoursesCatalog) and the bundle detail
              (ExamCourseDetailPage) mount inside /study?tab=bank now. Both routes
              preserve every query param (subjectId, cascade levels, examTab…);
              the detail route also moves :courseId into ?courseId=. */}
          <Route path="/exam-courses" element={<ExamCoursesRedirect />} />
          <Route path="/exam-courses/:courseId" element={<ExamCoursesRedirect />} />
          {/* W15.4.4a — bare /practice lands on the practice sub-tab of the
              exams page (W16.1a: /exams standalone — was /study?tab=exams&subtab=practice). */}
          <Route path="/practice" element={<Navigate to="/exams?subtab=practice" replace />} />
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

/** W16.1b (D2-a) — legacy /exam-courses/:courseId deep links redirect into the
 *  hub's bank tab. courseId moves from the path into the ?courseId= query param
 *  (ExamCourseDetailPage reads it from useSearchParams now); every OTHER query
 *  param (subjectId, cascade levels, examTab…) rides along unchanged. */
function ExamCoursesRedirect() {
  const { courseId } = useParams<{ courseId: string }>();
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('tab', 'bank');
  if (courseId) next.set('courseId', courseId);
  return <Navigate to={`/study?${next.toString()}`} replace />;
}
