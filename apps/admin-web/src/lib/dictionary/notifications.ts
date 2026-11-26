/**
 * PR-3 — notifications dictionary section (filled by the center migration).
 * Strings are moved BYTE-IDENTICAL from the component ternaries/copy
 * objects into this section; the component then reads them through
 * `t(locale, 'notifications.key')`.
 *
 * Sections:
 *   • compose — NotificationCompose.tsx (the local `t` copy object; the
 *     AUDIENCE_OPTIONS / NOTIFICATION_TYPES ar/en maps are notification
 *     metadata and stay as data in the component);
 *   • sent    — SentNotificationsDialog.tsx (ledger + delivery-stats copy);
 *   • root    — shared send toast + failure strings.
 *
 * Reused core entries (byte-identical, no duplication here):
 *   common.cancel (compose), topbar.sentNotifications + common.refresh +
 *   common.close (sent dialog).
 */
import type { DictSection } from './types';

export const notificationsDict = {
  sentToast: { ar: 'تم إرسال الإشعار إلى {{count}} طالب', en: 'Notification sent to {{count}} recipients' },
  sendFailed: { ar: 'فشل الإرسال', en: 'Send failed' },

  // ===== NotificationCompose =====
  compose: {
    title: { ar: 'إنشاء إشعار', en: 'Compose Notification' },
    desc: { ar: 'أرسل إشعاراً مستهدفاً للطلاب', en: 'Send a targeted notification to students' },
    notifTitle: { ar: 'العنوان', en: 'Title' },
    notifBody: { ar: 'النص', en: 'Body' },
    notifType: { ar: 'النوع', en: 'Type' },
    audience: { ar: 'الجمهور المستهدف', en: 'Target audience' },
    target: { ar: 'الهدف', en: 'Target' },
    schedule: { ar: 'الجدولة', en: 'Scheduling' },
    immediate: { ar: 'إرسال فوري', en: 'Send immediately' },
    scheduled: { ar: 'مجدول', en: 'Scheduled' },
    expiry: { ar: 'تاريخ الانتهاء (اختياري)', en: 'Expiry date (optional)' },
    preview: { ar: 'معاينة', en: 'Preview' },
    send: { ar: 'إرسال', en: 'Send' },
    selectTarget: { ar: 'اختر الهدف', en: 'Select target' },
    noTarget: { ar: 'لا يحتاج هدفاً', en: 'No target needed' },
    contextUniversity: { ar: 'الجامعة (للوصول إلى الهدف)', en: 'University (to reach the target)' },
    contextCollege: { ar: 'الكلية (للوصول إلى الهدف)', en: 'College (to reach the target)' },
    contextYear: { ar: 'السنة (للوصول إلى الهدف)', en: 'Year (to reach the target)' },
    contextSemester: { ar: 'الفصل (للوصول إلى المادة)', en: 'Semester (to reach the subject)' },
    needTargetHint: {
      ar: 'اختر الهدف من القائمة أعلاه لإتاحة زر الإرسال — الإرسال لا يعمل بدون هدف صالح.',
      en: 'Pick the target above to enable Send — sending requires a valid target.',
    },
    titlePlaceholder: { ar: 'اكتب عنوان الإشعار...', en: 'Enter notification title...' },
    bodyPlaceholder: { ar: 'اكتب نص الإشعار...', en: 'Enter notification body...' },
  },

  // ===== SentNotificationsDialog =====
  sentCount: { ar: '{{count}} إشعارًا', en: '{{count}} notification(s)' },
  sent: {
    desc: {
      ar: 'الإشعارات المرسلة سابقًا وإحصائيات تسليمها لكل إشعار.',
      en: 'Previously sent notifications with per-notification delivery stats.',
    },
    loading: { ar: 'جارٍ التحميل…', en: 'Loading…' },
    empty: { ar: 'لا توجد إشعارات مرسلة بعد', en: 'No sent notifications yet' },
    stats: { ar: 'الإحصائيات', en: 'Stats' },
    type: { ar: 'النوع', en: 'Type' },
    sentAt: { ar: 'وقت الإرسال', en: 'Sent at' },
    recipients: { ar: 'المستلمون', en: 'Recipients' },
    delivered: { ar: 'تم التسليم', en: 'Delivered' },
    read: { ar: 'القراءات', en: 'Read' },
    clicked: { ar: 'النقرات', en: 'Clicked' },
    failed: { ar: 'فشلت', en: 'Failed' },
    statsLoad: { ar: 'جارٍ تحميل الإحصائيات…', en: 'Loading stats…' },
    prev: { ar: 'السابق', en: 'Previous' },
    next: { ar: 'التالي', en: 'Next' },
    pageOf: { ar: 'صفحة {{page}} من {{totalPages}}', en: 'Page {{page}} of {{totalPages}}' },
    loadFailed: { ar: 'تعذر تحميل سجل الإشعارات', en: 'Could not load sent notifications' },
  },
} as const satisfies DictSection;
