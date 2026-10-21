import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Ban, CalendarClock, CircleAlert, LaptopMinimal, LoaderCircle, RotateCcw, Search, ShieldAlert, ShieldCheck, UserRound, X, Users } from 'lucide-react';
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
};

type University = { id: string; nameAr: string; nameEn?: string | null };
type SecurityLog = { id: string; eventType: string; severity: string; description: string; ipAddress?: string | null; deviceFingerprint?: string | null; createdAt: string };
type Dialog =
  | { kind: 'ban'; student: StudentRecord }
  | { kind: 'revoke-sessions'; student: StudentRecord }
  | { kind: 'unbind-device'; student: StudentRecord }
  | null;

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const statusLabel = (status: string, isArabic: boolean) => {
  const normalized = status.toLowerCase();
  if (normalized === 'active') return isArabic ? 'نشط' : 'Active';
  if (normalized === 'banned') return isArabic ? 'محظور' : 'Banned';
  if (normalized === 'suspended') return isArabic ? 'معلّق' : 'Suspended';
  if (normalized === 'pending') return isArabic ? 'قيد المراجعة' : 'Pending';
  return status || '—';
};

const statusChipClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'active') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (value === 'banned') return 'text-red-600 bg-red-50 border-red-200';
  if (value === 'suspended') return 'text-amber-600 bg-amber-50 border-amber-200';
  if (value === 'pending') return 'text-sky-600 bg-sky-50 border-sky-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

function dateLabel(value: string | null | undefined, isArabic: boolean) {
  return value ? new Intl.DateTimeFormat(isArabic ? 'ar-SY' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function eventToneClass(severity: string) {
  const value = severity.toLowerCase();
  if (value === 'critical' || value === 'high') return 'border-red-200 bg-red-50';
  if (value === 'warning' || value === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-slate-200 bg-slate-50';
}

function eventLabelClass(severity: string) {
  const value = severity.toLowerCase();
  if (value === 'critical' || value === 'high') return 'text-red-600';
  if (value === 'warning' || value === 'medium') return 'text-amber-600';
  return 'text-slate-500';
}

export function StudentsCenter({ token, isArabic, onError, onNotice }: Props) {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<StudentRecord | null>(null);
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [banUntil, setBanUntil] = useState('');
  const [busy, setBusy] = useState(false);

  const request = <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);
  const filtersActive = Boolean(query.trim() || status || universityId);

  const universityOptions = useMemo(() => universities.map((university) => ({
    id: university.id,
    label: isArabic ? university.nameAr : (university.nameEn || university.nameAr),
  })), [universities, isArabic]);

  const loadStudents = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (query.trim()) params.set('search', query.trim());
      if (status) params.set('status', status);
      if (universityId) params.set('universityId', universityId);
      const data = await request<PagedResult<StudentRecord>>(`/api/v1/admin/students?${params.toString()}`);
      setStudents(data.items);
      setTotal(data.total);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) onError(isArabic ? 'لا تملك صلاحية عرض الطلاب ضمن نطاقك الحالي.' : 'You do not have permission to view students within your current scope.');
      else onError(error instanceof Error ? error.message : 'Unable to load students.');
      setStudents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = window.setTimeout(() => { void loadStudents(); }, 250);
    return () => window.clearTimeout(handle);
    // Filters intentionally drive a server-side constrained student query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, query, status, universityId]);

  useEffect(() => {
    request<PagedResult<University>>('/api/v1/universities?Page=1&PageSize=100')
      .then((data) => setUniversities(data.items))
      .catch(() => setUniversities([]));
    // This directory filter is optional; the protected student query remains the authority.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openStudent = async (student: StudentRecord) => {
    setSelected(student);
    setSecurityLogs([]);
    setLogsLoading(true);
    try {
      const data = await request<SecurityLog[]>(`/api/v1/security/students/${student.id}/logs?count=50`);
      setSecurityLogs(data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) onError(isArabic ? 'لا تملك صلاحية عرض السجل الأمني لهذا الطالب.' : 'You do not have permission to view this student’s security log.');
      else onError(error instanceof Error ? error.message : 'Unable to load the security log.');
    } finally {
      setLogsLoading(false);
    }
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
          body: JSON.stringify({ reason: reason.trim(), banUntil: banUntil ? new Date(`${banUntil}T23:59:59`).toISOString() : null }),
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
      await loadStudents();
      if (selected?.id === studentRef.id) await openStudent(studentRef);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The protected action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const unban = async (student: StudentRecord) => {
    if (!window.confirm(isArabic ? `هل تريد إعادة تفعيل حساب ${student.fullName}؟` : `Reactivate ${student.fullName}'s account?`)) return;
    setBusy(true);
    try {
      await request(`/api/v1/admin/students/${student.id}/unban`, { method: 'POST' });
      onNotice(isArabic ? 'تمت إعادة تفعيل حساب الطالب.' : 'Student account reactivated.');
      await loadStudents();
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
    dialog.kind === 'revoke-sessions' ? (isArabic ? 'سيؤدي هذا إلى إنهاء وصول الطالب من جميع الأجهزة. لا يمكن التراجع عن الجلسات المنتهية.' : 'This ends the student’s access on every device. Revoked sessions cannot be restored.')
      : dialog.kind === 'unbind-device' ? (isArabic ? 'سيطلب الخادم التحقق وربط الجهاز عند الدخول التالي. لا يحذف هذا الإجراء سجل الأحداث.' : 'The server will verify and bind a device at the next sign-in. This action preserves event history.')
        : (isArabic ? 'يُسجل الخادم هذا الإجراء الحساس. يمكن ترك تاريخ الانتهاء فارغاً للحظر المفتوح وفق السياسة.' : 'The server records this sensitive action. Leave expiry empty for an open-ended ban where policy permits.')
  ) : '';

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'إدارة المستخدمين' : 'User management'}</p>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {isArabic ? 'الطلاب' : 'Students'}
              <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">{total}</span>
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">{isArabic ? 'تُعرض النتائج وتُنفّذ الإجراءات ضمن نطاق المدير وصلاحياته من الخادم.' : 'Results and protected actions are constrained by the acting administrator’s server-side scope and permissions.'}</p>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl bg-white border border-slate-200">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isArabic ? 'ابحث بالاسم أو رقم الهاتف' : 'Search name or phone'}
            className="w-full pr-10 pl-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>
        <select value={universityId} onChange={(event) => setUniversityId(event.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">{isArabic ? 'كل الجامعات المتاحة' : 'All allowed universities'}</option>
          {universityOptions.map((university) => <option key={university.id} value={university.id}>{university.label}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="">{isArabic ? 'كل الحالات' : 'All statuses'}</option>
          <option value="Active">{isArabic ? 'نشط' : 'Active'}</option>
          <option value="Banned">{isArabic ? 'محظور' : 'Banned'}</option>
          <option value="Suspended">{isArabic ? 'معلّق' : 'Suspended'}</option>
          <option value="Pending">{isArabic ? 'قيد المراجعة' : 'Pending'}</option>
        </select>
        {filtersActive && (
          <button onClick={() => { setQuery(''); setStatus(''); setUniversityId(''); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <X className="w-4 h-4" />{isArabic ? 'إزالة التصفية' : 'Clear filters'}
          </button>
        )}
      </div>

      {/* Students table */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 rounded bg-slate-100 animate-pulse w-1/3" />
                  <div className="h-3 rounded bg-slate-100 animate-pulse w-1/4" />
                </div>
                <div className="h-6 w-16 rounded-full bg-slate-100 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center text-center py-16">
          <div className="p-3 rounded-full bg-slate-50 text-slate-400">
            <UserRound className="w-7 h-7" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700">{isArabic ? 'لا توجد نتائج مطابقة ضمن نطاقك.' : 'No matching students are available within your scope.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-right px-4 py-3 font-medium">{isArabic ? 'الطالب' : 'Student'}</th>
                <th className="text-right px-4 py-3 font-medium">{isArabic ? 'المسار الأكاديمي' : 'Academic path'}</th>
                <th className="text-right px-4 py-3 font-medium">{isArabic ? 'الحالة' : 'Status'}</th>
                <th className="text-right px-4 py-3 font-medium">{isArabic ? 'التفاعل' : 'Activity'}</th>
                <th className="text-right px-4 py-3 font-medium">{isArabic ? 'آخر دخول' : 'Last sign-in'}</th>
                <th className="text-right px-4 py-3 font-medium"><span className="sr-only">{isArabic ? 'إجراءات' : 'Actions'}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((student) => {
                const active = student.status.toLowerCase() === 'active';
                return (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-sm font-semibold shrink-0">{student.fullName[0] ?? 'S'}</div>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{student.fullName}</div>
                          <div className="text-xs text-slate-500">{student.phone}</div>
                          <div className="text-xs text-slate-400">{isArabic ? `سُجّل في ${dateLabel(student.createdAt, isArabic)}` : `Registered ${dateLabel(student.createdAt, isArabic)}`}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700 text-sm">{student.universityName || '—'}</div>
                      <div className="text-xs text-slate-500">{student.collegeName || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${statusChipClass(student.status)}`}>{statusLabel(student.status, isArabic)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{student.questionsAnswered}</div>
                      <div className="text-xs text-slate-500">{isArabic ? `إجابة · ${Math.round(student.accuracy)}% دقة` : `answers · ${Math.round(student.accuracy)}% accuracy`}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{dateLabel(student.lastLogin, isArabic)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button title={isArabic ? 'عرض الملف والسجل الأمني' : 'View profile and security log'} onClick={() => void openStudent(student)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                          <UserRound className="w-4 h-4" />
                        </button>
                        {active ? (
                          <button className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors" title={isArabic ? 'حظر الحساب' : 'Ban account'} disabled={busy} onClick={() => openDialog({ kind: 'ban', student })}>
                            <Ban className="w-4 h-4" />
                          </button>
                        ) : (
                          <button className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors" title={isArabic ? 'إعادة تفعيل الحساب' : 'Reactivate account'} disabled={busy} onClick={() => void unban(student)}>
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
        </div>
      )}

      {/* Student drawer */}
      {selected && (
        <section aria-label={isArabic ? 'تفاصيل الطالب' : 'Student details'} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-white flex items-center justify-center text-base font-semibold">{selected.fullName[0] ?? 'S'}</div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'ملف الطالب' : 'Student record'}</p>
                <h3 className="text-lg font-bold text-slate-900">{selected.fullName}</h3>
                <span className="text-xs text-slate-500">{selected.phone} · {selected.universityName || '—'} / {selected.collegeName || '—'}</span>
              </div>
            </div>
            <button onClick={() => setSelected(null)} aria-label={isArabic ? 'إغلاق التفاصيل' : 'Close details'} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-5">
            <article className="flex flex-col gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2 text-slate-700">
                <CalendarClock className="w-5 h-5 text-teal-600" />
                <strong className="text-sm font-semibold">{isArabic ? 'الجلسات' : 'Sessions'}</strong>
              </div>
              <p className="text-xs text-slate-500 flex-1">{isArabic ? 'إنهاء آمن لجميع الجلسات الحالية.' : 'Securely revoke every current session.'}</p>
              <button className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-100 transition-colors disabled:opacity-50" disabled={busy} onClick={() => openDialog({ kind: 'revoke-sessions', student: selected })}>
                {isArabic ? 'إنهاء الجلسات' : 'Revoke sessions'}
              </button>
            </article>
            <article className="flex flex-col gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2 text-slate-700">
                <LaptopMinimal className="w-5 h-5 text-teal-600" />
                <strong className="text-sm font-semibold">{isArabic ? 'الأجهزة' : 'Devices'}</strong>
              </div>
              <p className="text-xs text-slate-500 flex-1">{isArabic ? 'يُلغي ربط الجهاز الحالي؛ لا يحذف سجل الأمان.' : 'Removes the current device binding without deleting audit history.'}</p>
              <button className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-100 transition-colors disabled:opacity-50" disabled={busy} onClick={() => openDialog({ kind: 'unbind-device', student: selected })}>
                {isArabic ? 'إلغاء الربط' : 'Unbind device'}
              </button>
            </article>
            <article className="flex flex-col gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2 text-slate-700">
                <ShieldAlert className="w-5 h-5 text-teal-600" />
                <strong className="text-sm font-semibold">{isArabic ? 'حالة الحساب' : 'Account status'}</strong>
              </div>
              <p className="text-xs text-slate-500 flex-1">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${statusChipClass(selected.status)}`}>{statusLabel(selected.status, isArabic)}</span>
              </p>
              {selected.status.toLowerCase() === 'active' ? (
                <button className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50" disabled={busy} onClick={() => openDialog({ kind: 'ban', student: selected })}>
                  <Ban className="w-4 h-4" />{isArabic ? 'حظر' : 'Ban'}
                </button>
              ) : (
                <button className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50" disabled={busy} onClick={() => void unban(selected)}>
                  <RotateCcw className="w-4 h-4" />{isArabic ? 'إعادة تفعيل' : 'Reactivate'}
                </button>
              )}
            </article>
          </div>

          <div className="border-t border-slate-200 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'السجل الأمني' : 'Security log'}</p>
                <h3 className="text-base font-bold text-slate-900">{isArabic ? 'آخر الأحداث المرئية' : 'Recent visible events'}</h3>
              </div>
              <ShieldCheck className="w-5 h-5 text-teal-600" />
            </div>
            {logsLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <LoaderCircle className="w-5 h-5 animate-spin ml-2" />{isArabic ? 'جارٍ تحميل السجل…' : 'Loading log…'}
              </div>
            ) : securityLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-10 text-slate-500">
                <ShieldCheck className="w-6 h-6 text-slate-300" />
                <p className="mt-2 text-sm">{isArabic ? 'لا توجد أحداث أمنية معروضة لهذا الطالب ضمن الصلاحيات الحالية.' : 'No security events are visible for this student within the current permissions.'}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {securityLogs.map((log) => (
                  <article key={log.id} className={`rounded-lg border p-3 ${eventToneClass(log.severity)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-sm font-semibold text-slate-900">{log.eventType}</strong>
                      <small className="text-xs text-slate-500">{dateLabel(log.createdAt, isArabic)}</small>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{log.description}</p>
                    <em className={`mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide ${eventLabelClass(log.severity)}`}>{log.severity}</em>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Protected action dialog */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={() => !busy && setDialog(null)}>
          <section className="bg-white rounded-xl max-w-md w-full shadow-xl" role="dialog" aria-modal="true" aria-label={dialog.kind} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${dialog.kind === 'ban' ? 'bg-red-50 text-red-600' : 'bg-teal-50 text-teal-600'}`}>
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'إجراء محمي' : 'Protected action'}</p>
                  <h2 className="text-lg font-bold text-slate-900">{dialogTitle}</h2>
                </div>
              </div>
              <button aria-label={isArabic ? 'إغلاق' : 'Close'} onClick={() => setDialog(null)} disabled={busy} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={executeDialog} className="p-5 space-y-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <p className="font-semibold text-slate-900 text-sm">{dialog.student.fullName}</p>
                <p className="text-xs text-slate-500">{dialog.student.phone}</p>
              </div>
              {dialog.kind === 'ban' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'سبب الحظر' : 'Ban reason'}</label>
                    <textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isArabic ? 'اكتب سبباً واضحاً وآمناً للتدقيق.' : 'Provide a clear, audit-safe reason.'} rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'تاريخ انتهاء اختياري' : 'Optional expiry date'}</label>
                    <input type="date" value={banUntil} onChange={(event) => setBanUntil(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
                  </div>
                </>
              )}
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-700">
                <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs">{dialogScopeNote}</p>
              </div>
              <div className="flex gap-3 justify-end pt-1">
                <button type="button" className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors" onClick={() => setDialog(null)} disabled={busy}>{isArabic ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors ${dialog.kind === 'ban' ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`} disabled={busy}>
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : dialog.kind === 'ban' ? <Ban className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                  {dialogConfirm}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
