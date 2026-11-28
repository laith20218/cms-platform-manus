/**
 * StudentsCenter — institutional student management surface.
 *
 * Composition:
 *   • Page header with section title + subtitle + live count badge
 *   • Filter bar (search · university · status · clear)
 *   • Responsive table (overflow-x-auto on mobile) with avatar, identity,
 *     academic path, status badge, activity stats, last sign-in, and row actions
 *   • Pagination (page number · total · prev/next)
 *   • Slide-in drawer from the right with three tabs: Overview · Security log · Sessions
 *   • Protected-action dialog (ban / revoke-sessions / unbind-device) with backdrop,
 *     reason textarea, optional expiry date, and confirm button (red for ban)
 *   • Loading skeletons, empty states, and confirmation prompts for destructive actions
 *
 * Design tokens (--cms-*) are applied via inline style; structural styling is pure Tailwind.
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, ArchiveRestore, Ban, CalendarClock, ChevronLeft, ChevronRight, CircleAlert,
  Eye, History, LaptopMinimal, LoaderCircle, MonitorSmartphone, RotateCcw,
  Search, ShieldAlert, ShieldCheck, UserRound, Users, X,
  Pencil, Camera, Check, BookOpenCheck, ClipboardCheck, KeyRound, FileWarning,
  UserPlus, KeySquare, Timer, Info,
} from 'lucide-react';
import {
  ApiError,
  apiRequest,
  archiveStudent,
  fetchStudentActivity,
  fetchStudentDetail,
  resetStudentPassword,
  restoreStudent,
  type PagedResult,
  type StudentActivityItem,
  type StudentDetailDto,
} from '../lib/api';
import { t, localeOf, statusLabel, apiErrorHumanMessage, type Locale } from '../lib/dictionary';
// PR-6 — the shared event-type glossary (extracted so SecurityCenter renders
// the same wire enum identically; the local eventTypeLabel is retired).
import { securityEventLabel, SECURITY_EVENT_TYPES } from '../lib/securityEventLabels';
import { ConfirmDialog, Dialog, DetailDrawer, Pagination, RowActionsMenu } from '@cms/ui';
import { useUiPermissions } from '../hooks/uiPermissionsContext';
import { useQueryState } from '../lib/useQueryState';

// ===== W3 (admin-ui): Arabic glossaries — raw enum wire values must never
// render on the Arabic surface (debt D-23). Unknown values fall back to an
// explicit label (with the raw code kept as a title tooltip where useful).
// PR-3-A: the glossaries now source their labels from the shared dictionary
// (status registry domains + students.* entries). Outputs are byte-identical
// with the pre-migration ternaries, including the legacy unknown-value
// pass-through branches (Arabic label / raw English wire value). =====
const securitySeverityLabel = (severity: string, locale: Locale) => {
  switch (severity?.toLowerCase()) {
    case 'info': return statusLabel(locale, 'securitySeverity', 'info');
    case 'warning': return statusLabel(locale, 'securitySeverity', 'warning');
    case 'critical': return statusLabel(locale, 'securitySeverity', 'critical');
    default: return t(locale, 'students.security.severityUnknown', { value: severity });
  }
};

const sessionStatusLabel = (status: string, locale: Locale) => {
  switch (status) {
    case 'Active': return statusLabel(locale, 'session', 'Active');
    case 'Revoked': return statusLabel(locale, 'session', 'Revoked');
    case 'Expired': return statusLabel(locale, 'session', 'Expired');
    default: return t(locale, 'students.sessions.statusUnknown', { status });
  }
};

const subscriptionScopeLabel = (scope: string, locale: Locale) => {
  switch (scope) {
    case 'Subject': return statusLabel(locale, 'subscriptionScope', 'Subject');
    case 'Semester': return statusLabel(locale, 'subscriptionScope', 'Semester');
    case 'Year': return statusLabel(locale, 'subscriptionScope', 'Year');
    case 'College': return statusLabel(locale, 'subscriptionScope', 'College');
    case 'University': return statusLabel(locale, 'subscriptionScope', 'University');
    default: return t(locale, 'students.subscriptions.scopeUnknown', { scope });
  }
};

// PR-6 — detail subscription summary status (mirrors the subscriptions-tab
// vocabulary: Active → «نشط», anything else reads as not active).
const subscriptionStatusLabel = (status: string, locale: Locale) =>
  status === 'Active' ? t(locale, 'students.subscriptions.active') : t(locale, 'students.subscriptions.expired');

const reportReasonLabel = (reason: string, locale: Locale) => {
  switch (reason) {
    case 'Scientific': return statusLabel(locale, 'reportReason', 'Scientific');
    case 'Typo': return statusLabel(locale, 'reportReason', 'Typo');
    case 'MissingOption': return statusLabel(locale, 'reportReason', 'MissingOption');
    case 'UnclearExplanation': return statusLabel(locale, 'reportReason', 'UnclearExplanation');
    default: return t(locale, 'students.reports.reasonOther');
  }
};

const reportStatusLabel = (status: string, locale: Locale) => {
  switch (status) {
    case 'Pending': return t(locale, 'students.reports.statusPending');
    case 'Reviewing': return t(locale, 'students.reports.statusReviewing');
    case 'Resolved': return t(locale, 'students.reports.statusResolved');
    case 'Rejected': return t(locale, 'students.reports.statusRejected');
    default: return t(locale, 'students.reports.statusClosed');
  }
};

type StudentRecord = {
  id: string;
  fullName: string;
  phone: string;
  status: string;
  lastLogin?: string | null;
  questionsAnswered: number;
  accuracy: number;
  createdAt: string;
  universityName?: string | null;
  collegeName?: string | null;
  // P1-01: avatar + gender for profile editing
  avatarUrl?: string | null;
  gender?: string | null;
  // PR-6 — soft-delete flag (list rows under ?status=archived, contract E).
  archived?: boolean;
};

type University = { id: string; nameAr: string; nameEn?: string | null };
// ITEM-3-STUDENT-CREATE: cascade types for the create-student form
type College = { id: string; nameAr: string; nameEn?: string | null };
type AcademicYear = { id: string; nameAr: string; nameEn?: string | null; yearNumber: number };
type SecurityLog = {
  id: string;
  eventType: string;
  severity: string;
  description: string;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
  createdAt: string;
  studentName?: string | null;
  studentPhone?: string | null;
  deviceName?: string | null;
  deviceType?: string | null;
  deviceOs?: string | null;
  deviceBrowser?: string | null;
  deviceUserAgent?: string | null;
  deviceBoundAt?: string | null;
  deviceLastUsed?: string | null;
  deviceIsActive?: boolean;
};

type Dialog =
  | { kind: 'ban'; student: StudentRecord }
  | { kind: 'revoke-sessions'; student: StudentRecord }
  | { kind: 'unbind-device'; student: StudentRecord }
  | null;

type DrawerTab = 'overview' | 'activity' | 'academic' | 'exams' | 'subscriptions' | 'sessions' | 'security' | 'reports';

// PR-6 — archive (soft delete) / restore confirm target; mode picks the copy.
type LifecycleTarget = { student: StudentRecord; mode: 'archive' | 'restore' };

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const PAGE_SIZE = 20;
// PR-6 — activity tab page size (contract C paged result).
const ACTIVITY_PAGE_SIZE = 10;

// PR-3-A: thin wrapper over the registry's `student` domain. The registry
// covers the known statuses; unknown wire values keep the legacy pass-through
// (`status || '—'`) instead of the registry's explicit unknown label.
const studentStatus = (status: string, locale: Locale) => {
  const value = status.toLowerCase();
  if (value === 'active') return statusLabel(locale, 'student', 'active');
  if (value === 'banned') return statusLabel(locale, 'student', 'banned');
  if (value === 'suspended') return statusLabel(locale, 'student', 'suspended');
  if (value === 'pending') return statusLabel(locale, 'student', 'pending');
  return status || '—';
};

const statusBadgeClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'active') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (value === 'banned') return 'text-red-700 bg-red-50 border-red-200';
  if (value === 'suspended') return 'text-amber-700 bg-amber-50 border-amber-200';
  if (value === 'pending') return 'text-sky-700 bg-sky-50 border-sky-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

const avatarTone = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'banned') return 'bg-red-100 text-red-700';
  if (value === 'suspended') return 'bg-amber-100 text-amber-700';
  if (value === 'pending') return 'bg-sky-100 text-sky-700';
  return 'bg-teal-100 text-teal-700';
};

function dateLabel(value: string | null | undefined, isArabic: boolean) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar-SY' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '—';
  }
}

const eventToneClass = (severity: string) => {
  const value = severity.toLowerCase();
  if (value === 'critical' || value === 'high') return 'border-red-200 bg-red-50';
  if (value === 'warning' || value === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-slate-200 bg-slate-50';
};

const eventLabelClass = (severity: string) => {
  const value = severity.toLowerCase();
  if (value === 'critical' || value === 'high') return 'text-red-600';
  if (value === 'warning' || value === 'medium') return 'text-amber-600';
  return 'text-slate-500';
};

export function StudentsCenter({ token, isArabic, onError, onNotice }: Props) {
  // Push 3: cosmetic gating — the API policies remain the real boundary.
  // unbind-device and the drawer tabs stay ungated (deferred / out-of-census).
  const { can } = useUiPermissions();
  // PR-6 — cross-center deep link into the Security Center (?student=<id>).
  const navigate = useNavigate();
  // PR-3-A: locale for the shared dictionary (derived once from the legacy flag).
  const locale = localeOf(isArabic);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<StudentRecord | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('overview');
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [banUntil, setBanUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmUnban, setConfirmUnban] = useState<StudentRecord | null>(null);
  // P1-01: edit profile state
  const [editStudent, setEditStudent] = useState<StudentRecord | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', gender: '' });
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  // P1-11: student sessions list
  const [sessions, setSessions] = useState<Array<{
    id: string; role: string; status: string; createdAt: string;
    lastActivityAt: string; revokedAt?: string | null; revocationReason?: string | null;
    deviceName?: string | null; deviceType?: string | null;
    deviceOs?: string | null; deviceBrowser?: string | null;
  }>>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);
  // W3 (admin-ui): session revoke was a single unconfirmed click (debt D-11) —
  // now gated by an explicit danger ConfirmDialog.
  const [sessionRevokeTarget, setSessionRevokeTarget] = useState<{ id: string; deviceName?: string | null; deviceType?: string | null } | null>(null);
  // P1-01: student profile drawer — detail tabs data
  const [examSessions, setExamSessions] = useState<Array<{
    id: string; examId: string; examTitle: string; status: string;
    score: number | null; passed: boolean | null;
    startedAt: string; completedAt: string | null;
    totalQuestions: number; correctAnswers: number; durationMinutes: number;
  }>>([]);
  const [examSessionsLoading, setExamSessionsLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Array<{
    id: string; status: string; scopeType: string;
    startsAt: string; expiresAt: string; revokedAt: string | null;
    revocationReason: string | null; createdAt: string;
  }>>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  // W3 (admin-ui): subscription revoke action (POST /admin/subscriptions/{id}/revoke
  // existed with no UI — matrix row #11), confirm-gated with a mandatory reason.
  const [subscriptionRevokeTarget, setSubscriptionRevokeTarget] = useState<{ id: string; scopeType: string; expiresAt: string } | null>(null);
  const [revokingSubscription, setRevokingSubscription] = useState(false);
  const [studentReports, setStudentReports] = useState<Array<{
    id: string; questionId: string; questionText: string; reason: string;
    description: string | null; status: string;
    createdAt: string; resolvedAt: string | null;
  }>>([]);
  const [studentReportsLoading, setStudentReportsLoading] = useState(false);
  const [studentProgress, setStudentProgress] = useState<Array<{
    subjectId: string; subjectName: string; subjectNameEn: string | null;
    questionsAnswered: number; correctAnswers: number; accuracy: number;
    lastActivityDate: string;
  }>>([]);
  const [studentProgressLoading, setStudentProgressLoading] = useState(false);
  // ITEM-3-STUDENT-CREATE: create-student modal state (kept separate from filter state)
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ fullName: '', phone: '', password: '', gender: '', email: '' });
  const [createUniversityId, setCreateUniversityId] = useState('');
  const [createCollegeId, setCreateCollegeId] = useState('');
  const [createYearId, setCreateYearId] = useState('');
  const [createColleges, setCreateColleges] = useState<College[]>([]);
  const [createYears, setCreateYears] = useState<AcademicYear[]>([]);
  const [createBusy, setCreateBusy] = useState(false);
  // ===== PR-6 — Student Center completion =====
  // Deep link: the open drawer lives in the URL (?student=<id>) so refresh,
  // shared links, and back/forward restore the exact working state.
  const studentParamState = useQueryState('student', '');
  const deepLinkStudentId = studentParamState.value;
  // Contract B — detail panel (overview tab account-state + scope + identity).
  const [detail, setDetail] = useState<StudentDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  // Contract C — activity tab (paged timeline + server-side filters).
  const [activityPage, setActivityPage] = useState(1);
  const [activityType, setActivityType] = useState('');
  const [activitySeverity, setActivitySeverity] = useState('');
  const [activityItems, setActivityItems] = useState<StudentActivityItem[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFailed, setActivityFailed] = useState(false);
  // Contract A — password reset dialog (typed-confirm + actor re-auth).
  const [resetTarget, setResetTarget] = useState<StudentRecord | null>(null);
  const [resetForm, setResetForm] = useState({ actorPassword: '', newPassword: '', confirmPassword: '', typedConfirm: '' });
  const [resetForce, setResetForce] = useState(true);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  // Contract D — archive / restore confirm targets.
  const [lifecycleTarget, setLifecycleTarget] = useState<LifecycleTarget | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  const request = <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);
  const filtersActive = Boolean(query.trim() || status || universityId);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const universityOptions = useMemo(() => universities.map((university) => ({
    id: university.id,
    label: isArabic ? university.nameAr : (university.nameEn || university.nameAr),
  })), [universities, isArabic]);

  const loadStudents = async (targetPage = page) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(PAGE_SIZE) });
      if (query.trim()) params.set('search', query.trim());
      if (status) params.set('status', status);
      if (universityId) params.set('universityId', universityId);
      const data = await request<PagedResult<StudentRecord>>(`/api/v1/admin/students?${params.toString()}`);
      setStudents(data.items);
      setTotal(data.total);
      setPage(data.page || targetPage);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        onError(t(locale, 'students.errors.loadForbidden'));
      } else {
        onError(error instanceof Error ? error.message : t(locale, 'students.errors.loadFallback'));
      }
      setStudents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = window.setTimeout(() => { void loadStudents(1); }, 250);
    return () => window.clearTimeout(handle);
    // Filter changes trigger a fresh first-page fetch; pagination is governed separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, query, status, universityId]);

  useEffect(() => {
    if (!token) return;
    request<PagedResult<University>>('/api/v1/universities?Page=1&PageSize=100')
      .then((data) => setUniversities(data.items))
      .catch(() => setUniversities([]));
    // The university directory is a filter aid; the protected student query remains authoritative.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openStudent = async (student: StudentRecord) => {
    setSelected(student);
    setDrawerTab('overview');
    setSecurityLogs([]);
    setSessions([]);
    setExamSessions([]);
    setSubscriptions([]);
    setStudentReports([]);
    setStudentProgress([]);
    setLogsLoading(true);
    // PR-6 — deep link: keep the open drawer in the URL (?student=<id>).
    studentParamState.setValue(student.id);
    // PR-6 — detail fetch (contract B) + activity tab first page (contract C).
    setDetail(null);
    setDetailFailed(false);
    setDetailLoading(true);
    fetchStudentDetail(student.id, token)
      .then((dto) => setDetail(dto))
      .catch(() => { setDetailFailed(true); /* the drawer stays usable; retry offered in the panel */ })
      .finally(() => setDetailLoading(false));
    setActivityItems([]);
    setActivityTotal(0);
    setActivityPage(1);
    setActivityFailed(false);
    // P1-11: fetch sessions in parallel with security logs + detail tabs data
    setSessionsLoading(true);
    setExamSessionsLoading(true);
    setSubscriptionsLoading(true);
    setStudentReportsLoading(true);
    setStudentProgressLoading(true);
    Promise.all([
      request<SecurityLog[]>(`/api/v1/security/students/${student.id}/logs?count=50`)
        .then(data => setSecurityLogs(Array.isArray(data) ? data : []))
        .catch(error => {
          if (error instanceof ApiError && error.status === 403) {
            onError(t(locale, 'students.errors.securityLogForbidden'));
          } else {
            onError(error instanceof Error ? error.message : t(locale, 'students.errors.securityLogFallback'));
          }
        }),
      // P1-11: fetch student sessions
      request<typeof sessions>(`/api/v1/security/students/${student.id}/sessions`)
        .then(data => setSessions(Array.isArray(data) ? data : []))
        .catch(() => { /* sessions are optional — don't block the drawer */ })
        .finally(() => setSessionsLoading(false)),
      // P1-01: fetch exam sessions for the Exams tab
      request<{ items: typeof examSessions }>(`/api/v1/admin/students/${student.id}/exam-sessions`)
        .then(data => setExamSessions(data?.items || []))
        .catch(() => { /* best-effort — don't block the drawer */ })
        .finally(() => setExamSessionsLoading(false)),
      // P1-01: fetch subscriptions for the Subscriptions tab
      request<{ items: typeof subscriptions }>(`/api/v1/admin/students/${student.id}/subscriptions`)
        .then(data => setSubscriptions(data?.items || []))
        .catch(() => { /* best-effort */ })
        .finally(() => setSubscriptionsLoading(false)),
      // P1-01: fetch error reports for the Reports tab
      request<{ items: typeof studentReports }>(`/api/v1/admin/students/${student.id}/reports`)
        .then(data => setStudentReports(data?.items || []))
        .catch(() => { /* best-effort */ })
        .finally(() => setStudentReportsLoading(false)),
      // P1-01: fetch per-subject progress for the Academic tab
      request<{ items: typeof studentProgress }>(`/api/v1/admin/students/${student.id}/progress`)
        .then(data => setStudentProgress(data?.items || []))
        .catch(() => { /* best-effort */ })
        .finally(() => setStudentProgressLoading(false)),
    ]).finally(() => setLogsLoading(false));
  };

  // P1-11: revoke a single session
  const revokeSession = async (sessionId: string) => {
    if (!selected) return;
    setRevokingSession(sessionId);
    try {
      await apiRequest(`/api/v1/security/students/${selected.id}/sessions/${sessionId}/revoke`, token, { method: 'POST' });
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: 'Revoked', revokedAt: new Date().toISOString(), revocationReason: 'Revoked by authorized administrator' } : s));
      onNotice(t(locale, 'students.toasts.sessionRevoked'));
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : t(locale, 'students.toasts.sessionRevokeFailed');
      onError(msg);
    } finally { setRevokingSession(null); }
  };

  const closeDrawer = () => {
    setSelected(null);
    setDrawerTab('overview');
    setSecurityLogs([]);
    // PR-6 — remove the deep-link parameter (the drawer is closed).
    studentParamState.setValue('');
  };

  // ===== PR-6 =====

  /** Contract C — paged activity for the drawer's Activity tab. */
  const loadActivity = async (targetPage = activityPage, type = activityType, severity = activitySeverity) => {
    if (!selected || !token) return;
    setActivityLoading(true);
    setActivityFailed(false);
    try {
      const data = await fetchStudentActivity(selected.id, token, {
        page: targetPage,
        pageSize: ACTIVITY_PAGE_SIZE,
        type: type || undefined,
        // The chips are lower-case; the wire value is the enum member name.
        severity: severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : undefined,
      });
      setActivityItems(data.items ?? []);
      setActivityTotal(data.total ?? 0);
      setActivityPage(data.page || targetPage);
    } catch {
      // Best-effort tab: show the honest error surface + retry, never a crash.
      setActivityFailed(true);
      setActivityItems([]);
      setActivityTotal(0);
    } finally {
      setActivityLoading(false);
    }
  };

  // Refetch the activity list when the drawer's Activity tab activates or its
  // filters change (page changes go through loadActivity directly).
  useEffect(() => {
    if (!selected || drawerTab !== 'activity' || !token) return;
    void loadActivity(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, drawerTab, activityType, activitySeverity, token]);

  /** Contract A — password reset submit (typed confirm + actor re-auth). */
  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetTarget || !token) return;
    if (!resetForm.actorPassword) {
      setResetError(t(locale, 'students.passwordReset.actorPasswordRequired'));
      return;
    }
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      setResetError(t(locale, 'students.passwordReset.mismatch'));
      return;
    }
    if (resetForm.newPassword.length < 8) {
      setResetError(t(locale, 'students.validation.passwordTooShort'));
      return;
    }
    setResetBusy(true);
    setResetError('');
    try {
      await resetStudentPassword(resetTarget.id, token, {
        actorPassword: resetForm.actorPassword,
        newPassword: resetForm.newPassword,
        forceChangeOnNextLogin: resetForce,
      });
      onNotice(t(locale, 'students.passwordReset.successToast'));
      setResetTarget(null);
      // The new password is NEVER echoed anywhere — cleared immediately.
      setResetForm({ actorPassword: '', newPassword: '', confirmPassword: '', typedConfirm: '' });
      setResetForce(true);
      // Refresh the detail panel (mustChangePassword / session state changed).
      await loadDetailFor(resetTarget);
    } catch (error) {
      // INVALID_CURRENT_PASSWORD and policy failures resolve through
      // apiErrorHumanMessage (backend Arabic detail first, then the code map).
      const human = apiErrorHumanMessage(error, locale).human;
      setResetError(human);
      onError(human);
    } finally {
      setResetBusy(false);
    }
  };

  /** Contract B refetch for one student (used after protected actions). */
  const loadDetailFor = async (student: StudentRecord) => {
    if (!token) return;
    setDetailLoading(true);
    try {
      setDetail(await fetchStudentDetail(student.id, token));
      setDetailFailed(false);
    } catch {
      setDetailFailed(true);
    } finally {
      setDetailLoading(false);
    }
  };

  /** Contract D — archive (soft delete) / restore, idempotent. */
  const executeLifecycle = async (target: LifecycleTarget) => {
    if (!token) return;
    setLifecycleBusy(true);
    try {
      if (target.mode === 'archive') {
        await archiveStudent(target.student.id, token);
        onNotice(t(locale, 'students.archive.archivedToast'));
      } else {
        await restoreStudent(target.student.id, token);
        onNotice(t(locale, 'students.archive.restoredToast'));
      }
      setLifecycleTarget(null);
      await loadStudents(target.mode === 'archive' && status !== 'archived' ? 1 : page);
      if (selected?.id === target.student.id) await openStudent(target.student);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'students.archive.failedToast'));
    } finally {
      setLifecycleBusy(false);
    }
  };

  // Deep link (?student=<id>): on mount (or when the param appears) open that
  // student's drawer — from the loaded page, or from the detail endpoint when
  // the row is not on the current page. Writes use history replace like the
  // other query-state surfaces, so refresh/back stay stable. When the row
  // click itself wrote the param, the drawer is already open — skip.
  const deepLinkHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!token || !deepLinkStudentId) return;
    if (selected?.id === deepLinkStudentId) return;
    if (deepLinkHandledRef.current === deepLinkStudentId) return;
    deepLinkHandledRef.current = deepLinkStudentId;
    const openFromRecord = (record: StudentRecord) => { void openStudent(record); };
    const row = students.find((s) => s.id === deepLinkStudentId);
    if (row) { openFromRecord(row); return; }
    fetchStudentDetail(deepLinkStudentId, token)
      .then((dto) => {
        openFromRecord({
          id: dto.id,
          fullName: dto.fullName,
          phone: dto.phone,
          status: dto.status,
          lastLogin: dto.lastLogin,
          questionsAnswered: dto.questionsAnswered,
          accuracy: dto.accuracy,
          createdAt: dto.createdAt,
          universityName: dto.academic?.universityName ?? null,
          collegeName: dto.academic?.collegeName ?? null,
          avatarUrl: dto.avatarUrl,
          gender: dto.gender,
        });
      })
      .catch(() => { /* best-effort once — the list surface stays honest */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, deepLinkStudentId, students]);

  // PR-6 — is this row soft-deleted (list flag, archived status, or the open
  // detail's archived bit — the source of truth is the server either way).
  const isArchivedRow = (student: StudentRecord) =>
    student.archived === true
    || (student.status || '').toLowerCase() === 'archived'
    || (selected?.id === student.id && detail?.archived === true);

  // PR-6 — open the password-reset dialog with a fresh form (no secrets kept).
  const openPasswordReset = (student: StudentRecord) => {
    setResetForm({ actorPassword: '', newPassword: '', confirmPassword: '', typedConfirm: '' });
    setResetForce(true);
    setResetError('');
    setResetTarget(student);
  };

  // W3 (admin-ui): revoke a subscription with a recorded reason
  // (POST /api/v1/admin/subscriptions/{id}/revoke — previously had no UI).
  const revokeSubscription = async (subscriptionId: string, reason: string) => {
    if (!selected) return;
    setRevokingSubscription(true);
    try {
      await apiRequest(`/api/v1/admin/subscriptions/${subscriptionId}/revoke`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      setSubscriptions(prev => (prev || []).map(s => s.id === subscriptionId
        ? { ...s, revokedAt: new Date().toISOString(), revocationReason: reason }
        : s));
      setSubscriptionRevokeTarget(null);
      onNotice(t(locale, 'students.toasts.subscriptionRevoked'));
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : t(locale, 'students.toasts.subscriptionRevokeFailed');
      onError(msg);
    } finally { setRevokingSubscription(false); }
  };

  const openDialog = (next: Exclude<Dialog, null>) => {
    setReason('');
    setBanUntil('');
    setDialog(next);
  };

  const executeDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog) return;
    if (dialog.kind === 'ban' && !reason.trim()) {
      onError(t(locale, 'students.validation.banReasonRequired'));
      return;
    }

    setBusy(true);
    try {
      if (dialog.kind === 'ban') {
        await request(`/api/v1/admin/students/${dialog.student.id}/ban`, {
          method: 'POST',
          body: JSON.stringify({
            reason: reason.trim(),
            banUntil: banUntil ? new Date(`${banUntil}T23:59:59`).toISOString() : null,
          }),
        });
        onNotice(t(locale, 'students.toasts.banned'));
      }
      if (dialog.kind === 'revoke-sessions') {
        await request(`/api/v1/admin/students/${dialog.student.id}/revoke-sessions`, { method: 'POST' });
        onNotice(t(locale, 'students.toasts.sessionsRevoked'));
      }
      if (dialog.kind === 'unbind-device') {
        await request(`/api/v1/security/students/${dialog.student.id}/unbind-device`, { method: 'POST' });
        onNotice(t(locale, 'students.toasts.deviceUnbound'));
      }
      const studentRef = dialog.student;
      setDialog(null);
      await loadStudents(page);
      if (selected?.id === studentRef.id) await openStudent(studentRef);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'students.errors.actionFallback'));
    } finally {
      setBusy(false);
    }
  };

  const unban = async (student: StudentRecord) => {
    setBusy(true);
    try {
      await request(`/api/v1/admin/students/${student.id}/unban`, { method: 'POST' });
      onNotice(t(locale, 'students.toasts.reactivated'));
      await loadStudents(page);
      if (selected?.id === student.id) await openStudent(student);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'students.errors.reactivateFallback'));
    } finally {
      setBusy(false);
    }
  };

  const dialogTitle = dialog ? (
    dialog.kind === 'ban' ? t(locale, 'students.dialog.banTitle')
      : dialog.kind === 'revoke-sessions' ? t(locale, 'students.dialog.revokeTitle')
        : t(locale, 'students.dialog.unbindTitle')
  ) : '';

  const dialogConfirm = dialog ? (
    dialog.kind === 'ban' ? t(locale, 'students.dialog.confirmBan')
      : dialog.kind === 'revoke-sessions' ? t(locale, 'students.common.revokeSessions')
        : t(locale, 'students.dialog.confirmUnbind')
  ) : '';

  const dialogScopeNote = dialog ? (
    dialog.kind === 'revoke-sessions'
      ? t(locale, 'students.dialog.scopeNoteRevoke')
      : dialog.kind === 'unbind-device'
        ? t(locale, 'students.dialog.scopeNoteUnbind')
        : t(locale, 'students.dialog.scopeNoteBan')
  ) : '';

  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, total);

  // P1-01: submit profile edit
  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editStudent || !editForm.fullName.trim()) return;
    setBusy(true);
    try {
      await apiRequest(`/api/v1/admin/students/${editStudent.id}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: editForm.fullName.trim(), gender: editForm.gender || null }),
      });
      onNotice(t(locale, 'students.toasts.profileUpdated'));
      setStudents(prev => prev.map(s => s.id === editStudent.id ? { ...s, fullName: editForm.fullName.trim(), gender: editForm.gender || null } : s));
      setEditStudent(null);
      setAvatarPreview(null);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : t(locale, 'students.toasts.updateFailed');
      onError(msg);
    } finally { setBusy(false); }
  };

  // P1-01: upload avatar
  const uploadAvatar = async (file: File) => {
    if (!editStudent) return;
    if (file.size > 3 * 1024 * 1024) { onError(t(locale, 'students.toasts.avatarTooLarge')); return; }
    setAvatarBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiRequest<{ previewUrl: string }>(`/api/v1/admin/students/${editStudent.id}/avatar`, token, {
        method: 'POST',
        body: formData,
      });
      setAvatarPreview(res.previewUrl);
      onNotice(t(locale, 'students.toasts.avatarUploaded'));
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : t(locale, 'students.toasts.avatarUploadFailed');
      onError(msg);
    } finally { setAvatarBusy(false); }
  };

  // ITEM-3-STUDENT-CREATE: cascade — university → colleges (create-student form only)
  const chooseCreateUniversity = async (id: string) => {
    setCreateUniversityId(id);
    setCreateCollegeId('');
    setCreateYearId('');
    setCreateYears([]);
    if (!id) { setCreateColleges([]); return; }
    try {
      setCreateColleges(await request<College[]>(`/api/v1/universities/${id}/colleges`));
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'students.errors.collegesLoadFailed'));
      setCreateColleges([]);
    }
  };

  // ITEM-3-STUDENT-CREATE: cascade — college → academic years (create-student form only)
  const chooseCreateCollege = async (id: string) => {
    setCreateCollegeId(id);
    setCreateYearId('');
    if (!id) { setCreateYears([]); return; }
    try {
      setCreateYears(await request<AcademicYear[]>(`/api/v1/colleges/${id}/years`));
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'students.errors.yearsLoadFailed'));
      setCreateYears([]);
    }
  };

  // ITEM-3-STUDENT-CREATE: open the modal with a fresh form (does not touch filter state)
  const openCreate = () => {
    setCreateForm({ fullName: '', phone: '', password: '', gender: '', email: '' });
    setCreateUniversityId('');
    setCreateCollegeId('');
    setCreateYearId('');
    setCreateColleges([]);
    setCreateYears([]);
    setCreateOpen(true);
  };

  // ITEM-3-STUDENT-CREATE: submit POST /api/v1/admin/students — validates phone (Syrian 09…) + password (min 8)
  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    const fullName = createForm.fullName.trim();
    const phone = createForm.phone.trim();
    if (!fullName) {
      onError(t(locale, 'students.validation.fullNameRequired'));
      return;
    }
    if (!/^09\d{8}$/.test(phone)) {
      onError(t(locale, 'students.validation.phoneInvalid'));
      return;
    }
    if (createForm.password.length < 8) {
      onError(t(locale, 'students.validation.passwordTooShort'));
      return;
    }
    if (!createUniversityId || !createCollegeId || !createYearId) {
      onError(t(locale, 'students.validation.cascadeRequired'));
      return;
    }
    setCreateBusy(true);
    try {
      await request('/api/v1/admin/students', {
        method: 'POST',
        body: JSON.stringify({
          phone,
          password: createForm.password,
          fullName,
          universityId: createUniversityId,
          collegeId: createCollegeId,
          academicYearId: createYearId,
          gender: createForm.gender || undefined,
          email: createForm.email.trim() || undefined,
        }),
      });
      onNotice(t(locale, 'students.toasts.studentCreated'));
      setCreateOpen(false);
      await loadStudents(1);
    } catch (error) {
      onError(error instanceof Error ? error.message : t(locale, 'students.errors.createFailed'));
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* ===== Page header ===== */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className="p-2.5 rounded-xl"
            style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
          >
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
              {t(locale, 'students.common.userManagement')}
            </p>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              {t(locale, 'students.header.title')}
              <span
                className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold"
                style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}
              >
                {total}
              </span>
            </h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {t(locale, 'students.header.subtitle')}
            </p>
          </div>
        </div>
        {/* ITEM-3-STUDENT-CREATE: primary action — open the create-student modal */}
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-white text-sm font-medium transition-colors"
          style={{ background: 'var(--cms-teal-600)' }}
          onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-700)'; }}
          onMouseLeave={(event) => { event.currentTarget.style.background = 'var(--cms-teal-600)'; }}
          onFocus={(event) => { event.currentTarget.style.background = 'var(--cms-teal-700)'; }}
          onBlur={(event) => { event.currentTarget.style.background = 'var(--cms-teal-600)'; }}
        >
          <UserPlus className="w-4 h-4" />
          {t(locale, 'students.common.addStudent')}
        </button>
      </header>

      {/* ===== Filter bar ===== */}
      <div
        className="flex flex-wrap gap-3 items-center p-4 rounded-xl border"
        style={{ background: 'var(--cms-surface)', borderColor: 'var(--cms-line)' }}
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(locale, 'students.filters.searchPlaceholder')}
            className="w-full pr-10 pl-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            style={{ borderColor: 'var(--cms-line-strong)' }}
          />
        </div>
        <select
          value={universityId}
          onChange={(event) => setUniversityId(event.target.value)}
          aria-label={t(locale, 'students.common.university')}
          className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <option value="">{t(locale, 'students.filters.universityAll')}</option>
          {universityOptions.map((university) => (
            <option key={university.id} value={university.id}>{university.label}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label={t(locale, 'students.common.status')}
          className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <option value="">{t(locale, 'students.filters.statusAll')}</option>
          <option value="Active">{statusLabel(locale, 'student', 'Active')}</option>
          <option value="Banned">{statusLabel(locale, 'student', 'Banned')}</option>
          <option value="Suspended">{statusLabel(locale, 'student', 'Suspended')}</option>
          <option value="Pending">{statusLabel(locale, 'student', 'Pending')}</option>
          {/* PR-6 — soft-deleted students stay reachable (contract E). */}
          <option value="archived">{statusLabel(locale, 'publication', 'archived')}</option>
        </select>
        {filtersActive && (
          <button
            onClick={() => { setQuery(''); setStatus(''); setUniversityId(''); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors"
            style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
          >
            <X className="w-4 h-4" />
            {t(locale, 'students.filters.clear')}
          </button>
        )}
      </div>

      {/* ===== Students table ===== */}
      {loading ? (
        <div className="rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 rounded bg-slate-100 animate-pulse w-1/3" />
                  <div className="h-3 rounded bg-slate-100 animate-pulse w-1/4" />
                </div>
                <div className="h-6 w-20 rounded-full bg-slate-100 animate-pulse" />
                <div className="h-3 w-12 rounded bg-slate-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : students.length === 0 ? (
        <div
          className="rounded-xl border bg-white flex flex-col items-center justify-center text-center py-16"
          style={{ borderColor: 'var(--cms-line)' }}
        >
          <div className="p-3 rounded-full" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
            <UserRound className="w-7 h-7" />
          </div>
          <p className="mt-3 text-sm font-medium" style={{ color: 'var(--cms-text)' }}>
            {filtersActive
              ? t(locale, 'students.list.emptyFiltered')
              : t(locale, 'students.list.empty')}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {t(locale, 'students.list.emptyHint')}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto [contain:paint] rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
              <tr>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'students.table.student')}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'students.table.academicPath')}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'students.common.status')}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'students.table.activity')}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{t(locale, 'students.common.lastSignIn')}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider"><span className="sr-only">{t(locale, 'students.table.actionsSr')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--cms-line)' }}>
              {students.map((student) => {
                const active = student.status.toLowerCase() === 'active';
                return (
                  <tr key={student.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarTone(student.status)}`}>
                          {student.fullName?.[0]?.toUpperCase() ?? 'S'}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate" style={{ color: 'var(--cms-text)' }}>{student.fullName}</div>
                          <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{student.phone || '—'}</div>
                          <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                            {t(locale, 'students.table.registeredAt', { date: dateLabel(student.createdAt, isArabic) })}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm" style={{ color: 'var(--cms-text)' }}>{student.universityName || '—'}</div>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{student.collegeName || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(student.status)}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                        {studentStatus(student.status, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold" style={{ color: 'var(--cms-text)' }}>{student.questionsAnswered}</div>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                        {t(locale, 'students.table.accuracyStat', { value: Math.round(student.accuracy) })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--cms-text-soft)' }}>{dateLabel(student.lastLogin, isArabic)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          title={t(locale, 'students.table.viewProfileTitle')}
                          onClick={() => void openStudent(student)}
                          data-testid={`student-open-${student.id}`}
                          className="p-1.5 rounded-md transition-colors"
                          style={{ color: 'var(--cms-text-muted)' }}
                          onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-50)'; event.currentTarget.style.color = 'var(--cms-teal-700)'; }}
                          onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = 'var(--cms-text-muted)'; }}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {/* Command Center P1: row-action ⋮ menu — edit / ban / reactivate
                            grouped instead of a per-row button cluster. Ban stays
                            confirm-gated downstream (ban dialog + unban ConfirmDialog). */}
                        <RowActionsMenu
                          label={t(locale, 'students.table.rowActionsLabel', { name: student.fullName })}
                          dir={isArabic ? 'rtl' : 'ltr'}
                          items={[
                            ...(can('btn:students.edit')
                              ? [{
                                  key: 'edit',
                                  label: t(locale, 'students.common.editProfile'),
                                  icon: <Pencil className="w-4 h-4" />,
                                  onSelect: () => { setEditStudent(student); setEditForm({ fullName: student.fullName, gender: student.gender ?? '' }); },
                                }]
                              : []),
                            ...(can('btn:students.ban') && active
                              ? [{
                                  key: 'ban',
                                  label: t(locale, 'students.common.banAccount'),
                                  danger: true,
                                  icon: <Ban className="w-4 h-4" />,
                                  disabled: busy,
                                  onSelect: () => openDialog({ kind: 'ban', student }),
                                }]
                              : []),
                            ...(can('btn:students.ban') && !active
                              ? [{
                                  key: 'unban',
                                  label: t(locale, 'students.common.reactivate'),
                                  icon: <RotateCcw className="w-4 h-4" />,
                                  disabled: busy,
                                  onSelect: () => setConfirmUnban(student),
                                }]
                              : []),
                            // PR-6 — password reset (typed-confirm dialog; contract A).
                            {
                              key: 'reset-password',
                              label: t(locale, 'students.passwordReset.title'),
                              icon: <KeySquare className="w-4 h-4" />,
                              disabled: busy,
                              onSelect: () => openPasswordReset(student),
                            },
                            // PR-6 — archive / restore soft-delete lifecycle (contract D).
                            (isArchivedRow(student)
                              ? {
                                  key: 'restore',
                                  label: t(locale, 'students.archive.restoreAction'),
                                  icon: <ArchiveRestore className="w-4 h-4" />,
                                  disabled: busy,
                                  onSelect: () => setLifecycleTarget({ student, mode: 'restore' }),
                                }
                              : {
                                  key: 'archive',
                                  label: t(locale, 'students.archive.archiveTitle'),
                                  danger: true,
                                  icon: <Archive className="w-4 h-4" />,
                                  disabled: busy,
                                  onSelect: () => setLifecycleTarget({ student, mode: 'archive' }),
                                }),
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 border-t flex-wrap"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
          >
            <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
              {t(locale, 'students.table.paginationSummary', { from: pageStart, to: pageEnd, total })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadStudents(Math.max(1, page - 1))}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
              >
                {isArabic ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                {t(locale, 'students.table.previous')}
              </button>
              <span className="text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'students.table.pageOf', { page, total: totalPages })}
              </span>
              <button
                type="button"
                onClick={() => void loadStudents(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
              >
                {t(locale, 'students.table.next')}
                {isArabic ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Shared detail drawer (Command Center final pass) =====
          The hand-rolled fixed <aside> is gone; the shared @cms/ui
          DetailDrawer supplies the portal, focus trap/return, Escape,
          scroll lock, RTL logical anchoring and the sticky header/footer.
          Identity + row actions ride the headerExtra slot; the tab strip is
          the non-scrolling subheader. */}
      <DetailDrawer
        open={selected !== null}
        onOpenChange={(next) => { if (!next && !busy) closeDrawer(); }}
        title={t(locale, 'students.drawer.ariaLabel')}
        description={selected
          ? `${selected.fullName || '—'} · ${selected.phone || '—'} · ${selected.universityName || '—'} / ${selected.collegeName || '—'}`
          : undefined}
        headerExtra={selected ? (
          <>
            <span
              className="hidden h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white sm:inline-flex"
              style={{ background: 'linear-gradient(135deg, var(--cms-teal-700), var(--cms-teal-500))' }}
              aria-hidden="true"
            >
              {selected.fullName?.[0]?.toUpperCase() ?? 'S'}
            </span>
            <RowActionsMenu
              label={t(locale, 'students.table.rowActionsLabel', { name: selected.fullName })}
              dir={isArabic ? 'rtl' : 'ltr'}
              items={[
                {
                  key: 'reset-password',
                  label: t(locale, 'students.passwordReset.title'),
                  icon: <KeySquare className="w-4 h-4" />,
                  disabled: busy || resetBusy,
                  onSelect: () => openPasswordReset(selected),
                },
                (isArchivedRow(selected)
                  ? {
                      key: 'restore',
                      label: t(locale, 'students.archive.restoreAction'),
                      icon: <ArchiveRestore className="w-4 h-4" />,
                      disabled: busy || lifecycleBusy,
                      onSelect: () => setLifecycleTarget({ student: selected, mode: 'restore' }),
                    }
                  : {
                      key: 'archive',
                      label: t(locale, 'students.archive.archiveTitle'),
                      danger: true,
                      icon: <Archive className="w-4 h-4" />,
                      disabled: busy || lifecycleBusy,
                      onSelect: () => setLifecycleTarget({ student: selected, mode: 'archive' }),
                    }),
              ]}
            />
          </>
        ) : undefined}
        subheader={(
          <nav
            className="flex overflow-x-auto border-b border-[color:var(--c-border)]"
            role="tablist"
            aria-label={t(locale, 'students.drawer.ariaLabel')}
          >
              {([
                { key: 'overview', label: t(locale, 'students.drawer.tabs.overview') },
                { key: 'activity', label: t(locale, 'students.activity.title') },
                { key: 'academic', label: t(locale, 'students.common.academicProgress') },
                { key: 'exams', label: t(locale, 'students.drawer.tabs.exams') },
                { key: 'subscriptions', label: t(locale, 'students.drawer.tabs.subscriptions') },
                { key: 'sessions', label: t(locale, 'students.drawer.tabs.sessions') },
                { key: 'security', label: t(locale, 'students.common.securityLog') },
                { key: 'reports', label: t(locale, 'students.drawer.tabs.reports') },
            ] as { key: DrawerTab; label: string }[]).map((tab) => {
              const active = drawerTab === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDrawerTab(tab.key)}
                  className="flex-1 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors"
                  style={{
                    borderColor: active ? 'var(--cms-teal-600)' : 'transparent',
                    color: active ? 'var(--cms-teal-700)' : 'var(--cms-text-muted)',
                    background: active ? 'var(--cms-teal-50)' : 'transparent',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        )}
        status="ready"
        testId="student-details-drawer"
      >
        {selected && (
        <div className="space-y-4">
              {drawerTab === 'overview' && (
                <>
                  <div
                    className="rounded-lg border p-4"
                    style={{ background: 'var(--cms-ivory-50)', borderColor: 'var(--cms-line)' }}
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                          {t(locale, 'students.common.status')}
                        </p>
                        <span className={`mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(selected.status)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                          {studentStatus(selected.status, locale)}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                          {t(locale, 'students.common.lastSignIn')}
                        </p>
                        <p className="mt-1 text-sm" style={{ color: 'var(--cms-text)' }}>{dateLabel(selected.lastLogin, isArabic)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                          {t(locale, 'students.drawer.overview.answers')}
                        </p>
                        <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{selected.questionsAnswered}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                          {t(locale, 'students.drawer.overview.accuracy')}
                        </p>
                        <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{Math.round(selected.accuracy)}%</p>
                      </div>
                    </div>
                  </div>

                  {/* ===== PR-6 — account-state detail panel (contract B) ===== */}
                  {detailLoading && !detail ? (
                    <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }} data-testid="student-detail-skeleton" aria-busy="true">
                      {[0, 1, 2].map((row) => <div key={row} className="h-4 rounded bg-slate-100 animate-pulse" />)}
                    </div>
                  ) : detailFailed && !detail ? (
                    <div
                      className="rounded-lg border p-4 flex items-center justify-between gap-3 flex-wrap"
                      style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
                      role="alert"
                      data-testid="student-detail-error"
                    >
                      <p className="text-xs" style={{ color: 'var(--cms-danger)' }}>{t(locale, 'students.detail.loadError')}</p>
                      <button
                        type="button"
                        onClick={() => void loadDetailFor(selected)}
                        data-testid="student-detail-retry"
                        className="px-3 py-1.5 rounded-lg border text-xs font-medium"
                        style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
                      >
                        {t(locale, 'students.detail.retry')}
                      </button>
                    </div>
                  ) : detail && (
                    <article
                      className="rounded-lg border p-4 space-y-3"
                      style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}
                      data-testid="student-detail-panel"
                    >
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" style={{ color: 'var(--cms-teal-700)' }} />
                        <strong className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{t(locale, 'students.detail.accountStateTitle')}</strong>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {/* Lockout state + failed attempts */}
                        <p data-testid="student-detail-lockout" className="flex items-center gap-1.5" style={{ color: detail.lockedOut ? 'var(--cms-danger)' : 'var(--cms-text-soft)' }}>
                          {detail.lockedOut
                            ? <Timer className="w-3.5 h-3.5 shrink-0" />
                            : <ShieldCheck className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--cms-success)' }} />}
                          <span>
                            {detail.lockedOut
                              ? `${t(locale, 'students.detail.lockoutTitle')}${detail.lockoutUntil ? ` — ${t(locale, 'students.detail.lockoutUntil')}: ${dateLabel(detail.lockoutUntil, isArabic)}` : ''}`
                              : t(locale, 'students.detail.lockoutTitle')}
                          </span>
                        </p>
                        <p data-testid="student-detail-failed-logins" style={{ color: 'var(--cms-text-soft)' }}>
                          {t(locale, 'students.detail.failedAttempts')}: <strong style={{ color: 'var(--cms-text)' }}>{detail.failedLoginCount ?? 0}</strong>
                        </p>
                        {/* Ban reason / until */}
                        {detail.banReason && (
                          <p className="sm:col-span-2" style={{ color: 'var(--cms-danger)' }} data-testid="student-detail-ban-reason">
                            {t(locale, 'students.detail.banReason')}: {detail.banReason}
                          </p>
                        )}
                        {detail.banUntil && (
                          <p style={{ color: 'var(--cms-danger)' }}>
                            {t(locale, 'students.detail.banUntil')}: {dateLabel(detail.banUntil, isArabic)}
                          </p>
                        )}
                        {/* Phone verification */}
                        <p data-testid="student-detail-phone-verified" className="flex items-center gap-1.5" style={{ color: detail.phoneVerified ? 'var(--cms-success)' : 'var(--cms-warning)' }}>
                          {detail.phoneVerified
                            ? <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            : <CircleAlert className="w-3.5 h-3.5 shrink-0" />}
                          <span>{detail.phoneVerified ? t(locale, 'students.detail.phoneVerified') : t(locale, 'students.detail.phoneUnverified')}</span>
                        </p>
                        {/* Must-change-password flag */}
                        {detail.mustChangePassword && (
                          <p data-testid="student-detail-must-change" className="flex items-center gap-1.5" style={{ color: 'var(--cms-warning)' }}>
                            <KeySquare className="w-3.5 h-3.5 shrink-0" />
                            <span>{t(locale, 'students.detail.mustChangePassword')}</span>
                          </p>
                        )}
                      </div>

                      {/* Archived state — prominent amber banner + restore */}
                      {detail.archived && (
                        <div
                          className="rounded-lg border p-3 space-y-2"
                          style={{ borderColor: 'var(--cms-warning)', background: 'var(--cms-warning-50)' }}
                          data-testid="student-detail-archived"
                        >
                          <p className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--cms-warning)' }}>
                            <Archive className="w-4 h-4 shrink-0" />
                            {t(locale, 'students.detail.archivedTitle')}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'students.detail.archivedExplanation')}</p>
                          {detail.archivedAt && (
                            <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                              {t(locale, 'students.detail.archivedAt')}: {dateLabel(detail.archivedAt, isArabic)}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => setLifecycleTarget({ student: selected, mode: 'restore' })}
                            disabled={lifecycleBusy}
                            data-testid="student-detail-restore"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-white text-xs font-medium disabled:opacity-50"
                            style={{ background: 'var(--cms-warning)' }}
                          >
                            <ArchiveRestore className="w-4 h-4" />
                            {t(locale, 'students.archive.restoreAction')}
                          </button>
                        </div>
                      )}

                      {/* Academic scope card */}
                      {detail.academic && (
                        <div className="rounded-lg border p-3 space-y-1.5" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }} data-testid="student-detail-academic">
                          <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--cms-text)' }}>
                            <BookOpenCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--cms-teal-700)' }} />
                            {t(locale, 'students.detail.academicScopeTitle')}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                            <p><span style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.common.university')}:</span> {detail.academic.universityName || '—'}</p>
                            <p><span style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.common.college')}:</span> {detail.academic.collegeName || '—'}</p>
                            <p><span style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.detail.academicYear')}:</span> {detail.academic.academicYearName || '—'}</p>
                          </div>
                          <p className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.detail.academicScopeExplanation')}</p>
                        </div>
                      )}

                      {/* Subscription summary */}
                      <div className="rounded-lg border p-3 space-y-1.5" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }} data-testid="student-detail-subscriptions">
                        <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--cms-text)' }}>
                          <ClipboardCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--cms-teal-700)' }} />
                          {t(locale, 'students.detail.subscriptionsTitle')}
                        </p>
                        {detail.subscriptionSummary ? (
                          <>
                            <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                              {t(locale, 'students.detail.activeSubscriptions')}: <strong style={{ color: 'var(--cms-text)' }}>{detail.subscriptionSummary.activeCount}</strong>
                            </p>
                            {detail.subscriptionSummary.latest ? (
                              <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                                {t(locale, 'students.detail.latestSubscription')}: {subscriptionScopeLabel(detail.subscriptionSummary.latest.scopeType, locale)} · {subscriptionStatusLabel(detail.subscriptionSummary.latest.status, locale)} · {t(locale, 'students.subscriptions.from')} {dateLabel(detail.subscriptionSummary.latest.startsAt, isArabic)} · {t(locale, 'students.subscriptions.until')} {dateLabel(detail.subscriptionSummary.latest.expiresAt, isArabic)}
                              </p>
                            ) : (
                              <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.detail.noSubscriptions')}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.detail.noSubscriptions')}</p>
                        )}
                      </div>

                      {/* Identity card — last login / login count / created */}
                      <div className="rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }} data-testid="student-detail-identity">
                        <p style={{ color: 'var(--cms-text-soft)' }}>
                          <span style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.common.lastSignIn')}:</span> {dateLabel(detail.lastLogin, isArabic)}
                        </p>
                        <p style={{ color: 'var(--cms-text-soft)' }}>
                          <span style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.detail.loginCount')}:</span> {detail.loginCount ?? 0}
                        </p>
                        <p style={{ color: 'var(--cms-text-soft)' }}>
                          <span style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.detail.registeredAt')}:</span> {dateLabel(detail.createdAt, isArabic)}
                        </p>
                      </div>
                    </article>
                  )}

                  <div className="grid grid-cols-1 gap-3">
                    <article className="flex flex-col gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                        <CalendarClock className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                        <strong className="text-sm font-semibold">{t(locale, 'students.drawer.overview.sessionsTitle')}</strong>
                      </div>
                      <p className="text-xs flex-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {t(locale, 'students.drawer.overview.sessionsBody')}
                      </p>
                      {can('btn:students.revoke-session') && (
                        <button
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                          style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)', background: 'var(--cms-surface)' }}
                          disabled={busy}
                          onClick={() => openDialog({ kind: 'revoke-sessions', student: selected })}
                        >
                          {t(locale, 'students.common.revokeSessions')}
                        </button>
                      )}
                    </article>

                    <article className="flex flex-col gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                        <LaptopMinimal className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                        <strong className="text-sm font-semibold">{t(locale, 'students.drawer.overview.devicesTitle')}</strong>
                      </div>
                      <p className="text-xs flex-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {t(locale, 'students.drawer.overview.devicesBody')}
                      </p>
                      <button
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                        style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)', background: 'var(--cms-surface)' }}
                        disabled={busy}
                        onClick={() => openDialog({ kind: 'unbind-device', student: selected })}
                      >
                        {t(locale, 'students.common.unbindDevice')}
                      </button>
                    </article>

                    <article className="flex flex-col gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                        <ShieldAlert className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                        <strong className="text-sm font-semibold">{t(locale, 'students.drawer.overview.accountStatus')}</strong>
                      </div>
                      <p className="text-xs flex-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {selected.status.toLowerCase() === 'active'
                          ? t(locale, 'students.drawer.overview.banNote')
                          : t(locale, 'students.drawer.overview.reactivateNote')}
                      </p>
                      {selected.status.toLowerCase() === 'active' ? (
                        can('btn:students.ban') ? (
                          <button
                            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                            style={{ background: 'var(--cms-danger)' }}
                            disabled={busy}
                            onClick={() => openDialog({ kind: 'ban', student: selected })}
                          >
                            <Ban className="w-4 h-4" />
                            {t(locale, 'students.common.banAccount')}
                          </button>
                        ) : null
                      ) : (
                        can('btn:students.ban') ? (
                          <button
                            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                            style={{ background: 'var(--cms-teal-700)' }}
                            disabled={busy}
                            onClick={() => setConfirmUnban(selected)}
                          >
                            <RotateCcw className="w-4 h-4" />
                            {t(locale, 'students.common.reactivate')}
                          </button>
                        ) : null
                      )}
                    </article>

                    {/* PR-6 — password reset entry point (contract A). */}
                    <article className="flex flex-col gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                        <KeySquare className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                        <strong className="text-sm font-semibold">{t(locale, 'students.passwordReset.title')}</strong>
                      </div>
                      <p className="text-xs flex-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {t(locale, 'students.passwordReset.subtitle')}
                      </p>
                      <button
                        type="button"
                        onClick={() => openPasswordReset(selected)}
                        disabled={busy || resetBusy}
                        data-testid="student-password-reset-open"
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                        style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)', background: 'var(--cms-surface)' }}
                      >
                        <KeySquare className="w-4 h-4" />
                        {t(locale, 'students.passwordReset.title')}
                      </button>
                    </article>
                  </div>
                </>
              )}

              {/* ===== PR-6 — Activity tab (contract C: paged, filtered timeline) ===== */}
              {drawerTab === 'activity' && (
                <div className="space-y-4" data-testid="student-activity-tab">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <History className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                      <h3 className="text-base font-bold" style={{ color: 'var(--cms-text)' }}>{t(locale, 'students.activity.title')}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>{activityTotal}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Severity filter chips */}
                      <div className="flex items-center gap-1" role="group" aria-label={t(locale, 'audit.severity.heading')}>
                        {(['', 'info', 'warning', 'critical'] as const).map((value) => {
                          const active = activitySeverity === value;
                          const label = value === '' ? t(locale, 'students.activity.severityAll') : securitySeverityLabel(value, locale);
                          return (
                            <button
                              key={value || 'all'}
                              type="button"
                              aria-pressed={active}
                              data-testid={`activity-severity-${value || 'all'}`}
                              onClick={() => { setActivitySeverity(value); }}
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${eventToneClass(value || 'info')}`}
                              style={{
                                borderColor: active ? 'var(--cms-teal-600)' : 'var(--cms-line-strong)',
                                color: active ? 'var(--cms-teal-700)' : 'var(--cms-text-soft)',
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      {/* Event-type dropdown (full enum with bilingual labels) */}
                      <select
                        value={activityType}
                        onChange={(event) => setActivityType(event.target.value)}
                        aria-label={t(locale, 'audit.headings.type')}
                        data-testid="activity-type-filter"
                        className="px-3 py-1.5 rounded-lg border text-xs bg-white"
                        style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)' }}
                      >
                        <option value="">{t(locale, 'students.activity.typeAll')}</option>
                        {SECURITY_EVENT_TYPES.map((type) => (
                          <option key={type} value={type}>{securityEventLabel(type, locale)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {activityLoading ? (
                    <div className="space-y-2" aria-busy="true" data-testid="student-activity-loading">
                      {[0, 1, 2].map((row) => (
                        <div key={row} className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--cms-line)' }}>
                          <div className="h-3.5 rounded bg-slate-100 animate-pulse w-1/3" />
                          <div className="h-3 rounded bg-slate-100 animate-pulse w-2/3" />
                        </div>
                      ))}
                    </div>
                  ) : activityFailed ? (
                    <div className="rounded-lg border p-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }} role="alert">
                      <p className="text-xs" style={{ color: 'var(--cms-danger)' }}>{t(locale, 'students.activity.loadError')}</p>
                      <button
                        type="button"
                        onClick={() => void loadActivity(1)}
                        data-testid="student-activity-retry"
                        className="px-3 py-1.5 rounded-lg border text-xs font-medium"
                        style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
                      >
                        {t(locale, 'students.activity.retry')}
                      </button>
                    </div>
                  ) : activityItems.length === 0 ? (
                    <div className="rounded-lg border flex flex-col items-center justify-center text-center py-10" style={{ borderColor: 'var(--cms-line)' }} role="status" data-testid="student-activity-empty">
                      <History className="w-6 h-6 mb-2" style={{ color: 'var(--cms-text-muted)', opacity: 0.5 }} />
                      <p className="text-sm" style={{ color: 'var(--cms-text)' }}>{t(locale, 'students.activity.empty')}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.activity.emptyHint')}</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                        {activityItems.map((item) => {
                          const icon = (item.severity || '').toLowerCase() === 'critical'
                            ? <ShieldAlert className="w-4 h-4" style={{ color: 'var(--cms-danger)' }} />
                            : (item.severity || '').toLowerCase() === 'warning'
                              ? <CircleAlert className="w-4 h-4" style={{ color: 'var(--cms-warning)' }} />
                              : <Info className="w-4 h-4" style={{ color: 'var(--cms-info)' }} />;
                          // Actor: adminName when the row says an admin did it; otherwise the student.
                          const actor = item.actorType === 'admin'
                            ? (item.adminName ?? t(locale, 'students.activity.actorUnknown'))
                            : t(locale, 'students.activity.studentActor');
                          return (
                            <article key={item.id} className={`rounded-lg border p-3 ${eventToneClass(item.severity)}`} data-testid="student-activity-row">
                              <div className="flex items-start gap-2">
                                <span className="shrink-0 mt-0.5">{icon}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 flex-wrap">
                                    <strong className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }} title={item.eventType}>{securityEventLabel(item.eventType, locale)}</strong>
                                    <small className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{dateLabel(item.createdAt, isArabic)}</small>
                                  </div>
                                  {/* Plain text — React escapes; the server stores sanitized descriptions. */}
                                  <p className="text-xs mt-1" style={{ color: 'var(--cms-text-soft)' }}>{item.description}</p>
                                  <p className="text-[10px] mt-1" style={{ color: 'var(--cms-text-muted)' }}>{actor}</p>
                                  {item.ipAddress && (
                                    <p className="mt-1 text-[10px] font-mono" style={{ color: 'var(--cms-text-muted)' }}>IP · {item.ipAddress}</p>
                                  )}
                                  {item.deviceFingerprint && (
                                    <p className="mt-1 text-[10px] font-mono" style={{ color: 'var(--cms-text-muted)' }} title={item.deviceFingerprint}>
                                      {t(locale, 'students.security.fingerprint')} · {item.deviceFingerprint.slice(0, 8) + '…'}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                      <Pagination
                        page={activityPage}
                        pageSize={ACTIVITY_PAGE_SIZE}
                        total={activityTotal}
                        onPageChange={(next) => void loadActivity(next)}
                        dir={isArabic ? 'rtl' : 'ltr'}
                        testId="student-activity-pagination"
                        labels={{
                          navLabel: t(locale, 'students.activity.paginationNav'),
                          prev: t(locale, 'students.activity.pagerPrev'),
                          next: t(locale, 'students.activity.pagerNext'),
                          pageOf: (page, pages) => t(locale, 'students.table.pageOf', { page, total: pages }),
                        }}
                      />
                    </>
                  )}
                </div>
              )}

              {drawerTab === 'security' && (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                        {t(locale, 'students.common.securityLog')}
                      </p>
                      <h3 className="text-base font-bold" style={{ color: 'var(--cms-text)' }}>
                        {t(locale, 'students.security.recentEvents')}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* PR-6 — jump to the Security Center pre-filtered to this student. */}
                      <button
                        type="button"
                        onClick={() => navigate(`/security?student=${selected.id}`)}
                        data-testid="student-security-center-link"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium"
                        style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {t(locale, 'security.events.studentFilterLink')}
                      </button>
                      <ShieldCheck className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                    </div>
                  </div>
                  {logsLoading ? (
                    <div className="flex items-center justify-center py-8" style={{ color: 'var(--cms-text-muted)' }}>
                      <LoaderCircle className="w-5 h-5 animate-spin ml-2" />
                      {t(locale, 'students.common.loading')}
                    </div>
                  ) : (securityLogs || []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-10" style={{ color: 'var(--cms-text-muted)' }}>
                      <ShieldCheck className="w-6 h-6" style={{ color: 'var(--cms-line-strong)' }} />
                      <p className="mt-2 text-sm">
                        {t(locale, 'students.security.empty')}
                      </p>
                      <p className="mt-1 text-xs">
                        {t(locale, 'students.security.emptyHint')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                      {(securityLogs || []).map((log) => (
                        <article key={log.id} className={`rounded-lg border p-3 ${eventToneClass(log.severity)}`}>
                          <div className="flex items-start justify-between gap-2">
                            <strong className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }} title={log.eventType}>{securityEventLabel(log.eventType, locale)}</strong>
                            <small className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{dateLabel(log.createdAt, isArabic)}</small>
                          </div>
                          <p className="text-xs mt-1" style={{ color: 'var(--cms-text-soft)' }}>{log.description}</p>
                          {log.ipAddress && (
                            <p className="mt-1 text-xs font-mono" style={{ color: 'var(--cms-text-muted)' }}>
                              IP · {log.ipAddress}
                            </p>
                          )}
                          {log.deviceFingerprint && (
                            <p className="mt-1 text-xs font-mono break-all" style={{ color: 'var(--cms-text-muted)' }} title={log.deviceFingerprint}>
                              {t(locale, 'students.security.fingerprint')} · {log.deviceFingerprint.length > 40 ? log.deviceFingerprint.slice(0, 40) + '…' : log.deviceFingerprint}
                            </p>
                          )}
                          {(log.deviceName || log.deviceType || log.deviceOs || log.deviceBrowser) && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {log.deviceType && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>{log.deviceType}</span>}
                              {log.deviceOs && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--cms-info-50)', color: 'var(--cms-info)' }}>{log.deviceOs}</span>}
                              {log.deviceBrowser && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--cms-ivory-200)', color: 'var(--cms-text-soft)' }}>{log.deviceBrowser}</span>}
                              {log.deviceName && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--cms-warning-50)', color: 'var(--cms-warning)' }}>{log.deviceName}</span>}
                            </div>
                          )}
                          {log.deviceUserAgent && (
                            <p className="mt-1 text-[10px] font-mono break-all opacity-60" style={{ color: 'var(--cms-text-muted)' }}>
                              UA · {log.deviceUserAgent.length > 60 ? log.deviceUserAgent.slice(0, 60) + '…' : log.deviceUserAgent}
                            </p>
                          )}
                          {(log.deviceBoundAt || log.deviceLastUsed) && (
                            <div className="mt-1 flex gap-3 text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                              {log.deviceBoundAt && <span>{t(locale, 'students.common.bound')}: {dateLabel(log.deviceBoundAt, isArabic)}</span>}
                              {log.deviceLastUsed && <span>{t(locale, 'students.common.lastUsed')}: {dateLabel(log.deviceLastUsed, isArabic)}</span>}
                              {log.deviceIsActive !== undefined && (
                                <span style={{ color: log.deviceIsActive ? 'var(--cms-success)' : 'var(--cms-danger)' }}>
                                  {log.deviceIsActive ? t(locale, 'students.common.deviceActive') : t(locale, 'students.common.deviceInactive')}
                                </span>
                              )}
                            </div>
                          )}
                          <em className={`mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide ${eventLabelClass(log.severity)}`}>{securitySeverityLabel(log.severity, locale)}</em>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {drawerTab === 'sessions' && (
                <div className="flex flex-col gap-3">
                  {/* P1-02: Device fingerprint display (from security logs) */}
                  {(() => {
                    const deviceLog = (securityLogs || []).find(l => l.deviceFingerprint);
                    if (!deviceLog) return null;
                    return (
                      <article className="flex flex-col gap-2 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)' }}>
                        <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                          <LaptopMinimal className="w-5 h-5" style={{ color: 'var(--cms-teal-700)' }} />
                          <strong className="text-sm font-semibold">{t(locale, 'students.sessions.boundDevice')}</strong>
                          {deviceLog.deviceIsActive !== undefined && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${deviceLog.deviceIsActive ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                              {deviceLog.deviceIsActive ? t(locale, 'students.common.deviceActive') : t(locale, 'students.common.deviceInactive')}
                            </span>
                          )}
                        </div>
                        {/* Fingerprint */}
                        {deviceLog.deviceFingerprint && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.sessions.fingerprint')}:</span>
                            <code className="text-xs font-mono break-all" style={{ color: 'var(--cms-teal-700)' }} title={deviceLog.deviceFingerprint}>
                              {deviceLog.deviceFingerprint.length > 40 ? deviceLog.deviceFingerprint.slice(0, 40) + '…' : deviceLog.deviceFingerprint}
                            </code>
                          </div>
                        )}
                        {/* Device chips */}
                        {(deviceLog.deviceName || deviceLog.deviceType || deviceLog.deviceOs || deviceLog.deviceBrowser) && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {deviceLog.deviceType && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--cms-surface)', color: 'var(--cms-teal-700)', border: '1px solid var(--cms-teal-100)' }}>{deviceLog.deviceType}</span>}
                            {deviceLog.deviceOs && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--cms-info-50)', color: 'var(--cms-info)' }}>{deviceLog.deviceOs}</span>}
                            {deviceLog.deviceBrowser && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--cms-ivory-200)', color: 'var(--cms-text-soft)' }}>{deviceLog.deviceBrowser}</span>}
                            {deviceLog.deviceName && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--cms-warning-50)', color: 'var(--cms-warning)' }}>{deviceLog.deviceName}</span>}
                          </div>
                        )}
                        {/* Binding + last used dates */}
                        {(deviceLog.deviceBoundAt || deviceLog.deviceLastUsed) && (
                          <div className="flex flex-wrap gap-3 mt-2 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                            {deviceLog.deviceBoundAt && <span>{t(locale, 'students.common.bound')}: {dateLabel(deviceLog.deviceBoundAt, isArabic)}</span>}
                            {deviceLog.deviceLastUsed && <span>{t(locale, 'students.common.lastUsed')}: {dateLabel(deviceLog.deviceLastUsed, isArabic)}</span>}
                          </div>
                        )}
                      </article>
                    );
                  })()}

                  <article className="flex flex-col gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                    <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                      <MonitorSmartphone className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                      <strong className="text-sm font-semibold">{t(locale, 'students.sessions.revokeActiveTitle')}</strong>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'students.sessions.revokeActiveBody')}
                    </p>
                    {can('btn:students.revoke-session') && (
                      <button
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 self-start"
                        style={{ background: 'var(--cms-teal-700)' }}
                        disabled={busy}
                        onClick={() => openDialog({ kind: 'revoke-sessions', student: selected })}
                      >
                        <CalendarClock className="w-4 h-4" />
                        {t(locale, 'students.common.revokeSessions')}
                      </button>
                    )}
                  </article>

                  <article className="flex flex-col gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                    <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                      <LaptopMinimal className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                      <strong className="text-sm font-semibold">{t(locale, 'students.common.unbindDevice')}</strong>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'students.sessions.unbindBody')}
                    </p>
                    <button
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 self-start"
                      style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)', background: 'var(--cms-surface)' }}
                      disabled={busy}
                      onClick={() => openDialog({ kind: 'unbind-device', student: selected })}
                    >
                      {t(locale, 'students.common.unbindDevice')}
                    </button>
                  </article>

                  {/* P1-11: Sessions list */}
                  <article className="flex flex-col gap-2 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
                    <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                      <CalendarClock className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                      <strong className="text-sm font-semibold">{t(locale, 'students.sessions.listTitle')}</strong>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>{(sessions || []).length}</span>
                    </div>
                    {sessionsLoading ? (
                      <div className="flex items-center gap-2 py-3">
                        <LoaderCircle className="w-4 h-4 animate-spin" style={{ color: 'var(--cms-text-muted)' }} />
                        <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.common.loading')}</span>
                      </div>
                    ) : (sessions || []).length === 0 ? (
                      <p className="text-xs py-2" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.sessions.empty')}</p>
                    ) : (
                      <div className="flex flex-col gap-1.5 mt-1">
                        {(sessions || []).slice(0, 20).map(s => {
                          const isActive = s.status === 'Active';
                          return (
                            <div key={s.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0" style={{ borderColor: 'var(--cms-line)' }}>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'text-emerald-700 bg-emerald-50' : s.status === 'Revoked' ? 'text-red-700 bg-red-50' : 'text-amber-700 bg-amber-50'}`}>{sessionStatusLabel(s.status, locale)}</span>
                                  <span className="text-xs font-medium" style={{ color: 'var(--cms-text)' }}>{s.role}</span>
                                  {s.deviceType && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>{s.deviceType}</span>}
                                  {s.deviceOs && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-info-50)', color: 'var(--cms-info)' }}>{s.deviceOs}</span>}
                                  {s.deviceBrowser && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-ivory-200)', color: 'var(--cms-text-soft)' }}>{s.deviceBrowser}</span>}
                                </div>
                                <div className="flex gap-3 mt-1 text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                                  <span>{t(locale, 'students.sessions.created')}: {dateLabel(s.createdAt, isArabic)}</span>
                                  <span>{t(locale, 'students.sessions.lastActive')}: {dateLabel(s.lastActivityAt, isArabic)}</span>
                                  {s.revokedAt && <span style={{ color: 'var(--cms-danger)' }}>{t(locale, 'students.sessions.revoked')}: {dateLabel(s.revokedAt, isArabic)}</span>}
                                </div>
                              </div>
                              {isActive && can('btn:students.revoke-session') && (
                                <button
                                  onClick={() => setSessionRevokeTarget({ id: s.id, deviceName: s.deviceName, deviceType: s.deviceType })}
                                  disabled={revokingSession === s.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium text-red-700 border-red-200 hover:bg-red-50 disabled:opacity-50"
                                  title={t(locale, 'students.sessions.revokeThisTitle')}
                                >
                                  {revokingSession === s.id ? <LoaderCircle className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                                  {t(locale, 'students.common.revoke')}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                </div>
              )}

              {/* P1-01: Academic progress tab */}
              {drawerTab === 'academic' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpenCheck size={18} style={{ color: 'var(--cms-teal-600)' }} />
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t(locale, 'students.common.academicProgress')}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.common.university')}</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--cms-text)' }}>{selected.universityName || '—'}</div>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.common.college')}</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--cms-text)' }}>{selected.collegeName || '—'}</div>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.academic.questionsAnswered')}</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--cms-teal-700)' }}>{selected.questionsAnswered}</div>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.academic.accuracy')}</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--cms-success)' }}>{Math.round(selected.accuracy)}%</div>
                    </div>
                  </div>
                  {/* Per-subject progress from GET /admin/students/{id}/progress */}
                  <div className="mt-3">
                    <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.academic.perSubject')}</h4>
                    {studentProgressLoading ? (
                      <div className="flex items-center gap-2 py-3"><LoaderCircle size={14} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} /><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.common.loading')}</span></div>
                    ) : (studentProgress || []).length === 0 ? (
                      <div className="text-center py-6">
                        <BookOpenCheck size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
                        <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.academic.empty')}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(studentProgress || []).map(p => (
                          <div key={p.subjectId} className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium" style={{ color: 'var(--cms-text)' }}>{isArabic ? p.subjectName : (p.subjectNameEn || p.subjectName)}</span>
                              <span className="text-xs font-bold tabular-nums" style={{ color: p.accuracy >= 60 ? 'var(--cms-success)' : 'var(--cms-danger)' }}>{Math.round(p.accuracy)}%</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                              <span>{p.correctAnswers}/{p.questionsAnswered} {t(locale, 'students.academic.correct')}</span>
                              <span>·</span>
                              <span>{t(locale, 'students.academic.lastActivity')}: {new Date(p.lastActivityDate).toLocaleDateString(isArabic ? 'ar' : 'en')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* P1-01: Exams tab */}
              {drawerTab === 'exams' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardCheck size={18} style={{ color: 'var(--cms-teal-600)' }} />
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t(locale, 'students.exams.title')}</h3>
                  </div>
                  {examSessionsLoading ? (
                    <div className="flex items-center gap-2 py-3"><LoaderCircle size={14} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} /><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.common.loading')}</span></div>
                  ) : (examSessions || []).length === 0 ? (
                    <div className="text-center py-6">
                      <ClipboardCheck size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
                      <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.exams.empty')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(examSessions || []).map(es => (
                        <div key={es.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium truncate" style={{ color: 'var(--cms-text)' }}>{es.examTitle}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                              background: es.passed ? 'rgba(34,197,94,0.12)' : 'rgba(255,82,82,0.12)',
                              color: es.passed ? 'var(--cms-success)' : 'var(--cms-danger)'
                            }}>{es.passed === null ? t(locale, 'students.exams.inProgress') : es.passed ? t(locale, 'students.exams.passed') : t(locale, 'students.exams.failed')}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                            <span>{t(locale, 'students.exams.score')}: {es.score !== null ? Math.round(es.score) + '%' : '—'}</span>
                            <span>·</span>
                            <span>{es.correctAnswers}/{es.totalQuestions}</span>
                            <span>·</span>
                            <span>{new Date(es.startedAt).toLocaleDateString(isArabic ? 'ar' : 'en')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* P1-01: Subscriptions tab */}
              {drawerTab === 'subscriptions' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <KeyRound size={18} style={{ color: 'var(--cms-teal-600)' }} />
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t(locale, 'students.subscriptions.title')}</h3>
                  </div>
                  {subscriptionsLoading ? (
                    <div className="flex items-center gap-2 py-3"><LoaderCircle size={14} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} /><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.common.loading')}</span></div>
                  ) : (subscriptions || []).length === 0 ? (
                    <div className="text-center py-6">
                      <KeyRound size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
                      <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.subscriptions.empty')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(subscriptions || []).map(s => {
                        const isActive = s.status === 'Active' && !s.revokedAt && new Date(s.expiresAt) > new Date();
                        return (
                          <div key={s.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium" style={{ color: 'var(--cms-text)' }}>{t(locale, 'students.subscriptions.scopeLabel')}: {subscriptionScopeLabel(s.scopeType, locale)}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                                background: isActive ? 'rgba(34,197,94,0.12)' : 'rgba(255,159,28,0.12)',
                                color: isActive ? 'var(--cms-success)' : 'var(--cms-warning)'
                              }}>{isActive ? t(locale, 'students.subscriptions.active') : t(locale, 'students.subscriptions.expired')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                              <span>{t(locale, 'students.subscriptions.from')}: {new Date(s.startsAt).toLocaleDateString(isArabic ? 'ar' : 'en')}</span>
                              <span>·</span>
                              <span>{t(locale, 'students.subscriptions.until')}: {new Date(s.expiresAt).toLocaleDateString(isArabic ? 'ar' : 'en')}</span>
                            </div>
                            {s.revokedAt && (
                              <div className="text-[11px] mt-1" style={{ color: 'var(--cms-danger)' }}>
                                {t(locale, 'students.subscriptions.revokedAt')}: {new Date(s.revokedAt).toLocaleDateString(isArabic ? 'ar' : 'en')}
                                {s.revocationReason ? ` — ${s.revocationReason}` : ''}
                              </div>
                            )}
                            {isActive && can('btn:codes.revoke') && (
                              <button
                                onClick={() => setSubscriptionRevokeTarget({ id: s.id, scopeType: s.scopeType, expiresAt: s.expiresAt })}
                                disabled={revokingSubscription}
                                className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium text-red-700 border-red-200 hover:bg-red-50 disabled:opacity-50"
                                title={t(locale, 'students.subscriptions.revokeThisTitle')}
                              >
                                <Ban className="w-3 h-3" />
                                {t(locale, 'students.subscriptions.revokeTitle')}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* P1-01: Reports tab */}
              {drawerTab === 'reports' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileWarning size={18} style={{ color: 'var(--cms-teal-600)' }} />
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t(locale, 'students.reports.title')}</h3>
                  </div>
                  {studentReportsLoading ? (
                    <div className="flex items-center gap-2 py-3"><LoaderCircle size={14} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} /><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.common.loading')}</span></div>
                  ) : (studentReports || []).length === 0 ? (
                    <div className="text-center py-6">
                      <FileWarning size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
                      <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.reports.empty')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(studentReports || []).map(r => (
                        <div key={r.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium truncate" style={{ color: 'var(--cms-text)' }}>{r.questionText.slice(0, 80)}{r.questionText.length > 80 ? '…' : ''}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                              background: r.status === 'Pending' ? 'rgba(255,159,28,0.12)' : r.status === 'Resolved' ? 'rgba(34,197,94,0.12)' : 'rgba(13,116,107,0.12)',
                              color: r.status === 'Pending' ? 'var(--cms-warning)' : r.status === 'Resolved' ? 'var(--cms-success)' : 'var(--cms-teal-600)'
                            }}>{reportReasonLabel(r.reason, locale)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                            <span>{t(locale, 'students.common.status')}: {reportStatusLabel(r.status, locale)}</span>
                            <span>·</span>
                            <span>{new Date(r.createdAt).toLocaleDateString(isArabic ? 'ar' : 'en')}</span>
                          </div>
                          {r.description && (
                            <p className="text-[11px] mt-1" style={{ color: 'var(--cms-text-muted)' }}>{r.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
        </div>
        )}
      </DetailDrawer>

      {/* ===== W3 (admin-ui): confirm gates for the drawer's destructive actions ===== */}
      <ConfirmDialog
        open={sessionRevokeTarget !== null}
        onOpenChange={(next) => { if (!next) setSessionRevokeTarget(null); }}
        title={t(locale, 'students.sessions.revokeConfirmTitle')}
        description={t(locale, 'students.sessions.revokeConfirmBody')}
        confirmLabel={t(locale, 'students.common.revoke')}
        cancelLabel={t(locale, 'students.common.cancel')}
        variant="danger"
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={sessionRevokeTarget != null && revokingSession === sessionRevokeTarget.id}
        onConfirm={() => { if (sessionRevokeTarget) void revokeSession(sessionRevokeTarget.id); }}
        testId="session-revoke-confirm"
      />
      <ConfirmDialog
        open={subscriptionRevokeTarget !== null}
        onOpenChange={(next) => { if (!next) setSubscriptionRevokeTarget(null); }}
        title={t(locale, 'students.subscriptions.revokeTitle')}
        description={t(locale, 'students.subscriptions.revokeBody', { scope: subscriptionScopeLabel(subscriptionRevokeTarget?.scopeType ?? '', 'ar') })}
        confirmLabel={t(locale, 'students.subscriptions.confirmRevoke')}
        cancelLabel={t(locale, 'students.common.cancel')}
        variant="danger"
        requireReason={{ label: t(locale, 'students.subscriptions.revokeReasonLabel'), placeholder: t(locale, 'students.subscriptions.revokeReasonPlaceholder') }}
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={revokingSubscription}
        onConfirm={(reason) => { if (subscriptionRevokeTarget && reason) void revokeSubscription(subscriptionRevokeTarget.id, reason); }}
        testId="subscription-revoke-confirm"
      />

      {/* P1-01: Edit profile modal — shared Dialog shell (Command Center final pass) */}
      <Dialog
        open={editStudent !== null}
        onOpenChange={(next) => { if (!next && !busy && !avatarBusy) { setEditStudent(null); setAvatarPreview(null); } }}
        title={t(locale, 'students.common.editProfile')}
        description={editStudent?.fullName}
        dir={isArabic ? 'rtl' : 'ltr'}
        size="md"
        dismissGuard={busy || avatarBusy}
        testId="student-edit-dialog"
      >
        {editStudent && (
          <form onSubmit={submitEdit} className="space-y-4 px-5 py-4">
              {/* Avatar upload */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--cms-teal-700), var(--cms-teal-500))' }}>
                  {avatarPreview ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" /> : editStudent.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors" style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}>
                    {avatarBusy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    {t(locale, 'students.editModal.uploadAvatar')}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} disabled={avatarBusy} />
                  </label>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'students.editModal.avatarHint')}</p>
                </div>
              </div>
              {/* Full name */}
              <div>
                <label className="block">
                  <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'students.common.fullName')}</span>
                  <input
                    required
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                  />
                </label>
              </div>
              {/* Gender */}
              <div>
                <label className="block">
                  <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'students.editModal.gender')}</span>
                  <select
                    value={editForm.gender}
                    onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                  >
                    <option value="">{t(locale, 'students.common.notSpecified')}</option>
                    <option value="male">{t(locale, 'students.common.male')}</option>
                    <option value="female">{t(locale, 'students.common.female')}</option>
                  </select>
                </label>
              </div>
              {/* Phone (read-only) */}
              <div>
                <label className="block">
                  <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'students.editModal.phone')}</span>
                  <input
                    value={editStudent.phone}
                    disabled
                    className="w-full px-3 py-2 rounded-lg border text-sm opacity-60"
                    style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)', color: 'var(--cms-text-soft)' }}
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-2" style={{ borderColor: 'var(--cms-line)' }}>
                <button type="button" onClick={() => { setEditStudent(null); setAvatarPreview(null); }} disabled={busy} className="px-4 py-2 rounded-lg border text-sm font-medium" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}>
                  {t(locale, 'students.common.cancel')}
                </button>
                <button type="submit" disabled={busy} className="inline-flex min-w-32 items-center justify-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: 'var(--cms-teal-700)' }}>
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {busy ? t(locale, 'students.editModal.saving') : t(locale, 'students.editModal.save')}
                </button>
              </div>
            </form>
        )}
      </Dialog>

      {/* ===== Protected-action dialog — shared Dialog shell (danger separated) ===== */}
      <Dialog
        open={dialog !== null}
        onOpenChange={(next) => { if (!next && !busy) setDialog(null); }}
        title={dialogTitle}
        description={t(locale, 'students.dialog.protectedAction')}
        dir={isArabic ? 'rtl' : 'ltr'}
        size="md"
        dismissGuard={busy}
        testId="student-protected-dialog"
      >
        {dialog && (
          <form onSubmit={executeDialog} className="space-y-4 px-5 py-4">
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                <p className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{dialog.student.fullName}</p>
                <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{dialog.student.phone || '—'}</p>
              </div>
              {dialog.kind === 'ban' && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'students.dialog.banReason')}
                    </label>
                    <textarea
                      required
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={t(locale, 'students.dialog.banReasonPlaceholder')}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      style={{ borderColor: 'var(--cms-line-strong)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'students.dialog.optionalExpiry')}
                    </label>
                    <input
                      type="date"
                      value={banUntil}
                      onChange={(event) => setBanUntil(event.target.value)}
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      style={{ borderColor: 'var(--cms-line-strong)' }}
                    />
                  </div>
                </>
              )}
              <div
                className="flex items-start gap-2 rounded-lg border p-3 text-xs"
                style={{ background: 'var(--cms-warning-50)', borderColor: 'var(--cms-warning)', color: 'var(--cms-warning)' }}
              >
                <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{dialogScopeNote}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                  style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
                  onClick={() => setDialog(null)}
                  disabled={busy}
                >
                  {t(locale, 'students.common.cancel')}
                </button>
                <button
                  type="submit"
                  className="inline-flex min-w-32 items-center justify-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
                  style={{ background: dialog.kind === 'ban' ? 'var(--cms-danger)' : 'var(--cms-teal-700)' }}
                  disabled={busy}
                >
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : dialog.kind === 'ban' ? <Ban className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                  {busy ? t(locale, 'students.dialog.executing') : dialogConfirm}
                </button>
              </div>
            </form>
        )}
      </Dialog>

      {/* ITEM-3-STUDENT-CREATE: create-student modal — shared Dialog shell */}
      <Dialog
        open={createOpen}
        onOpenChange={(next) => { if (!next && !createBusy) setCreateOpen(false); }}
        title={t(locale, 'students.createModal.title')}
        description={t(locale, 'students.common.userManagement')}
        dir={isArabic ? 'rtl' : 'ltr'}
        size="lg"
        dismissGuard={createBusy}
        testId="student-create-dialog"
      >
        {createOpen && (
          <form onSubmit={submitCreate} className="space-y-4 overflow-y-auto px-5 py-4">
              {/* Full name */}
              <div>
                <label className="block">
                  <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                    {t(locale, 'students.common.fullName')} <span style={{ color: 'var(--cms-danger)' }}>*</span>
                  </span>
                  <input
                    required
                    value={createForm.fullName}
                    onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)' }}
                  />
                </label>
              </div>
              {/* Phone + Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'students.createModal.phone')} <span style={{ color: 'var(--cms-danger)' }}>*</span>
                    </span>
                    <input
                      required
                      inputMode="tel"
                      dir="ltr"
                      pattern="09\d{8}"
                      maxLength={10}
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value.replace(/[^\d]/g, '') })}
                      placeholder="09XXXXXXXX"
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-left"
                      style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)' }}
                    />
                  </label>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--cms-text-muted)' }}>
                    {t(locale, 'students.createModal.phoneHint')}
                  </p>
                </div>
                <div>
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'students.createModal.password')} <span style={{ color: 'var(--cms-danger)' }}>*</span>
                    </span>
                    <input
                      required
                      type="password"
                      minLength={8}
                      value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)' }}
                    />
                  </label>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--cms-text-muted)' }}>
                    {t(locale, 'students.createModal.passwordHint')}
                  </p>
                </div>
              </div>
              {/* University → College → Academic year cascade */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'students.common.university')} <span style={{ color: 'var(--cms-danger)' }}>*</span>
                    </span>
                    <select
                    required
                    value={createUniversityId}
                    onChange={(e) => void chooseCreateUniversity(e.target.value)}
                    aria-label={t(locale, 'students.common.university')}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)' }}
                  >
                    <option value="">{t(locale, 'students.createModal.chooseUniversity')}</option>
                    {universities.map((u) => (
                      <option key={u.id} value={u.id}>{isArabic ? u.nameAr : (u.nameEn || u.nameAr)}</option>
                    ))}
                  </select>
                  </label>
                </div>
                <div>
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'students.common.college')} <span style={{ color: 'var(--cms-danger)' }}>*</span>
                    </span>
                    <select
                    required
                    value={createCollegeId}
                    onChange={(e) => void chooseCreateCollege(e.target.value)}
                    disabled={!createUniversityId}
                    aria-label={t(locale, 'students.common.college')}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
                    style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)' }}
                  >
                    <option value="">{t(locale, 'students.createModal.chooseCollege')}</option>
                    {createColleges.map((c) => (
                      <option key={c.id} value={c.id}>{isArabic ? c.nameAr : (c.nameEn || c.nameAr)}</option>
                    ))}
                  </select>
                  </label>
                </div>
                <div>
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'students.createModal.year')} <span style={{ color: 'var(--cms-danger)' }}>*</span>
                    </span>
                    <select
                    required
                    value={createYearId}
                    onChange={(e) => setCreateYearId(e.target.value)}
                    disabled={!createCollegeId}
                    aria-label={t(locale, 'students.createModal.year')}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
                    style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)' }}
                  >
                    <option value="">{t(locale, 'students.createModal.chooseYear')}</option>
                    {createYears.map((y) => (
                      <option key={y.id} value={y.id}>{isArabic ? y.nameAr : (y.nameEn || y.nameAr)}</option>
                    ))}
                  </select>
                  </label>
                </div>
              </div>
              {/* Gender + Email (both optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'students.createModal.genderOptional')}
                    </span>
                    <select
                    value={createForm.gender}
                    onChange={(e) => setCreateForm({ ...createForm, gender: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)' }}
                  >
                    <option value="">{t(locale, 'students.common.notSpecified')}</option>
                    <option value="male">{t(locale, 'students.common.male')}</option>
                    <option value="female">{t(locale, 'students.common.female')}</option>
                  </select>
                  </label>
                </div>
                <div>
                  <label className="block">
                    <span className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {t(locale, 'students.createModal.emailOptional')}
                    </span>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)' }}
                    />
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-2" style={{ borderColor: 'var(--cms-line)' }}>
                <button type="button" onClick={() => !createBusy && setCreateOpen(false)} disabled={createBusy} className="px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-50" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}>
                  {t(locale, 'students.common.cancel')}
                </button>
                <button type="submit" disabled={createBusy} className="inline-flex min-w-32 items-center justify-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: 'var(--cms-teal-700)' }}>
                  {createBusy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {createBusy ? t(locale, 'students.createModal.creating') : t(locale, 'students.createModal.submit')}
                </button>
              </div>
            </form>
        )}
      </Dialog>

      {/* ===== Confirm unban — shared ConfirmDialog ===== */}
      <ConfirmDialog
        open={confirmUnban !== null}
        onOpenChange={(next) => { if (!next) setConfirmUnban(null); }}
        title={t(locale, 'students.unban.question', { name: confirmUnban?.fullName ?? '' })}
        description={t(locale, 'students.unban.description')}
        confirmLabel={t(locale, 'students.common.reactivate')}
        cancelLabel={t(locale, 'students.common.cancel')}
        variant="primary"
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={busy}
        onConfirm={() => { if (confirmUnban) void unban(confirmUnban).finally(() => setConfirmUnban(null)); }}
        testId="student-unban-confirm"
      />

      {/* ===== PR-6 — password reset dialog (contract A) =====
          Typed confirmation (the student's phone number) mirrors the
          HardDeleteDialog pattern; the actor password re-auths the admin.
          The new password is never logged or re-rendered after submit. */}
      <Dialog
        open={resetTarget !== null}
        onOpenChange={(next) => {
          if (!next && !resetBusy) {
            setResetTarget(null);
            setResetForm({ actorPassword: '', newPassword: '', confirmPassword: '', typedConfirm: '' });
            setResetError('');
          }
        }}
        title={t(locale, 'students.passwordReset.title')}
        description={t(locale, 'students.passwordReset.subtitle')}
        dir={isArabic ? 'rtl' : 'ltr'}
        size="md"
        dismissGuard={resetBusy}
        testId="student-password-reset-dialog"
      >
        {resetTarget && (
          <form className="px-5 py-4 space-y-4" onSubmit={submitPasswordReset} data-testid="student-password-reset-form">
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
              <p className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{resetTarget.fullName}</p>
              <p className="text-xs font-mono" dir="ltr" style={{ color: 'var(--cms-text-muted)' }} data-testid="reset-target-phone">{resetTarget.phone || '—'}</p>
            </div>
            <p className="flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed" style={{ background: 'var(--cms-warning-50)', borderColor: 'var(--cms-warning)', color: 'var(--cms-warning)' }} role="alert">
              <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{t(locale, 'students.passwordReset.consequence')}</span>
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'students.passwordReset.actorPassword')}</span>
              <input
                type="password"
                value={resetForm.actorPassword}
                onChange={(event) => setResetForm({ ...resetForm, actorPassword: event.target.value })}
                autoComplete="current-password"
                required
                data-testid="reset-actor-password"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'students.passwordReset.newPassword')}</span>
                <input
                  type="password"
                  value={resetForm.newPassword}
                  onChange={(event) => setResetForm({ ...resetForm, newPassword: event.target.value })}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  data-testid="reset-new-password"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'students.passwordReset.confirmPassword')}</span>
                <input
                  type="password"
                  value={resetForm.confirmPassword}
                  onChange={(event) => setResetForm({ ...resetForm, confirmPassword: event.target.value })}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  data-testid="reset-confirm-password"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                />
              </label>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resetForce}
                onChange={(event) => setResetForce(event.target.checked)}
                disabled={resetBusy}
                data-testid="reset-force-change"
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-xs leading-relaxed" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'students.passwordReset.forceLabel')}</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'students.passwordReset.typedConfirmLabel')}
              </span>
              <input
                type="text"
                inputMode="tel"
                dir="ltr"
                value={resetForm.typedConfirm}
                onChange={(event) => setResetForm({ ...resetForm, typedConfirm: event.target.value })}
                placeholder={t(locale, 'students.passwordReset.typedConfirmPlaceholder')}
                data-testid="reset-typed-confirm"
                className="w-full px-3 py-2 rounded-lg border text-sm text-left"
                style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
              />
              <span className="block text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                {t(locale, 'students.passwordReset.typedConfirmHint')}
              </span>
            </label>
            {resetError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert" data-testid="reset-error">{resetError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1 border-t" style={{ borderColor: 'var(--cms-line)' }}>
              <button
                type="button"
                onClick={() => {
                  setResetTarget(null);
                  setResetForm({ actorPassword: '', newPassword: '', confirmPassword: '', typedConfirm: '' });
                  setResetError('');
                }}
                disabled={resetBusy}
                className="px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
              >
                {t(locale, 'students.common.cancel')}
              </button>
              <button
                type="submit"
                disabled={resetBusy
                  || resetForm.typedConfirm.trim() !== (resetTarget.phone || '')
                  || !resetForm.actorPassword
                  || !resetForm.newPassword
                  || resetForm.newPassword !== resetForm.confirmPassword}
                data-testid="reset-submit"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--cms-danger)' }}
              >
                {resetBusy && <LoaderCircle className="w-4 h-4 animate-spin" />}
                {t(locale, 'students.passwordReset.submit')}
              </button>
            </div>
          </form>
        )}
      </Dialog>

      {/* ===== PR-6 — archive / restore confirm (contract D) ===== */}
      <ConfirmDialog
        open={lifecycleTarget !== null}
        onOpenChange={(next) => { if (!next && !lifecycleBusy) setLifecycleTarget(null); }}
        title={lifecycleTarget?.mode === 'archive'
          ? t(locale, 'students.archive.archiveTitle')
          : t(locale, 'students.archive.restoreTitle')}
        description={lifecycleTarget?.mode === 'archive'
          ? t(locale, 'students.archive.archiveBody')
          : t(locale, 'students.archive.restoreBody')}
        confirmLabel={lifecycleTarget?.mode === 'archive'
          ? t(locale, 'students.archive.archiveConfirm')
          : t(locale, 'students.archive.restoreConfirm')}
        cancelLabel={t(locale, 'students.common.cancel')}
        variant={lifecycleTarget?.mode === 'archive' ? 'danger' : 'primary'}
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={lifecycleBusy}
        onConfirm={() => { if (lifecycleTarget) void executeLifecycle(lifecycleTarget); }}
        testId="student-lifecycle-confirm"
      />
    </section>
  );
}
