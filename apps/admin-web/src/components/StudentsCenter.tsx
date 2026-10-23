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
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Ban, CalendarClock, ChevronLeft, ChevronRight, CircleAlert,
  Eye, LaptopMinimal, LoaderCircle, MonitorSmartphone, RotateCcw,
  Search, ShieldAlert, ShieldCheck, UserRound, Users, X,
  Pencil, Camera, Check, BookOpenCheck, ClipboardCheck, KeyRound, FileWarning,
} from 'lucide-react';
import { ApiError, apiRequest, type PagedResult } from '../lib/api';

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
};

type University = { id: string; nameAr: string; nameEn?: string | null };
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

type DrawerTab = 'overview' | 'academic' | 'exams' | 'subscriptions' | 'sessions' | 'security' | 'reports';

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const PAGE_SIZE = 20;

const statusLabel = (status: string, isArabic: boolean) => {
  const value = status.toLowerCase();
  if (value === 'active') return isArabic ? 'نشط' : 'Active';
  if (value === 'banned') return isArabic ? 'محظور' : 'Banned';
  if (value === 'suspended') return isArabic ? 'معلّق' : 'Suspended';
  if (value === 'pending') return isArabic ? 'قيد المراجعة' : 'Pending';
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
        onError(isArabic ? 'لا تملك صلاحية عرض الطلاب ضمن نطاقك الحالي.' : 'You do not have permission to view students within your current scope.');
      } else {
        onError(error instanceof Error ? error.message : 'Unable to load students.');
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
    // P1-11: fetch sessions in parallel with security logs + detail tabs data
    setSessionsLoading(true);
    setExamSessionsLoading(true);
    setSubscriptionsLoading(true);
    setStudentReportsLoading(true);
    setStudentProgressLoading(true);
    Promise.all([
      request<SecurityLog[]>(`/api/v1/security/students/${student.id}/logs?count=50`)
        .then(data => setSecurityLogs(data))
        .catch(error => {
          if (error instanceof ApiError && error.status === 403) {
            onError(isArabic ? 'لا تملك صلاحية عرض السجل الأمني لهذا الطالب.' : 'You do not have permission to view this student\u2019s security log.');
          } else {
            onError(error instanceof Error ? error.message : 'Unable to load the security log.');
          }
        }),
      // P1-11: fetch student sessions
      request<typeof sessions>(`/api/v1/security/students/${student.id}/sessions`)
        .then(data => setSessions(Array.isArray(data) ? data : []))
        .catch(() => { /* sessions are optional — don't block the drawer */ })
        .finally(() => setSessionsLoading(false)),
      // P1-01: fetch exam sessions for the Exams tab
      request<{ items: typeof examSessions }>(`/api/v1/admin/students/${student.id}/exam-sessions`)
        .then(data => setExamSessions(data.items || []))
        .catch(() => { /* best-effort — don't block the drawer */ })
        .finally(() => setExamSessionsLoading(false)),
      // P1-01: fetch subscriptions for the Subscriptions tab
      request<{ items: typeof subscriptions }>(`/api/v1/admin/students/${student.id}/subscriptions`)
        .then(data => setSubscriptions(data.items || []))
        .catch(() => { /* best-effort */ })
        .finally(() => setSubscriptionsLoading(false)),
      // P1-01: fetch error reports for the Reports tab
      request<{ items: typeof studentReports }>(`/api/v1/admin/students/${student.id}/reports`)
        .then(data => setStudentReports(data.items || []))
        .catch(() => { /* best-effort */ })
        .finally(() => setStudentReportsLoading(false)),
      // P1-01: fetch per-subject progress for the Academic tab
      request<{ items: typeof studentProgress }>(`/api/v1/admin/students/${student.id}/progress`)
        .then(data => setStudentProgress(data.items || []))
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
      onNotice(isArabic ? 'تم إنهاء الجلسة' : 'Session revoked');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : isArabic ? 'فشل إنهاء الجلسة' : 'Revoke failed';
      onError(msg);
    } finally { setRevokingSession(null); }
  };

  const closeDrawer = () => {
    setSelected(null);
    setDrawerTab('overview');
    setSecurityLogs([]);
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
      onError(isArabic ? 'أدخل سبب الحظر قبل المتابعة.' : 'Provide a ban reason before continuing.');
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
        onNotice(isArabic ? 'تم حظر الطالب وإنهاء جلساته وفق سياسة الخادم.' : 'Student banned and their sessions were handled by the server policy.');
      }
      if (dialog.kind === 'revoke-sessions') {
        await request(`/api/v1/admin/students/${dialog.student.id}/revoke-sessions`, { method: 'POST' });
        onNotice(isArabic ? 'تم إنهاء جميع الجلسات النشطة للطالب.' : 'All active student sessions were revoked.');
      }
      if (dialog.kind === 'unbind-device') {
        await request(`/api/v1/security/students/${dialog.student.id}/unbind-device`, { method: 'POST' });
        onNotice(isArabic ? 'تم إلغاء ربط جهاز الطالب. سيُعاد التحقق عند الدخول التالي.' : 'Student device binding was removed. It will be verified again at the next sign-in.');
      }
      const studentRef = dialog.student;
      setDialog(null);
      await loadStudents(page);
      if (selected?.id === studentRef.id) await openStudent(studentRef);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The protected action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const unban = async (student: StudentRecord) => {
    setBusy(true);
    try {
      await request(`/api/v1/admin/students/${student.id}/unban`, { method: 'POST' });
      onNotice(isArabic ? 'تمت إعادة تفعيل حساب الطالب.' : 'Student account reactivated.');
      await loadStudents(page);
      if (selected?.id === student.id) await openStudent(student);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to reactivate the student.');
    } finally {
      setBusy(false);
    }
  };

  const dialogTitle = dialog ? (
    dialog.kind === 'ban' ? (isArabic ? 'حظر حساب الطالب' : 'Ban student account')
      : dialog.kind === 'revoke-sessions' ? (isArabic ? 'إنهاء جلسات الطالب' : 'Revoke student sessions')
        : (isArabic ? 'إلغاء ربط جهاز الطالب' : 'Unbind student device')
  ) : '';

  const dialogConfirm = dialog ? (
    dialog.kind === 'ban' ? (isArabic ? 'تأكيد الحظر' : 'Confirm ban')
      : dialog.kind === 'revoke-sessions' ? (isArabic ? 'إنهاء الجلسات' : 'Revoke sessions')
        : (isArabic ? 'تأكيد إلغاء الربط' : 'Confirm unbind')
  ) : '';

  const dialogScopeNote = dialog ? (
    dialog.kind === 'revoke-sessions'
      ? (isArabic ? 'سيؤدي هذا إلى إنهاء وصول الطالب من جميع الأجهزة. لا يمكن التراجع عن الجلسات المنتهية.' : 'This ends the student\u2019s access on every device. Revoked sessions cannot be restored.')
      : dialog.kind === 'unbind-device'
        ? (isArabic ? 'سيطلب الخادم التحقق وربط الجهاز عند الدخول التالي. لا يحذف هذا الإجراء سجل الأحداث.' : 'The server will verify and bind a device at the next sign-in. This action preserves event history.')
        : (isArabic ? 'يُسجل الخادم هذا الإجراء الحساس. يمكن ترك تاريخ الانتهاء فارغاً للحظر المفتوح وفق السياسة.' : 'The server records this sensitive action. Leave expiry empty for an open-ended ban where policy permits.')
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
      onNotice(isArabic ? 'تم تحديث ملف الطالب' : 'Student profile updated');
      setStudents(prev => prev.map(s => s.id === editStudent.id ? { ...s, fullName: editForm.fullName.trim(), gender: editForm.gender || null } : s));
      setEditStudent(null);
      setAvatarPreview(null);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : isArabic ? 'فشل التحديث' : 'Update failed';
      onError(msg);
    } finally { setBusy(false); }
  };

  // P1-01: upload avatar
  const uploadAvatar = async (file: File) => {
    if (!editStudent) return;
    if (file.size > 3 * 1024 * 1024) { onError(isArabic ? 'الصورة كبيرة جداً (الحد 3MB)' : 'Image too large (max 3MB)'); return; }
    setAvatarBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiRequest<{ previewUrl: string }>(`/api/v1/admin/students/${editStudent.id}/avatar`, token, {
        method: 'POST',
        body: formData,
      });
      setAvatarPreview(res.previewUrl);
      onNotice(isArabic ? 'تم رفع الصورة الشخصية' : 'Avatar uploaded');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : isArabic ? 'فشل رفع الصورة' : 'Avatar upload failed';
      onError(msg);
    } finally { setAvatarBusy(false); }
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
              {isArabic ? 'إدارة المستخدمين' : 'User management'}
            </p>
            <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
              {isArabic ? 'الطلاب' : 'Students'}
              <span
                className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold"
                style={{ background: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)' }}
              >
                {total}
              </span>
            </h2>
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--cms-text-soft)' }}>
              {isArabic
                ? 'تُعرض النتائج وتُنفّذ الإجراءات ضمن نطاق المدير وصلاحياته من الخادم.'
                : 'Results and protected actions are constrained by the acting administrator\u2019s server-side scope and permissions.'}
            </p>
          </div>
        </div>
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
            placeholder={isArabic ? 'ابحث بالاسم أو رقم الهاتف' : 'Search name or phone'}
            className="w-full pr-10 pl-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            style={{ borderColor: 'var(--cms-line-strong)' }}
          />
        </div>
        <select
          value={universityId}
          onChange={(event) => setUniversityId(event.target.value)}
          className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <option value="">{isArabic ? 'الجامعة: الكل' : 'University: All'}</option>
          {universityOptions.map((university) => (
            <option key={university.id} value={university.id}>{university.label}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          <option value="">{isArabic ? 'الحالة: الكل' : 'Status: All'}</option>
          <option value="Active">{isArabic ? 'نشط' : 'Active'}</option>
          <option value="Banned">{isArabic ? 'محظور' : 'Banned'}</option>
          <option value="Suspended">{isArabic ? 'معلّق' : 'Suspended'}</option>
          <option value="Pending">{isArabic ? 'قيد المراجعة' : 'Pending'}</option>
        </select>
        {filtersActive && (
          <button
            onClick={() => { setQuery(''); setStatus(''); setUniversityId(''); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors"
            style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
          >
            <X className="w-4 h-4" />
            {isArabic ? 'إزالة التصفية' : 'Clear filters'}
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
              ? (isArabic ? 'لا توجد نتائج مطابقة' : 'No matching results')
              : (isArabic ? 'لا يوجد طلاب ضمن نطاقك بعد.' : 'No students are available in your scope yet.')}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {isArabic ? 'عدّل عوامل التصفية أو أعد المحاولة لاحقاً.' : 'Adjust the filters or try again later.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: 'var(--cms-line)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-muted)' }}>
              <tr>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الطالب' : 'Student'}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'المسار الأكاديمي' : 'Academic path'}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'الحالة' : 'Status'}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'التفاعل' : 'Activity'}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">{isArabic ? 'آخر دخول' : 'Last sign-in'}</th>
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider"><span className="sr-only">{isArabic ? 'إجراءات' : 'Actions'}</span></th>
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
                            {isArabic ? `سُجّل في ${dateLabel(student.createdAt, isArabic)}` : `Registered ${dateLabel(student.createdAt, isArabic)}`}
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
                        {statusLabel(student.status, isArabic)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold" style={{ color: 'var(--cms-text)' }}>{student.questionsAnswered}</div>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                        {isArabic ? `${Math.round(student.accuracy)}% دقة` : `${Math.round(student.accuracy)}% accuracy`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--cms-text-soft)' }}>{dateLabel(student.lastLogin, isArabic)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {/* P1-01: Edit profile button */}
                        <button
                          title={isArabic ? 'تعديل الملف' : 'Edit profile'}
                          onClick={() => { setEditStudent(student); setEditForm({ fullName: student.fullName, gender: student.gender ?? '' }); }}
                          className="p-1.5 rounded-md transition-colors"
                          style={{ color: 'var(--cms-text-muted)' }}
                          onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-50)'; event.currentTarget.style.color = 'var(--cms-teal-700)'; }}
                          onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = 'var(--cms-text-muted)'; }}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          title={isArabic ? 'عرض الملف والسجل الأمني' : 'View profile and security log'}
                          onClick={() => void openStudent(student)}
                          className="p-1.5 rounded-md transition-colors"
                          style={{ color: 'var(--cms-text-muted)' }}
                          onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--cms-teal-50)'; event.currentTarget.style.color = 'var(--cms-teal-700)'; }}
                          onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = 'var(--cms-text-muted)'; }}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {active ? (
                          <button
                            className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                            title={isArabic ? 'حظر الحساب' : 'Ban account'}
                            disabled={busy}
                            onClick={() => openDialog({ kind: 'ban', student })}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title={isArabic ? 'إعادة التفعيل' : 'Reactivate'}
                            disabled={busy}
                            onClick={() => setConfirmUnban(student)}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
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
              {isArabic
                ? `النتائج ${pageStart}–${pageEnd} من ${total}`
                : `Showing ${pageStart}–${pageEnd} of ${total}`}
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
                {isArabic ? 'السابق' : 'Previous'}
              </button>
              <span className="text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>
                {isArabic ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
              </span>
              <button
                type="button"
                onClick={() => void loadStudents(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
              >
                {isArabic ? 'التالي' : 'Next'}
                {isArabic ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Slide-in drawer ===== */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            role="presentation"
            onMouseDown={() => !busy && closeDrawer()}
          />
          <aside
            aria-label={isArabic ? 'تفاصيل الطالب' : 'Student details'}
            className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md lg:max-w-lg bg-white shadow-2xl flex flex-col"
            style={{ borderInlineStart: '1px solid var(--cms-line)' }}
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {/* Drawer header */}
            <header
              className="flex items-start justify-between gap-4 p-5 border-b"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-base font-semibold text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--cms-teal-700), var(--cms-teal-500))' }}
                >
                  {selected.fullName?.[0]?.toUpperCase() ?? 'S'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                    {isArabic ? 'ملف الطالب' : 'Student record'}
                  </p>
                  <h3 className="text-lg font-bold truncate" style={{ color: 'var(--cms-text)' }}>{selected.fullName}</h3>
                  <p className="text-xs truncate" style={{ color: 'var(--cms-text-muted)' }}>
                    {selected.phone || '—'} · {selected.universityName || '—'} / {selected.collegeName || '—'}
                  </p>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                aria-label={isArabic ? 'إغلاق التفاصيل' : 'Close details'}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--cms-text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            {/* Drawer tabs */}
            <nav
              className="flex border-b"
              style={{ borderColor: 'var(--cms-line)' }}
              role="tablist"
            >
              {([
                { key: 'overview', label: isArabic ? 'المعلومات الأساسية' : 'Basic info' },
                { key: 'academic', label: isArabic ? 'التقدم الدراسي' : 'Academic progress' },
                { key: 'exams', label: isArabic ? 'الاختبارات' : 'Exams' },
                { key: 'subscriptions', label: isArabic ? 'الاشتراكات' : 'Subscriptions' },
                { key: 'sessions', label: isArabic ? 'الجلسات والأجهزة' : 'Sessions & devices' },
                { key: 'security', label: isArabic ? 'السجل الأمني' : 'Security log' },
                { key: 'reports', label: isArabic ? 'البلاغات' : 'Reports' },
              ] as { key: DrawerTab; label: string }[]).map((tab) => {
                const active = drawerTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setDrawerTab(tab.key)}
                    className="flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2"
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

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {drawerTab === 'overview' && (
                <>
                  <div
                    className="rounded-lg border p-4"
                    style={{ background: 'var(--cms-ivory-50)', borderColor: 'var(--cms-line)' }}
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                          {isArabic ? 'الحالة' : 'Status'}
                        </p>
                        <span className={`mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(selected.status)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                          {statusLabel(selected.status, isArabic)}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                          {isArabic ? 'آخر دخول' : 'Last sign-in'}
                        </p>
                        <p className="mt-1 text-sm" style={{ color: 'var(--cms-text)' }}>{dateLabel(selected.lastLogin, isArabic)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                          {isArabic ? 'إجابات' : 'Answers'}
                        </p>
                        <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{selected.questionsAnswered}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                          {isArabic ? 'دقة' : 'Accuracy'}
                        </p>
                        <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{Math.round(selected.accuracy)}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <article className="flex flex-col gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                        <CalendarClock className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                        <strong className="text-sm font-semibold">{isArabic ? 'الجلسات' : 'Sessions'}</strong>
                      </div>
                      <p className="text-xs flex-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {isArabic ? 'إنهاء آمن لجميع الجلسات الحالية.' : 'Securely revoke every current session.'}
                      </p>
                      <button
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                        style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)', background: 'var(--cms-surface)' }}
                        disabled={busy}
                        onClick={() => openDialog({ kind: 'revoke-sessions', student: selected })}
                      >
                        {isArabic ? 'إنهاء الجلسات' : 'Revoke sessions'}
                      </button>
                    </article>

                    <article className="flex flex-col gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                        <LaptopMinimal className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                        <strong className="text-sm font-semibold">{isArabic ? 'الأجهزة' : 'Devices'}</strong>
                      </div>
                      <p className="text-xs flex-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {isArabic ? 'يُلغي ربط الجهاز الحالي؛ لا يحذف سجل الأمان.' : 'Removes the current device binding without deleting audit history.'}
                      </p>
                      <button
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
                        style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)', background: 'var(--cms-surface)' }}
                        disabled={busy}
                        onClick={() => openDialog({ kind: 'unbind-device', student: selected })}
                      >
                        {isArabic ? 'إلغاء ربط الجهاز' : 'Unbind device'}
                      </button>
                    </article>

                    <article className="flex flex-col gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                        <ShieldAlert className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                        <strong className="text-sm font-semibold">{isArabic ? 'حالة الحساب' : 'Account status'}</strong>
                      </div>
                      <p className="text-xs flex-1" style={{ color: 'var(--cms-text-soft)' }}>
                        {selected.status.toLowerCase() === 'active'
                          ? (isArabic ? 'سيُسجَّل الحظر مع سبب واضح للتدقيق.' : 'A ban will be recorded with an audit-safe reason.')
                          : (isArabic ? 'يمكن إعادة تفعيل الحساب فوراً.' : 'The account can be reactivated immediately.')}
                      </p>
                      {selected.status.toLowerCase() === 'active' ? (
                        <button
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                          style={{ background: 'var(--cms-danger)' }}
                          disabled={busy}
                          onClick={() => openDialog({ kind: 'ban', student: selected })}
                        >
                          <Ban className="w-4 h-4" />
                          {isArabic ? 'حظر الحساب' : 'Ban account'}
                        </button>
                      ) : (
                        <button
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                          style={{ background: 'var(--cms-teal-700)' }}
                          disabled={busy}
                          onClick={() => setConfirmUnban(selected)}
                        >
                          <RotateCcw className="w-4 h-4" />
                          {isArabic ? 'إعادة التفعيل' : 'Reactivate'}
                        </button>
                      )}
                    </article>
                  </div>
                </>
              )}

              {drawerTab === 'security' && (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                        {isArabic ? 'السجل الأمني' : 'Security log'}
                      </p>
                      <h3 className="text-base font-bold" style={{ color: 'var(--cms-text)' }}>
                        {isArabic ? 'آخر الأحداث المرئية' : 'Recent visible events'}
                      </h3>
                    </div>
                    <ShieldCheck className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                  </div>
                  {logsLoading ? (
                    <div className="flex items-center justify-center py-8" style={{ color: 'var(--cms-text-muted)' }}>
                      <LoaderCircle className="w-5 h-5 animate-spin ml-2" />
                      {isArabic ? 'جارٍ التحميل...' : 'Loading...'}
                    </div>
                  ) : securityLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-10" style={{ color: 'var(--cms-text-muted)' }}>
                      <ShieldCheck className="w-6 h-6" style={{ color: 'var(--cms-line-strong)' }} />
                      <p className="mt-2 text-sm">
                        {isArabic ? 'لا توجد أحداث أمنية' : 'No security events'}
                      </p>
                      <p className="mt-1 text-xs">
                        {isArabic ? 'لم تُسجَّل أحداث أمنية لهذا الطالب ضمن الصلاحيات الحالية.' : 'No security events are visible for this student within the current permissions.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                      {securityLogs.map((log) => (
                        <article key={log.id} className={`rounded-lg border p-3 ${eventToneClass(log.severity)}`}>
                          <div className="flex items-start justify-between gap-2">
                            <strong className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{log.eventType}</strong>
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
                              {isArabic ? 'بصمة الجهاز' : 'Fingerprint'} · {log.deviceFingerprint.length > 40 ? log.deviceFingerprint.slice(0, 40) + '…' : log.deviceFingerprint}
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
                              {log.deviceBoundAt && <span>{isArabic ? 'الربط' : 'Bound'}: {dateLabel(log.deviceBoundAt, isArabic)}</span>}
                              {log.deviceLastUsed && <span>{isArabic ? 'آخر استخدام' : 'Last used'}: {dateLabel(log.deviceLastUsed, isArabic)}</span>}
                              {log.deviceIsActive !== undefined && (
                                <span style={{ color: log.deviceIsActive ? 'var(--cms-success)' : 'var(--cms-danger)' }}>
                                  {log.deviceIsActive ? (isArabic ? 'نشط' : 'Active') : (isArabic ? 'معطّل' : 'Inactive')}
                                </span>
                              )}
                            </div>
                          )}
                          <em className={`mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide ${eventLabelClass(log.severity)}`}>{log.severity}</em>
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
                    const deviceLog = securityLogs.find(l => l.deviceFingerprint);
                    if (!deviceLog) return null;
                    return (
                      <article className="flex flex-col gap-2 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)' }}>
                        <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                          <LaptopMinimal className="w-5 h-5" style={{ color: 'var(--cms-teal-700)' }} />
                          <strong className="text-sm font-semibold">{isArabic ? 'الجهاز المرتبط' : 'Bound device'}</strong>
                          {deviceLog.deviceIsActive !== undefined && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${deviceLog.deviceIsActive ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                              {deviceLog.deviceIsActive ? (isArabic ? 'نشط' : 'Active') : (isArabic ? 'معطّل' : 'Inactive')}
                            </span>
                          )}
                        </div>
                        {/* Fingerprint */}
                        {deviceLog.deviceFingerprint && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-medium" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'البصمة' : 'Fingerprint'}:</span>
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
                            {deviceLog.deviceBoundAt && <span>{isArabic ? 'الربط' : 'Bound'}: {dateLabel(deviceLog.deviceBoundAt, isArabic)}</span>}
                            {deviceLog.deviceLastUsed && <span>{isArabic ? 'آخر استخدام' : 'Last used'}: {dateLabel(deviceLog.deviceLastUsed, isArabic)}</span>}
                          </div>
                        )}
                      </article>
                    );
                  })()}

                  <article className="flex flex-col gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                    <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                      <MonitorSmartphone className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                      <strong className="text-sm font-semibold">{isArabic ? 'إنهاء الجلسات النشطة' : 'Revoke active sessions'}</strong>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                      {isArabic
                        ? 'ينهي هذا الإجراء جميع الجلسات النشطة على مختلف الأجهزة فوراً. سيُطلب من الطالب تسجيل الدخول مجدداً.'
                        : 'This terminates every active session across devices immediately. The student must sign in again.'}
                    </p>
                    <button
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 self-start"
                      style={{ background: 'var(--cms-teal-700)' }}
                      disabled={busy}
                      onClick={() => openDialog({ kind: 'revoke-sessions', student: selected })}
                    >
                      <CalendarClock className="w-4 h-4" />
                      {isArabic ? 'إنهاء الجلسات' : 'Revoke sessions'}
                    </button>
                  </article>

                  <article className="flex flex-col gap-3 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                    <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                      <LaptopMinimal className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                      <strong className="text-sm font-semibold">{isArabic ? 'إلغاء ربط الجهاز' : 'Unbind device'}</strong>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                      {isArabic
                        ? 'يلغي ربط بصمة الجهاز الحالية، وسيُعاد التحقق عند الدخول التالي. لا يحذف سجل الأحداث.'
                        : 'Removes the current device fingerprint binding; the server will re-verify at the next sign-in. Audit history is preserved.'}
                    </p>
                    <button
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 self-start"
                      style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text)', background: 'var(--cms-surface)' }}
                      disabled={busy}
                      onClick={() => openDialog({ kind: 'unbind-device', student: selected })}
                    >
                      {isArabic ? 'إلغاء ربط الجهاز' : 'Unbind device'}
                    </button>
                  </article>

                  {/* P1-11: Sessions list */}
                  <article className="flex flex-col gap-2 p-4 rounded-lg border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
                    <div className="flex items-center gap-2" style={{ color: 'var(--cms-text)' }}>
                      <CalendarClock className="w-5 h-5" style={{ color: 'var(--cms-teal-600)' }} />
                      <strong className="text-sm font-semibold">{isArabic ? 'قائمة الجلسات' : 'Sessions list'}</strong>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>{sessions.length}</span>
                    </div>
                    {sessionsLoading ? (
                      <div className="flex items-center gap-2 py-3">
                        <LoaderCircle className="w-4 h-4 animate-spin" style={{ color: 'var(--cms-text-muted)' }} />
                        <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'جارٍ التحميل...' : 'Loading...'}</span>
                      </div>
                    ) : sessions.length === 0 ? (
                      <p className="text-xs py-2" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'لا توجد جلسات مسجلة.' : 'No sessions recorded.'}</p>
                    ) : (
                      <div className="flex flex-col gap-1.5 mt-1">
                        {sessions.slice(0, 20).map(s => {
                          const isActive = s.status === 'Active';
                          return (
                            <div key={s.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0" style={{ borderColor: 'var(--cms-line)' }}>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'text-emerald-700 bg-emerald-50' : s.status === 'Revoked' ? 'text-red-700 bg-red-50' : 'text-amber-700 bg-amber-50'}`}>{s.status}</span>
                                  <span className="text-xs font-medium" style={{ color: 'var(--cms-text)' }}>{s.role}</span>
                                  {s.deviceType && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>{s.deviceType}</span>}
                                  {s.deviceOs && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-info-50)', color: 'var(--cms-info)' }}>{s.deviceOs}</span>}
                                  {s.deviceBrowser && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-ivory-200)', color: 'var(--cms-text-soft)' }}>{s.deviceBrowser}</span>}
                                </div>
                                <div className="flex gap-3 mt-1 text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                                  <span>{isArabic ? 'الإنشاء' : 'Created'}: {dateLabel(s.createdAt, isArabic)}</span>
                                  <span>{isArabic ? 'آخر نشاط' : 'Last active'}: {dateLabel(s.lastActivityAt, isArabic)}</span>
                                  {s.revokedAt && <span style={{ color: 'var(--cms-danger)' }}>{isArabic ? 'أُنهيت' : 'Revoked'}: {dateLabel(s.revokedAt, isArabic)}</span>}
                                </div>
                              </div>
                              {isActive && (
                                <button
                                  onClick={() => void revokeSession(s.id)}
                                  disabled={revokingSession === s.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium text-red-700 border-red-200 hover:bg-red-50 disabled:opacity-50"
                                  title={isArabic ? 'إنهاء هذه الجلسة' : 'Revoke this session'}
                                >
                                  {revokingSession === s.id ? <LoaderCircle className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                                  {isArabic ? 'إنهاء' : 'Revoke'}
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
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpenCheck size={18} style={{ color: 'var(--cms-teal-600)' }} />
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{isArabic ? 'التقدم الدراسي' : 'Academic progress'}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'الجامعة' : 'University'}</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--cms-text)' }}>{selected.universityName || '—'}</div>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'الكلية' : 'College'}</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--cms-text)' }}>{selected.collegeName || '—'}</div>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'إجابات' : 'Questions answered'}</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--cms-teal-700)' }}>{selected.questionsAnswered}</div>
                    </div>
                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                      <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'الدقة' : 'Accuracy'}</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--cms-success)' }}>{Math.round(selected.accuracy)}%</div>
                    </div>
                  </div>
                  {/* Per-subject progress from GET /admin/students/{id}/progress */}
                  <div className="mt-3">
                    <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'التقدم حسب المادة' : 'Per-subject progress'}</h4>
                    {studentProgressLoading ? (
                      <div className="flex items-center gap-2 py-3"><LoaderCircle size={14} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} /><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'جارٍ التحميل...' : 'Loading...'}</span></div>
                    ) : studentProgress.length === 0 ? (
                      <div className="text-center py-6">
                        <BookOpenCheck size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
                        <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'لا توجد بيانات تقدم بعد. سيظهر هنا عند إجابة الطالب على الأسئلة.' : 'No progress data yet. It will appear here once the student answers questions.'}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {studentProgress.map(p => (
                          <div key={p.subjectId} className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium" style={{ color: 'var(--cms-text)' }}>{isArabic ? p.subjectName : (p.subjectNameEn || p.subjectName)}</span>
                              <span className="text-xs font-bold tabular-nums" style={{ color: p.accuracy >= 60 ? 'var(--cms-success)' : 'var(--cms-danger)' }}>{Math.round(p.accuracy)}%</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                              <span>{p.correctAnswers}/{p.questionsAnswered} {isArabic ? 'صحيحة' : 'correct'}</span>
                              <span>·</span>
                              <span>{isArabic ? 'آخر نشاط' : 'Last activity'}: {new Date(p.lastActivityDate).toLocaleDateString(isArabic ? 'ar' : 'en')}</span>
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
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardCheck size={18} style={{ color: 'var(--cms-teal-600)' }} />
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{isArabic ? 'الاختبارات والنتائج' : 'Exams & results'}</h3>
                  </div>
                  {examSessionsLoading ? (
                    <div className="flex items-center gap-2 py-3"><LoaderCircle size={14} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} /><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'جارٍ التحميل...' : 'Loading...'}</span></div>
                  ) : examSessions.length === 0 ? (
                    <div className="text-center py-6">
                      <ClipboardCheck size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
                      <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'لم يخض هذا الطالب أي اختبار بعد.' : 'This student has not taken any exams yet.'}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {examSessions.map(es => (
                        <div key={es.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium truncate" style={{ color: 'var(--cms-text)' }}>{es.examTitle}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                              background: es.passed ? 'rgba(34,197,94,0.12)' : 'rgba(255,82,82,0.12)',
                              color: es.passed ? 'var(--cms-success)' : 'var(--cms-danger)'
                            }}>{es.passed === null ? (isArabic ? 'قيد التقدم' : 'In progress') : es.passed ? (isArabic ? 'ناجح' : 'Passed') : (isArabic ? 'راسب' : 'Failed')}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                            <span>{isArabic ? 'الدرجة' : 'Score'}: {es.score !== null ? Math.round(es.score) + '%' : '—'}</span>
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
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <KeyRound size={18} style={{ color: 'var(--cms-teal-600)' }} />
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{isArabic ? 'الاشتراكات والأكواد' : 'Subscriptions & codes'}</h3>
                  </div>
                  {subscriptionsLoading ? (
                    <div className="flex items-center gap-2 py-3"><LoaderCircle size={14} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} /><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'جارٍ التحميل...' : 'Loading...'}</span></div>
                  ) : subscriptions.length === 0 ? (
                    <div className="text-center py-6">
                      <KeyRound size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
                      <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'لا توجد اشتراكات لهذا الطالب.' : 'No subscriptions for this student.'}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {subscriptions.map(s => {
                        const isActive = s.status === 'Active' && !s.revokedAt && new Date(s.expiresAt) > new Date();
                        return (
                          <div key={s.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium" style={{ color: 'var(--cms-text)' }}>{isArabic ? 'نطاق' : 'Scope'}: {isArabic ? s.scopeType.replace(/([A-Z])/g, ' $1').trim() : s.scopeType}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                                background: isActive ? 'rgba(34,197,94,0.12)' : 'rgba(255,159,28,0.12)',
                                color: isActive ? 'var(--cms-success)' : 'var(--cms-warning)'
                              }}>{isArabic ? (isActive ? 'نشط' : 'منتهي') : (isActive ? 'Active' : 'Expired')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                              <span>{isArabic ? 'من' : 'From'}: {new Date(s.startsAt).toLocaleDateString(isArabic ? 'ar' : 'en')}</span>
                              <span>·</span>
                              <span>{isArabic ? 'إلى' : 'Until'}: {new Date(s.expiresAt).toLocaleDateString(isArabic ? 'ar' : 'en')}</span>
                            </div>
                            {s.revokedAt && (
                              <div className="text-[11px] mt-1" style={{ color: 'var(--cms-danger)' }}>
                                {isArabic ? 'ألغي في' : 'Revoked at'}: {new Date(s.revokedAt).toLocaleDateString(isArabic ? 'ar' : 'en')}
                                {s.revocationReason ? ` — ${s.revocationReason}` : ''}
                              </div>
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
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileWarning size={18} style={{ color: 'var(--cms-teal-600)' }} />
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{isArabic ? 'البلاغات المرتبطة' : 'Associated reports'}</h3>
                  </div>
                  {studentReportsLoading ? (
                    <div className="flex items-center gap-2 py-3"><LoaderCircle size={14} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} /><span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'جارٍ التحميل...' : 'Loading...'}</span></div>
                  ) : studentReports.length === 0 ? (
                    <div className="text-center py-6">
                      <FileWarning size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
                      <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'لم يقدّم هذا الطالب أي بلاغ.' : 'This student has not filed any reports.'}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {studentReports.map(r => (
                        <div key={r.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium truncate" style={{ color: 'var(--cms-text)' }}>{r.questionText.slice(0, 80)}{r.questionText.length > 80 ? '…' : ''}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                              background: r.status === 'Pending' ? 'rgba(255,159,28,0.12)' : r.status === 'Resolved' ? 'rgba(34,197,94,0.12)' : 'rgba(13,116,107,0.12)',
                              color: r.status === 'Pending' ? 'var(--cms-warning)' : r.status === 'Resolved' ? 'var(--cms-success)' : 'var(--cms-teal-600)'
                            }}>{isArabic ? r.reason : r.reason}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
                            <span>{isArabic ? 'الحالة' : 'Status'}: {r.status}</span>
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
          </aside>
        </>
      )}

      {/* P1-01: Edit profile modal */}
      {editStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          role="presentation"
          onMouseDown={() => !busy && !avatarBusy && (setEditStudent(null), setAvatarPreview(null))}
        >
          <section
            className="bg-white rounded-xl max-w-md w-full shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label={isArabic ? 'تعديل الملف' : 'Edit profile'}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 p-5 border-b" style={{ borderColor: 'var(--cms-line)' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'تعديل الملف' : 'Edit profile'}</p>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--cms-text)' }}>{editStudent.fullName}</h2>
                </div>
              </div>
              <button aria-label={isArabic ? 'إغلاق' : 'Close'} onClick={() => { setEditStudent(null); setAvatarPreview(null); }} disabled={busy || avatarBusy} className="p-1.5 rounded-md" style={{ color: 'var(--cms-text-muted)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitEdit} className="p-5 space-y-4">
              {/* Avatar upload */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--cms-teal-700), var(--cms-teal-500))' }}>
                  {avatarPreview ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" /> : editStudent.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors" style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}>
                    {avatarBusy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    {isArabic ? 'رفع صورة' : 'Upload avatar'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} disabled={avatarBusy} />
                  </label>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--cms-text-muted)' }}>{isArabic ? 'JPG/PNG/WebP · حد أقصى 3MB' : 'JPG/PNG/WebP · max 3MB'}</p>
                </div>
              </div>
              {/* Full name */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>{isArabic ? 'الاسم الكامل' : 'Full name'}</label>
                <input
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                />
              </div>
              {/* Gender */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>{isArabic ? 'الجنس' : 'Gender'}</label>
                <select
                  value={editForm.gender}
                  onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                >
                  <option value="">{isArabic ? 'غير محدد' : 'Not specified'}</option>
                  <option value="male">{isArabic ? 'ذكر' : 'Male'}</option>
                  <option value="female">{isArabic ? 'أنثى' : 'Female'}</option>
                </select>
              </div>
              {/* Phone (read-only) */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>{isArabic ? 'الهاتف' : 'Phone'}</label>
                <input
                  value={editStudent.phone}
                  disabled
                  className="w-full px-3 py-2 rounded-lg border text-sm opacity-60"
                  style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)', color: 'var(--cms-text-soft)' }}
                />
              </div>
              <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: 'var(--cms-line)' }}>
                <button type="button" onClick={() => { setEditStudent(null); setAvatarPreview(null); }} disabled={busy} className="px-4 py-2 rounded-lg border text-sm font-medium" style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}>
                  {isArabic ? 'إلغاء' : 'Cancel'}
                </button>
                <button type="submit" disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: 'var(--cms-teal-700)' }}>
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {isArabic ? 'حفظ' : 'Save'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ===== Protected-action dialog ===== */}
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          role="presentation"
          onMouseDown={() => !busy && setDialog(null)}
        >
          <section
            className="bg-white rounded-xl max-w-md w-full shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label={dialog.kind}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 p-5 border-b" style={{ borderColor: 'var(--cms-line)' }}>
              <div className="flex items-start gap-3">
                <div
                  className="p-2 rounded-lg"
                  style={
                    dialog.kind === 'ban'
                      ? { background: 'var(--cms-danger-50)', color: 'var(--cms-danger)' }
                      : { background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }
                  }
                >
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                    {isArabic ? 'إجراء محمي' : 'Protected action'}
                  </p>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--cms-text)' }}>{dialogTitle}</h2>
                </div>
              </div>
              <button
                aria-label={isArabic ? 'إغلاق' : 'Close'}
                onClick={() => setDialog(null)}
                disabled={busy}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--cms-text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={executeDialog} className="p-5 space-y-4">
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
                <p className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{dialog.student.fullName}</p>
                <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{dialog.student.phone || '—'}</p>
              </div>
              {dialog.kind === 'ban' && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {isArabic ? 'سبب الحظر' : 'Ban reason'}
                    </label>
                    <textarea
                      required
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={isArabic ? 'أدخل سبباً واضحاً وآمناً للتدقيق.' : 'Provide a clear, audit-safe reason.'}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      style={{ borderColor: 'var(--cms-line-strong)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                      {isArabic ? 'تاريخ انتهاء اختياري' : 'Optional expiry date'}
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
              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                  style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
                  onClick={() => setDialog(null)}
                  disabled={busy}
                >
                  {isArabic ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
                  style={{ background: dialog.kind === 'ban' ? 'var(--cms-danger)' : 'var(--cms-teal-700)' }}
                  disabled={busy}
                >
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : dialog.kind === 'ban' ? <Ban className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                  {dialogConfirm}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ===== Confirm unban dialog ===== */}
      {confirmUnban && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          role="presentation"
          onMouseDown={() => !busy && setConfirmUnban(null)}
        >
          <section
            className="bg-white rounded-xl max-w-sm w-full shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="confirm-unban"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-lg" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>
                    {isArabic ? 'تأكيد إعادة التفعيل' : 'Confirm reactivation'}
                  </p>
                  <h2 className="text-base font-bold" style={{ color: 'var(--cms-text)' }}>
                    {isArabic
                      ? `هل تريد إعادة تفعيل حساب ${confirmUnban.fullName}؟`
                      : `Reactivate ${confirmUnban.fullName}'s account?`}
                  </h2>
                </div>
              </div>
              <p className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
                {isArabic
                  ? 'سيُعاد تفعيل الحساب فوراً ويمكن للطالب تسجيل الدخول من جديد.'
                  : 'The account will be reactivated immediately and the student may sign in again.'}
              </p>
              <div className="flex gap-3 justify-end mt-5">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors"
                  style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)', background: 'var(--cms-surface)' }}
                  onClick={() => setConfirmUnban(null)}
                  disabled={busy}
                >
                  {isArabic ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
                  style={{ background: 'var(--cms-teal-700)' }}
                  disabled={busy}
                  onClick={() => { void unban(confirmUnban).finally(() => setConfirmUnban(null)); }}
                >
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  {isArabic ? 'إعادة التفعيل' : 'Reactivate'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
