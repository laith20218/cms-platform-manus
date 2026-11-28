/**
 * NotificationCompose — admin modal for composing + sending notifications.
 *
 * Composition:
 *   • Title + Body inputs
 *   • Audience selector (All / University / College / Year / Semester / Subject / Student)
 *   • Target selector (cascading: University → ... → Student when applicable)
 *   • Scheduling: immediate or scheduled (datetime-local)
 *   • Optional expiry (datetime-local)
 *   • Preview card before send
 *   • Send button with loading state
 *
 * Data source:
 *   POST /api/v1/notifications/send
 *   body: { type, title, body, targetType, targetId?, scheduledAt?, expiresAt? }
 */
import { useEffect, useState } from 'react';
import {
  Send, LoaderCircle, Bell, Calendar, Clock, Eye, Users,
} from 'lucide-react';
import { Dialog } from '@cms/ui';
import { ApiError, apiRequest } from '../lib/api';
import { t, localeOf } from '../lib/dictionary';

type Props = {
  token: string;
  isArabic: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const AUDIENCE_OPTIONS = [
  { value: 'All', ar: 'كل الطلاب', en: 'All students', needsTarget: false },
  { value: 'University', ar: 'جامعة محددة', en: 'Specific university', needsTarget: true },
  { value: 'College', ar: 'كلية محددة', en: 'Specific college', needsTarget: true },
  { value: 'Year', ar: 'سنة محددة', en: 'Specific year', needsTarget: true },
  { value: 'Semester', ar: 'فصل محدد', en: 'Specific semester', needsTarget: true },
  { value: 'Subject', ar: 'مادة محددة', en: 'Specific subject', needsTarget: true },
  { value: 'Student', ar: 'طالب محدد', en: 'Specific student', needsTarget: true },
];

const NOTIFICATION_TYPES = [
  { value: 'announcement', ar: 'إعلان', en: 'Announcement' },
  { value: 'subscription_alert', ar: 'تنبيه اشتراك', en: 'Subscription alert' },
  { value: 'new_content', ar: 'محتوى جديد', en: 'New content' },
  { value: 'security', ar: 'أمني', en: 'Security' },
  { value: 'message', ar: 'رسالة', en: 'Message' },
  { value: 'achievement', ar: 'إنجاز', en: 'Achievement' },
];

export function NotificationCompose({ token, isArabic, onClose, onError, onNotice }: Props) {
  // PR-2 — a11y retrofit (see the render comment): Escape busy-guarded, Tab
  // trap, scroll lock, focus capture + restore to the invoking bell button.
  const locale = localeOf(isArabic);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('announcement');
  const [targetType, setTargetType] = useState('All');
  const [targetId, setTargetId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // For target selection when targetType needs a specific ID
  const [universities, setUniversities] = useState<Array<{ id: string; nameAr: string; nameEn?: string | null }>>([]);
  const [students, setStudents] = useState<Array<{ id: string; fullName: string; phone: string }>>([]);
  // W5 (admin-ui): the audience cascade previously only loaded University and
  // Student target lists — picking College/Year/Semester/Subject left a raw
  // UUID input and a silently-disabled Send (debt D-22). Now a real cascade
  // resolves the target id from the hierarchy.
  const [cascadeUniversityId, setCascadeUniversityId] = useState('');
  const [cascadeCollegeId, setCascadeCollegeId] = useState('');
  const [cascadeYearId, setCascadeYearId] = useState('');
  const [cascadeSemesterId, setCascadeSemesterId] = useState('');
  const [colleges, setColleges] = useState<Array<{ id: string; nameAr: string; nameEn?: string | null }>>([]);
  const [years, setYears] = useState<Array<{ id: string; nameAr: string; nameEn?: string | null }>>([]);
  const [semesters, setSemesters] = useState<Array<{ id: string; nameAr: string; nameEn?: string | null }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; nameAr: string; nameEn?: string | null }>>([]);

  const audience = AUDIENCE_OPTIONS.find(a => a.value === targetType)!;

  useEffect(() => {
    // W5: universities also feed the cascade context for College/Year/Semester/Subject.
    const needsUniversities = targetType === 'University'
      || targetType === 'College' || targetType === 'Year' || targetType === 'Semester' || targetType === 'Subject';
    if (needsUniversities && universities.length === 0) {
      apiRequest<{ items: typeof universities } | typeof universities>('/api/v1/universities?Page=1&PageSize=100', token)
        .then(res => setUniversities(Array.isArray(res) ? res : (res.items ?? [])))
        .catch(() => {});
    }
    if (targetType === 'Student' && students.length === 0) {
      apiRequest<{ items: typeof students } | typeof students>('/api/v1/admin/students?page=1&pageSize=100', token)
        .then(res => setStudents(Array.isArray(res) ? res : (res.items ?? [])))
        .catch(() => {});
    }
    // W23.3 (A2): the length guards are now declared deps — refetch only on
    // empty→filled transitions (the guard itself no-ops the refetch).
  }, [targetType, token, universities.length, students.length]);

  // W5: cascade loaders for the College/Year/Semester/Subject audiences.
  useEffect(() => {
    if (!cascadeUniversityId) { setColleges([]); return; }
    apiRequest<typeof colleges>(`/api/v1/universities/${cascadeUniversityId}/colleges`, token)
      .then(res => setColleges(Array.isArray(res) ? res : []))
      .catch(() => setColleges([]));
  }, [cascadeUniversityId, token]);

  useEffect(() => {
    if (!cascadeCollegeId) { setYears([]); return; }
    apiRequest<typeof years>(`/api/v1/colleges/${cascadeCollegeId}/years`, token)
      .then(res => setYears(Array.isArray(res) ? res : []))
      .catch(() => setYears([]));
  }, [cascadeCollegeId, token]);

  useEffect(() => {
    if (!cascadeYearId) { setSemesters([]); return; }
    apiRequest<typeof semesters>(`/api/v1/years/${cascadeYearId}/semesters`, token)
      .then(res => setSemesters(Array.isArray(res) ? res : []))
      .catch(() => setSemesters([]));
  }, [cascadeYearId, token]);

  useEffect(() => {
    if (!cascadeSemesterId) { setSubjects([]); return; }
    apiRequest<typeof subjects>(`/api/v1/semesters/${cascadeSemesterId}/subjects`, token)
      .then(res => setSubjects(Array.isArray(res) ? res : []))
      .catch(() => setSubjects([]));
  }, [cascadeSemesterId, token]);

  const canSend = title.trim() && body.trim() && (!audience.needsTarget || targetId);

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        type,
        title: title.trim(),
        body: body.trim(),
        targetType,
        targetId: audience.needsTarget ? targetId : null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      const res = await apiRequest<{ notificationId: string; recipientsCount: number; isScheduled: boolean }>(
        '/api/v1/notifications/send', token,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      onNotice(t(locale, 'notifications.sentToast', { count: res.recipientsCount }));
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : t(locale, 'notifications.sendFailed');
      onError(msg);
    } finally { setBusy(false); }
  };

  const copy = {
    title: t(locale, 'notifications.compose.title'),
    desc: t(locale, 'notifications.compose.desc'),
    notifTitle: t(locale, 'notifications.compose.notifTitle'),
    notifBody: t(locale, 'notifications.compose.notifBody'),
    notifType: t(locale, 'notifications.compose.notifType'),
    audience: t(locale, 'notifications.compose.audience'),
    target: t(locale, 'notifications.compose.target'),
    schedule: t(locale, 'notifications.compose.schedule'),
    immediate: t(locale, 'notifications.compose.immediate'),
    scheduled: t(locale, 'notifications.compose.scheduled'),
    expiry: t(locale, 'notifications.compose.expiry'),
    preview: t(locale, 'notifications.compose.preview'),
    send: t(locale, 'notifications.compose.send'),
    cancel: t(locale, 'common.cancel'),
    selectTarget: t(locale, 'notifications.compose.selectTarget'),
    noTarget: t(locale, 'notifications.compose.noTarget'),
    contextUniversity: t(locale, 'notifications.compose.contextUniversity'),
    contextCollege: t(locale, 'notifications.compose.contextCollege'),
    contextYear: t(locale, 'notifications.compose.contextYear'),
    contextSemester: t(locale, 'notifications.compose.contextSemester'),
    needTargetHint: t(locale, 'notifications.compose.needTargetHint'),
    sending: t(locale, 'notifications.compose.sending'),
    placeholder_title: t(locale, 'notifications.compose.titlePlaceholder'),
    placeholder_body: t(locale, 'notifications.compose.bodyPlaceholder'),
  };

  return (
    // Command Center final pass — the compose surface rides the shared
    // @cms/ui Dialog shell (portal, focus trap/return, Escape, scroll lock,
    // deliberate backdrop) instead of the hand-rolled retrofit panel.
    <Dialog
      open
      onOpenChange={(next) => { if (!next && !busy) onClose(); }}
      title={copy.title}
      dir={isArabic ? 'rtl' : 'ltr'}
      size="lg"
      dismissGuard={busy}
      testId="notification-compose-dialog"
    >
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>{copy.notifType}</label>
            <select value={type} onChange={(e) => setType(e.target.value)} disabled={busy} aria-label={copy.notifType}
              className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
              {NOTIFICATION_TYPES.map(nt => <option key={nt.value} value={nt.value}>{isArabic ? nt.ar : nt.en}</option>)}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>{copy.notifTitle}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={copy.placeholder_title} disabled={busy}
              className="w-full h-9 rounded-lg border text-sm px-3 disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }} />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>{copy.notifBody}</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={copy.placeholder_body} rows={4} disabled={busy}
              className="w-full rounded-lg border text-sm p-3 disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }} />
          </div>

          {/* Audience */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                <Users size={11} className="inline mr-1" />{copy.audience}
              </label>
              <select value={targetType} aria-label={copy.audience} onChange={(e) => {
                setTargetType(e.target.value);
                setTargetId('');
                setCascadeUniversityId(''); setCascadeCollegeId(''); setCascadeYearId(''); setCascadeSemesterId('');
              }} disabled={busy}
                className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
                {AUDIENCE_OPTIONS.map(a => <option key={a.value} value={a.value}>{isArabic ? a.ar : a.en}</option>)}
              </select>
            </div>

            {/* Target selector — W5: every audience resolves through a real
                picker. College/Year/Semester/Subject walk the hierarchy with
                context selects above the target level (previously a raw UUID
                input + silently-disabled Send, debt D-22). */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>{copy.target}</label>
              {!audience.needsTarget ? (
                <div className="h-9 flex items-center px-3 rounded-lg border text-xs" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)', color: 'var(--cms-text-muted)' }}>
                  {copy.noTarget}
                </div>
              ) : targetType === 'University' ? (
                <select value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={busy || universities.length === 0} aria-label={copy.target}
                  className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                  style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
                  <option value="">{copy.selectTarget}</option>
                  {universities.map(u => <option key={u.id} value={u.id}>{isArabic ? u.nameAr : (u.nameEn || u.nameAr)}</option>)}
                </select>
              ) : targetType === 'Student' ? (
                <select value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={busy || students.length === 0} aria-label={copy.target}
                  className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                  style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
                  <option value="">{copy.selectTarget}</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.fullName} ({s.phone})</option>)}
                </select>
              ) : (
                <div className="space-y-1.5">
                  <select value={cascadeUniversityId} onChange={(e) => {
                    setCascadeUniversityId(e.target.value); setCascadeCollegeId(''); setCascadeYearId(''); setCascadeSemesterId('');
                    if (targetType !== 'College') setTargetId('');
                  }} disabled={busy} aria-label={copy.contextUniversity}
                    className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                    style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
                    <option value="">{copy.contextUniversity}</option>
                    {universities.length === 0 ? null : universities.map(u => <option key={u.id} value={u.id}>{isArabic ? u.nameAr : (u.nameEn || u.nameAr)}</option>)}
                  </select>
                  {(targetType === 'Year' || targetType === 'Semester' || targetType === 'Subject') && (
                    <select value={cascadeCollegeId} onChange={(e) => {
                      setCascadeCollegeId(e.target.value); setCascadeYearId(''); setCascadeSemesterId('');
                      if (targetType !== 'Year') setTargetId('');
                    }} disabled={busy || !cascadeUniversityId} aria-label={copy.contextCollege}
                      className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                      style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
                      <option value="">{copy.contextCollege}</option>
                      {colleges.map(c => <option key={c.id} value={c.id}>{isArabic ? c.nameAr : (c.nameEn || c.nameAr)}</option>)}
                    </select>
                  )}
                  {(targetType === 'Semester' || targetType === 'Subject') && (
                    <select value={cascadeYearId} onChange={(e) => {
                      setCascadeYearId(e.target.value); setCascadeSemesterId('');
                      if (targetType !== 'Semester') setTargetId('');
                    }} disabled={busy || !cascadeCollegeId} aria-label={copy.contextYear}
                      className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                      style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
                      <option value="">{copy.contextYear}</option>
                      {years.map(y => <option key={y.id} value={y.id}>{isArabic ? y.nameAr : (y.nameEn || y.nameAr)}</option>)}
                    </select>
                  )}
                  {targetType === 'Subject' && (
                    <select value={cascadeSemesterId} onChange={(e) => {
                      setCascadeSemesterId(e.target.value); setTargetId('');
                    }} disabled={busy || !cascadeYearId} aria-label={copy.contextSemester}
                      className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                      style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
                      <option value="">{copy.contextSemester}</option>
                      {semesters.map(s => <option key={s.id} value={s.id}>{isArabic ? s.nameAr : (s.nameEn || s.nameAr)}</option>)}
                    </select>
                  )}
                  {/* The final select IS the target (its value is targetId). */}
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    aria-label={copy.target}
                    disabled={busy || !cascadeUniversityId
                      || (targetType !== 'College' && !cascadeCollegeId)
                      || ((targetType === 'Semester' || targetType === 'Subject') && !cascadeYearId)
                      || (targetType === 'Subject' && !cascadeSemesterId)}
                    data-testid="notification-target-select"
                    className="w-full h-9 rounded-lg border text-xs px-2 font-medium disabled:opacity-50"
                    style={{ borderColor: 'var(--cms-teal-700)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                  >
                    <option value="">{copy.selectTarget}</option>
                    {(targetType === 'College' ? colleges
                      : targetType === 'Year' ? years
                      : targetType === 'Semester' ? semesters
                      : subjects).map(item => (
                      <option key={item.id} value={item.id}>{isArabic ? item.nameAr : (item.nameEn || item.nameAr)}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* W5: visible Arabic validation instead of a silently-disabled Send. */}
              {audience.needsTarget && !targetId && (
                <p className="text-[10px] mt-1" style={{ color: 'var(--cms-warning)' }} data-testid="notification-target-hint">
                  {copy.needTargetHint}
                </p>
              )}
            </div>
          </div>

          {/* Scheduling */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                <Calendar size={11} className="inline mr-1" />{copy.schedule}
              </label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} disabled={busy}
                className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }} />
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--cms-text-muted)' }}>{scheduledAt ? copy.scheduled : copy.immediate}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                <Clock size={11} className="inline mr-1" />{copy.expiry}
              </label>
              <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} disabled={busy}
                className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }} />
            </div>
          </div>

          {/* Preview */}
          {previewMode && (title || body) && (
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-teal-100)', background: 'var(--cms-teal-50)' }}>
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--cms-teal-700)', color: 'white' }}>
                  <Bell size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{title || copy.placeholder_title}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--cms-text-soft)' }}>{body || copy.placeholder_body}</div>
                  <div className="flex gap-2 mt-1.5 text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>
                    <span>{NOTIFICATION_TYPES.find(nt => nt.value === type)?.[isArabic ? 'ar' : 'en']}</span>
                    <span>·</span>
                    <span>{AUDIENCE_OPTIONS.find(a => a.value === targetType)?.[isArabic ? 'ar' : 'en']}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer — secondary (preview/cancel) left, primary (send) right in RTL */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4" style={{ borderColor: 'var(--cms-line)', background: 'var(--c-bg-elevated, var(--cms-ivory-50))' }}>
          <button onClick={() => setPreviewMode(!previewMode)} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50"
            style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
            <Eye size={13} aria-hidden="true" /> {copy.preview}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy}
              className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
              {copy.cancel}
            </button>
            <button onClick={() => void send()} disabled={!canSend || busy} data-testid="notification-compose-send"
              className="inline-flex min-w-28 items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--cms-teal-700)' }}>
              {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />}
              {busy ? copy.sending : copy.send}
            </button>
          </div>
        </div>
    </Dialog>
  );
}
