import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Ban, CalendarClock, CircleAlert, LaptopMinimal, LoaderCircle, RotateCcw, Search, ShieldAlert, ShieldCheck, UserRound, X } from 'lucide-react';
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

function dateLabel(value: string | null | undefined, isArabic: boolean) {
  return value ? new Intl.DateTimeFormat(isArabic ? 'ar-SY' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function eventTone(severity: string) {
  const value = severity.toLowerCase();
  if (value === 'critical' || value === 'high') return 'danger';
  if (value === 'warning' || value === 'medium') return 'warning';
  return 'neutral';
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
      setDialog(null);
      await loadStudents();
      if (selected?.id === dialog.student.id) await openStudent(dialog.student);
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

  return <section className="students-center">
    <header className="directory-heading">
      <div><p className="eyebrow">{isArabic ? 'إدارة المستخدمين' : 'USER MANAGEMENT'}</p><h2>{isArabic ? 'الطلاب' : 'Students'}<small>{total}</small></h2><p className="students-heading-note">{isArabic ? 'تُعرض النتائج وتُنفّذ الإجراءات ضمن نطاق المدير وصلاحياته من الخادم.' : 'Results and protected actions are constrained by the acting administrator’s server-side scope and permissions.'}</p></div>
    </header>

    <div className="filters student-filters">
      <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isArabic ? 'ابحث بالاسم أو رقم الهاتف' : 'Search name or phone'} /></label>
      <select value={universityId} onChange={(event) => setUniversityId(event.target.value)}><option value="">{isArabic ? 'كل الجامعات المتاحة' : 'All allowed universities'}</option>{universityOptions.map((university) => <option key={university.id} value={university.id}>{university.label}</option>)}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{isArabic ? 'كل الحالات' : 'All statuses'}</option><option value="Active">{isArabic ? 'نشط' : 'Active'}</option><option value="Banned">{isArabic ? 'محظور' : 'Banned'}</option><option value="Suspended">{isArabic ? 'معلّق' : 'Suspended'}</option><option value="Pending">{isArabic ? 'قيد المراجعة' : 'Pending'}</option></select>
      {filtersActive && <button className="clear-filter" onClick={() => { setQuery(''); setStatus(''); setUniversityId(''); }}><X size={15} />{isArabic ? 'إزالة التصفية' : 'Clear filters'}</button>}
    </div>

    <div className="admin-table-wrap">
      <table><thead><tr><th>{isArabic ? 'الطالب' : 'Student'}</th><th>{isArabic ? 'المسار الأكاديمي' : 'Academic path'}</th><th>{isArabic ? 'الحالة' : 'Status'}</th><th>{isArabic ? 'التفاعل' : 'Activity'}</th><th>{isArabic ? 'آخر دخول' : 'Last sign-in'}</th><th><span className="sr-only">{isArabic ? 'إجراءات' : 'Actions'}</span></th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6}><div className="table-loading"><LoaderCircle className="spin" size={20} />{isArabic ? 'جارٍ تحميل الطلاب…' : 'Loading students…'}</div></td></tr>
          : students.length === 0 ? <tr><td colSpan={6}><div className="table-empty"><UserRound size={22} /><strong>{isArabic ? 'لا توجد نتائج مطابقة ضمن نطاقك.' : 'No matching students are available within your scope.'}</strong></div></td></tr>
            : students.map((student) => { const active = student.status.toLowerCase() === 'active'; return <tr key={student.id}><td><div className="identity"><div className="avatar">{student.fullName[0] ?? 'S'}</div><span><strong>{student.fullName}</strong><small>{student.phone}</small><small>{isArabic ? `سُجّل في ${dateLabel(student.createdAt, isArabic)}` : `Registered ${dateLabel(student.createdAt, isArabic)}`}</small></span></div></td><td><div className="academic-cell"><strong>{student.universityName || '—'}</strong><small>{student.collegeName || '—'}</small></div></td><td><span className={`status-chip ${active ? 'active' : 'disabled'}`}>{statusLabel(student.status, isArabic)}</span></td><td><div className="activity-cell"><strong>{student.questionsAnswered}</strong><small>{isArabic ? `إجابة · ${Math.round(student.accuracy)}% دقة` : `answers · ${Math.round(student.accuracy)}% accuracy`}</small></div></td><td>{dateLabel(student.lastLogin, isArabic)}</td><td><div className="row-actions"><button title={isArabic ? 'عرض الملف والسجل الأمني' : 'View profile and security log'} onClick={() => void openStudent(student)}><UserRound size={16} /></button>{active ? <button className="danger" title={isArabic ? 'حظر الحساب' : 'Ban account'} disabled={busy} onClick={() => openDialog({ kind: 'ban', student })}><Ban size={16} /></button> : <button title={isArabic ? 'إعادة تفعيل الحساب' : 'Reactivate account'} disabled={busy} onClick={() => void unban(student)}><RotateCcw size={16} /></button>}</div></td></tr>; })}
      </tbody></table>
    </div>

    {selected && <section className="student-drawer" aria-label={isArabic ? 'تفاصيل الطالب' : 'Student details'}><header><div><p className="eyebrow">{isArabic ? 'ملف الطالب' : 'STUDENT RECORD'}</p><h3>{selected.fullName}</h3><span>{selected.phone} · {selected.universityName || '—'} / {selected.collegeName || '—'}</span></div><button onClick={() => setSelected(null)} aria-label={isArabic ? 'إغلاق التفاصيل' : 'Close details'}><X size={19} /></button></header><div className="student-operations"><article><CalendarClock size={19} /><div><strong>{isArabic ? 'الجلسات' : 'Sessions'}</strong><span>{isArabic ? 'إنهاء آمن لجميع الجلسات الحالية.' : 'Securely revoke every current session.'}</span></div><button className="secondary-action" disabled={busy} onClick={() => openDialog({ kind: 'revoke-sessions', student: selected })}>{isArabic ? 'إنهاء الجلسات' : 'Revoke sessions'}</button></article><article><LaptopMinimal size={19} /><div><strong>{isArabic ? 'الأجهزة' : 'Devices'}</strong><span>{isArabic ? 'يُلغي ربط الجهاز الحالي؛ لا يحذف سجل الأمان.' : 'Removes the current device binding without deleting audit history.'}</span></div><button className="secondary-action" disabled={busy} onClick={() => openDialog({ kind: 'unbind-device', student: selected })}>{isArabic ? 'إلغاء الربط' : 'Unbind device'}</button></article><article><ShieldAlert size={19} /><div><strong>{isArabic ? 'حالة الحساب' : 'Account status'}</strong><span>{statusLabel(selected.status, isArabic)}</span></div>{selected.status.toLowerCase() === 'active' ? <button className="danger-action" disabled={busy} onClick={() => openDialog({ kind: 'ban', student: selected })}>{isArabic ? 'حظر' : 'Ban'}</button> : <button className="secondary-action" disabled={busy} onClick={() => void unban(selected)}>{isArabic ? 'إعادة تفعيل' : 'Reactivate'}</button>}</article></div><div className="security-log"><div className="section-title"><div><p className="eyebrow">{isArabic ? 'السجل الأمني' : 'SECURITY LOG'}</p><h3>{isArabic ? 'آخر الأحداث المرئية' : 'Recent visible events'}</h3></div><ShieldCheck size={20} /></div>{logsLoading ? <div className="table-loading"><LoaderCircle className="spin" size={20} />{isArabic ? 'جارٍ تحميل السجل…' : 'Loading log…'}</div> : securityLogs.length === 0 ? <div className="log-empty">{isArabic ? 'لا توجد أحداث أمنية معروضة لهذا الطالب ضمن الصلاحيات الحالية.' : 'No security events are visible for this student within the current permissions.'}</div> : <div className="security-log-list">{securityLogs.map((log) => <article key={log.id} className={`security-event ${eventTone(log.severity)}`}><span><strong>{log.eventType}</strong><small>{dateLabel(log.createdAt, isArabic)}</small></span><p>{log.description}</p><em>{log.severity}</em></article>)}</div>}</div></section>}

    {dialog && <div className="dialog-backdrop" role="presentation" onMouseDown={() => !busy && setDialog(null)}><section className="dialog-card" role="dialog" aria-modal="true" aria-label={dialog.kind} onMouseDown={(event) => event.stopPropagation()}><div className="dialog-header"><div><span className="eyebrow">{isArabic ? 'إجراء محمي' : 'PROTECTED ACTION'}</span><h2>{dialog.kind === 'ban' ? (isArabic ? 'حظر حساب الطالب' : 'Ban student account') : dialog.kind === 'revoke-sessions' ? (isArabic ? 'إنهاء جلسات الطالب' : 'Revoke student sessions') : (isArabic ? 'إلغاء ربط جهاز الطالب' : 'Unbind student device')}</h2></div><button aria-label={isArabic ? 'إغلاق' : 'Close'} onClick={() => setDialog(null)} disabled={busy}><X /></button></div><form onSubmit={executeDialog} className="dialog-form"><p className="target-name">{dialog.student.fullName}<span>{dialog.student.phone}</span></p>{dialog.kind === 'ban' && <><label className="span-all">{isArabic ? 'سبب الحظر' : 'Ban reason'}<textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isArabic ? 'اكتب سبباً واضحاً وآمناً للتدقيق.' : 'Provide a clear, audit-safe reason.'} /></label><label className="span-all">{isArabic ? 'تاريخ انتهاء اختياري' : 'Optional expiry date'}<input type="date" value={banUntil} onChange={(event) => setBanUntil(event.target.value)} /></label></>}<p className="scope-note span-all"><CircleAlert size={16} />{dialog.kind === 'revoke-sessions' ? (isArabic ? 'سيؤدي هذا إلى إنهاء وصول الطالب من جميع الأجهزة. لا يمكن التراجع عن الجلسات المنتهية.' : 'This ends the student’s access on every device. Revoked sessions cannot be restored.') : dialog.kind === 'unbind-device' ? (isArabic ? 'سيطلب الخادم التحقق وربط الجهاز عند الدخول التالي. لا يحذف هذا الإجراء سجل الأحداث.' : 'The server will verify and bind a device at the next sign-in. This action preserves event history.') : (isArabic ? 'يُسجل الخادم هذا الإجراء الحساس. يمكن ترك تاريخ الانتهاء فارغاً للحظر المفتوح وفق السياسة.' : 'The server records this sensitive action. Leave expiry empty for an open-ended ban where policy permits.')}</p><div className="dialog-actions"><button type="button" className="secondary-action" onClick={() => setDialog(null)} disabled={busy}>{isArabic ? 'إلغاء' : 'Cancel'}</button><button type="submit" className={dialog.kind === 'ban' ? 'danger-action' : 'primary-action'} disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{dialog.kind === 'ban' ? (isArabic ? 'تأكيد الحظر' : 'Confirm ban') : dialog.kind === 'revoke-sessions' ? (isArabic ? 'إنهاء الجلسات' : 'Revoke sessions') : (isArabic ? 'تأكيد إلغاء الربط' : 'Confirm unbind')}</button></div></form></section></div>}
  </section>;
}
