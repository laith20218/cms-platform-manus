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
  X, Send, LoaderCircle, Bell, Calendar, Clock, Eye, Users,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';

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

  const audience = AUDIENCE_OPTIONS.find(a => a.value === targetType)!;

  useEffect(() => {
    if (targetType === 'University' && universities.length === 0) {
      apiRequest<{ items: typeof universities } | typeof universities>('/api/v1/universities?Page=1&PageSize=100', token)
        .then(res => setUniversities(Array.isArray(res) ? res : (res.items ?? [])))
        .catch(() => {});
    }
    if (targetType === 'Student' && students.length === 0) {
      apiRequest<{ items: typeof students } | typeof students>('/api/v1/admin/students?page=1&pageSize=100', token)
        .then(res => setStudents(Array.isArray(res) ? res : (res.items ?? [])))
        .catch(() => {});
    }
  }, [targetType, token]);

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
      onNotice(isArabic
        ? `تم إرسال الإشعار إلى ${res.recipientsCount} طالب`
        : `Notification sent to ${res.recipientsCount} recipients`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : isArabic ? 'فشل الإرسال' : 'Send failed';
      onError(msg);
    } finally { setBusy(false); }
  };

  const t = isArabic
    ? {
        title: 'إنشاء إشعار', desc: 'أرسل إشعاراً مستهدفاً للطلاب',
        notifTitle: 'العنوان', notifBody: 'النص', notifType: 'النوع',
        audience: 'الجمهور المستهدف', target: 'الهدف',
        schedule: 'الجدولة', immediate: 'إرسال فوري', scheduled: 'مجدول',
        expiry: 'تاريخ الانتهاء (اختياري)',
        preview: 'معاينة', send: 'إرسال', cancel: 'إلغاء',
        selectTarget: 'اختر الهدف', noTarget: 'لا يحتاج هدفاً',
        placeholder_title: 'اكتب عنوان الإشعار...', placeholder_body: 'اكتب نص الإشعار...',
      }
    : {
        title: 'Compose Notification', desc: 'Send a targeted notification to students',
        notifTitle: 'Title', notifBody: 'Body', notifType: 'Type',
        audience: 'Target audience', target: 'Target',
        schedule: 'Scheduling', immediate: 'Send immediately', scheduled: 'Scheduled',
        expiry: 'Expiry date (optional)',
        preview: 'Preview', send: 'Send', cancel: 'Cancel',
        selectTarget: 'Select target', noTarget: 'No target needed',
        placeholder_title: 'Enter notification title...', placeholder_body: 'Enter notification body...',
      };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onMouseDown={() => !busy && onClose()} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl border shadow-2xl flex flex-col"
        style={{ background: 'var(--cms-surface)', borderColor: 'var(--cms-line)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
          <div className="flex items-center gap-2">
            <Bell size={18} style={{ color: 'var(--cms-teal-700)' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.title}</h3>
          </div>
          <button onClick={() => !busy && onClose()} disabled={busy} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-50">
            <X size={18} style={{ color: 'var(--cms-text-muted)' }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>{t.notifType}</label>
            <select value={type} onChange={(e) => setType(e.target.value)} disabled={busy}
              className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
              {NOTIFICATION_TYPES.map(nt => <option key={nt.value} value={nt.value}>{isArabic ? nt.ar : nt.en}</option>)}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>{t.notifTitle}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.placeholder_title} disabled={busy}
              className="w-full h-9 rounded-lg border text-sm px-3 disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }} />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>{t.notifBody}</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.placeholder_body} rows={4} disabled={busy}
              className="w-full rounded-lg border text-sm p-3 disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }} />
          </div>

          {/* Audience */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                <Users size={11} className="inline mr-1" />{t.audience}
              </label>
              <select value={targetType} onChange={(e) => { setTargetType(e.target.value); setTargetId(''); }} disabled={busy}
                className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
                {AUDIENCE_OPTIONS.map(a => <option key={a.value} value={a.value}>{isArabic ? a.ar : a.en}</option>)}
              </select>
            </div>

            {/* Target selector */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>{t.target}</label>
              {audience.needsTarget ? (
                targetType === 'University' ? (
                  <select value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={busy || universities.length === 0}
                    className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                    style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
                    <option value="">{t.selectTarget}</option>
                    {universities.map(u => <option key={u.id} value={u.id}>{isArabic ? u.nameAr : (u.nameEn || u.nameAr)}</option>)}
                  </select>
                ) : targetType === 'Student' ? (
                  <select value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={busy || students.length === 0}
                    className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                    style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
                    <option value="">{t.selectTarget}</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.fullName} ({s.phone})</option>)}
                  </select>
                ) : (
                  <input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder={`${t.selectTarget} (UUID)`} disabled={busy}
                    className="w-full h-9 rounded-lg border text-xs px-2 font-mono disabled:opacity-50"
                    style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }} />
                )
              ) : (
                <div className="h-9 flex items-center px-3 rounded-lg border text-xs" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)', color: 'var(--cms-text-muted)' }}>
                  {t.noTarget}
                </div>
              )}
            </div>
          </div>

          {/* Scheduling */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                <Calendar size={11} className="inline mr-1" />{t.schedule}
              </label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} disabled={busy}
                className="w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50"
                style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }} />
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--cms-text-muted)' }}>{scheduledAt ? t.scheduled : t.immediate}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>
                <Clock size={11} className="inline mr-1" />{t.expiry}
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
                  <div className="text-sm font-semibold" style={{ color: 'var(--cms-text)' }}>{title || t.placeholder_title}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--cms-text-soft)' }}>{body || t.placeholder_body}</div>
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

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
          <button onClick={() => setPreviewMode(!previewMode)} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50"
            style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
            <Eye size={13} /> {t.preview}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy}
              className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
              {t.cancel}
            </button>
            <button onClick={() => void send()} disabled={!canSend || busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--cms-teal-700)' }}>
              {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />}
              {t.send}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
