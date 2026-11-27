/**
 * PR-6 — security dictionary section (Security Center).
 *
 * Owns every user-facing string of the new Security Center view:
 *   • title/description  — page header;
 *   • summary.*          — the honest metric strip (labels + window captions);
 *   • indicators.*       — deterministic suspicious-activity indicators;
 *   • events.*           — plain-language explanations per event category;
 *   • detail.*           — the event detail drawer (technical block + redaction notice);
 *   • filters.*          — the events-table filter furniture;
 *   • error/empty states — bilingual everywhere (no inline ternaries).
 *
 * Event-type short labels are NOT duplicated here: both centers share
 * `students.security.events.*` through lib/securityEventLabels.ts.
 */
import type { DictSection } from './types';

export const securityDict = {
  title: { ar: 'مركز الأمان', en: 'Security Center' },
  description: { ar: 'مؤشرات مشتقة من أحداث الأمان المسجلة في المنصة فقط، مع سجل الأحداث الكامل للتحقيق.', en: 'Indicators derived only from platform-recorded security events, with the full event log for investigation.' },

  // ===== Summary strip (GET /api/v1/security/summary) =====
  summary: {
    heading: { ar: 'ملخص الأحداث', en: 'Event summary' },
    generatedAt: { ar: 'وقت الحساب', en: 'Computed at' },
    unavailable: { ar: 'غير متاح', en: 'Unavailable' },
    sourceNote: { ar: 'تُحسب هذه الأرقام من أحداث الأمان المسجلة داخل المنصة فقط (آخر ٢٤ ساعة أو ٧ أيام) — دون أي مصدر خارجي أو استنتاج.', en: 'These numbers are computed from platform-recorded security events only (last 24 hours or 7 days) — no external data, no inference.' },
    failedLogins24h: {
      label: { ar: 'دخول فاشل (٢٤ ساعة)', en: 'Failed sign-ins (24h)' },
      caption: { ar: 'عدد محاولات الدخول الفاشلة خلال آخر ٢٤ ساعة.', en: 'Failed sign-in attempts over the last 24 hours.' },
    },
    failedLogins7d: {
      label: { ar: 'دخول فاشل (٧ أيام)', en: 'Failed sign-ins (7d)' },
      caption: { ar: 'عدد محاولات الدخول الفاشلة خلال آخر ٧ أيام.', en: 'Failed sign-in attempts over the last 7 days.' },
    },
    activeLockouts: {
      label: { ar: 'قفل مؤقت نشط', en: 'Active lockouts' },
      caption: { ar: 'حسابات مقفلة حالياً بعد محاولات دخول فاشلة متكررة.', en: 'Accounts currently locked after repeated failed sign-ins.' },
    },
    refreshReuse7d: {
      label: { ar: 'إعادة استخدام رمز تحديث (٧ أيام)', en: 'Refresh-token reuse (7d)' },
      caption: { ar: 'محاولات استخدام رمز تحديث مستهلَك — مؤشر اختطاف جلسة محتمل.', en: 'Attempts to reuse a consumed refresh token — a possible session-hijack signal.' },
    },
    criticalEvents7d: {
      label: { ar: 'أحداث حرجة (٧ أيام)', en: 'Critical events (7d)' },
      caption: { ar: 'الأحداث المصنفة «حرجة» خلال آخر ٧ أيام.', en: 'Events classified as critical over the last 7 days.' },
    },
    suspiciousAlerts7d: {
      label: { ar: 'تنبيهات مشبوهة (٧ أيام)', en: 'Suspicious alerts (7d)' },
      caption: { ar: 'أحداث تصنّفها المنصة كنشاط مشبوه خلال آخر ٧ أيام.', en: 'Events the platform classifies as suspicious over the last 7 days.' },
    },
    passwordResets7d: {
      label: { ar: 'إعادة تعيين كلمات مرور (٧ أيام)', en: 'Password resets (7d)' },
      caption: { ar: 'عمليات إعادة تعيين كلمة مرور نفّذها المديرون خلال آخر ٧ أيام.', en: 'Administrator password resets over the last 7 days.' },
    },
    mfa: {
      title: { ar: 'المصادقة الثنائية (٧ أيام)', en: 'Two-factor (7d)' },
      enabled: { ar: 'تفعيل', en: 'Enabled' },
      disabled: { ar: 'تعطيل', en: 'Disabled' },
      failed: { ar: 'فشل', en: 'Failed' },
      caption: { ar: 'أحداث تفعيل وتعطيل وفشل المصادقة الثنائية خلال آخر ٧ أيام.', en: '2FA enabled/disabled/failed events over the last 7 days.' },
    },
    topFailedIpsTitle: { ar: 'أكثر عناوين IP فشلاً في الدخول (٢٤ ساعة)', en: 'Top failed sign-in IPs (24h)' },
    topFailedIpsEmpty: { ar: 'لا توجد محاولات دخول فاشلة مسجلة خلال آخر ٢٤ ساعة.', en: 'No failed sign-in attempts recorded in the last 24 hours.' },
    summaryLoadError: { ar: 'تعذّر تحميل ملخص الأمان.', en: 'Unable to load the security summary.' },
    retry: { ar: 'إعادة المحاولة', en: 'Retry' },
  },

  // ===== Deterministic suspicious-activity indicators =====
  indicators: {
    heading: { ar: 'مؤشرات نشاط مشبوه', en: 'Suspicious-activity indicators' },
    empty: { ar: 'لا توجد مؤشرات نشاط مشبوه في النافذة الحالية — الأرقام المسجلة لا تستدعي تنبيهاً.', en: 'No suspicious-activity indicators in the current window — the recorded numbers do not warrant an alert.' },
    lockouts: {
      title: { ar: 'حسابات مقفلة مؤقتاً ({{count}})', en: 'Accounts under temporary lockout ({{count}})' },
      explanation: { ar: 'حسابات مقفلة الآن بعد محاولات دخول فاشلة متكررة. القفل مؤقت وينتهي تلقائياً حسب سياسة الخادم.', en: 'Accounts currently locked after repeated failed sign-ins. The lockout is temporary and expires automatically under the server policy.' },
      technical: { ar: 'المصدر: حالة القفل النشط المسجلة · النافذة: اللحظة الراهنة.', en: 'Source: recorded active-lockout state · Window: current moment.' },
    },
    refreshReuse: {
      title: { ar: 'إعادة استخدام رموز التحديث ({{count}})', en: 'Refresh-token reuse ({{count}})' },
      explanation: { ar: 'استُخدم رمز تحديث بعد استهلاكه — يحدث عادة عند محاولة تشغيل الجلسة من جهاز قديم أو نسخة مخترقة. تُنهي المنصة الجلسة المعنية فوراً.', en: 'A refresh token was used after already being consumed — typically an old device or a compromised client replaying a session. The platform revokes the affected session immediately.' },
      technical: { ar: 'المصدر: أحداث RefreshReuse المسجلة · النافذة: آخر ٧ أيام.', en: 'Source: recorded RefreshReuse events · Window: last 7 days.' },
    },
    suspicious: {
      title: { ar: 'تنبيهات نشاط مشبوه ({{count}})', en: 'Suspicious-activity alerts ({{count}})' },
      explanation: { ar: 'أحداث صنّفتها المنصة كنشاط مشبوه (مثل أدوات المطورين أو محاولات النسخ). راجع الأحداث الفردية أدناه للتقييم.', en: 'Events the platform classified as suspicious (e.g. developer tools or copy attempts). Review the individual events below to assess.' },
      technical: { ar: 'المصدر: أحداث SuspiciousActivity والتنبيهات الأمنية المسجلة · النافذة: آخر ٧ أيام.', en: 'Source: recorded SuspiciousActivity and security alerts · Window: last 7 days.' },
    },
    ipConcentration: {
      title: { ar: 'تركّز محاولات فاشلة من عنوان واحد', en: 'Failed attempts concentrated at one address' },
      explanation: { ar: 'عنوان IP واحد سجّل ١٠ محاولات دخول فاشلة أو أكثر خلال ٢٤ ساعة — نمط نموذجي لتخمين كلمات المرور. القفل المؤقت يحمي الحسابات المستهدفة.', en: 'One IP address recorded 10 or more failed sign-ins within 24 hours — a typical password-guessing pattern. Temporary lockouts protect the targeted accounts.' },
      technical: { ar: 'المصدر: عدّ محاولات الدخول الفاشلة حسب IP · النافذة: آخر ٢٤ ساعة.', en: 'Source: failed sign-ins counted per IP · Window: last 24 hours.' },
    },
  },

  // ===== Events table (GET /api/v1/security/audit-logs) =====
  events: {
    tableTitle: { ar: 'سجل الأحداث الأمنية', en: 'Security event log' },
    emptyTitle: { ar: 'لا توجد أحداث مطابقة للتصفية', en: 'No events match the filters' },
    emptyHint: { ar: 'عدّل الخطورة أو النوع أو نطاق التاريخ أو البحث.', en: 'Adjust severity, type, date range, or search.' },
    loadError: { ar: 'تعذّر تحميل الأحداث الأمنية.', en: 'Unable to load security events.' },
    retry: { ar: 'إعادة المحاولة', en: 'Retry' },
    openDetailTitle: { ar: 'عرض تفاصيل الحدث', en: 'View event details' },
    studentFilterActive: { ar: 'مصفّى بطالب محدد — يُدار من مركز الطلاب.', en: 'Filtered to one student — managed from the Students Center.' },
    clearStudentFilter: { ar: 'إزالة تصفية الطالب', en: 'Clear student filter' },
    actorNone: { ar: 'غير معروف', en: 'Unknown' },
    eventsRowSr: { ar: 'أحداث', en: 'events' },
    studentFilterLink: { ar: 'كل الأحداث الأمنية للطالب', en: 'All security events for this student' },
  },

  // ===== Event detail drawer =====
  detail: {
    drawerTitle: { ar: 'تفاصيل الحدث الأمني', en: 'Security event details' },
    descriptionTitle: { ar: 'الوصف الكامل', en: 'Full description' },
    technicalTitle: { ar: 'البيانات التقنية', en: 'Technical data' },
    eventType: { ar: 'نوع الحدث (قيمة النظام)', en: 'Event type (system value)' },
    correlationId: { ar: 'معرف الارتباط', en: 'Correlation ID' },
    ipAddress: { ar: 'عنوان IP', en: 'IP address' },
    fingerprint: { ar: 'بصمة الجهاز', en: 'Device fingerprint' },
    createdAt: { ar: 'وقت الحدث', en: 'Event time' },
    actor: { ar: 'الفاعل', en: 'Actor' },
    explanationTitle: { ar: 'ماذا يعني هذا الحدث؟', en: 'What does this event mean?' },
    redaction: { ar: 'يحجب النظام تلقائياً أي قيم حساسة (كلمات مرور، رموز) في نص السجل. الأوصاف مخزّنة منقّاة وتُعرض كنص عادي فقط.', en: 'The system automatically redacts sensitive values (passwords, tokens) from log text. Descriptions are stored sanitized and rendered as plain text only.' },
    close: { ar: 'إغلاق التفاصيل', en: 'Close details' },
  },

  // ===== Filters =====
  filters: {
    severityAll: { ar: 'الخطورة: الكل', en: 'Severity: All' },
    eventTypeAll: { ar: 'النوع: الكل', en: 'Type: All' },
    searchPlaceholder: { ar: 'ابحث في الأحداث', en: 'Search events' },
    searchA11y: { ar: 'بحث في الأحداث', en: 'Search events' },
    dateFrom: { ar: 'من تاريخ', en: 'From date' },
    dateTo: { ar: 'إلى تاريخ', en: 'To date' },
    clear: { ar: 'إزالة التصفية', en: 'Clear filters' },
    refresh: { ar: 'تحديث', en: 'Refresh' },
    refreshToast: { ar: 'تم تحديث البيانات.', en: 'Data refreshed.' },
    studentFilterLabel: { ar: 'تصفية بطالب', en: 'Student filter' },
  },

  // ===== Plain-language explanations per event category =====
  // Categories (not per-member copy): several event types share one sentence.
  eventsExplained: {
    loginSuccess: { ar: 'تسجيل دخول ناجح: تحققت المنصة من الهاتف وكلمة المرور وأُنشئت جلسة صالحة.', en: 'A successful sign-in: the platform verified the phone and password and created a valid session.' },
    loginFailed: { ar: 'محاولة دخول فاشلة: كلمة مرور غير صحيحة أو حساب مقفل. المحاولات المتكررة تؤدي إلى قفل مؤقت.', en: 'A failed sign-in attempt: wrong password or a locked account. Repeated attempts lead to a temporary lockout.' },
    logout: { ar: 'تسجيل خروج أنهى الجلسة عمداً من طرف الطالب.', en: 'A sign-out that ended the session deliberately from the student\u0027s side.' },
    session: { ar: 'دورة حياة الجلسة: إنشاء أو إنهاء جلسة — يُستخدم لتتبع الأجهزة وإنهاء الوصول.', en: 'Session lifecycle: a session was created or revoked — used to trace devices and end access.' },
    refresh: { ar: 'تجديد رمز الوصول ضمن الجلسة نفسها — سلوك طبيعي يحافظ على تسجيل الدخول.', en: 'An access-token refresh within the same session — normal behavior that keeps the user signed in.' },
    refreshReuse: { ar: 'إعادة استخدام رمز تحديث مستهلَك — مؤشر محاولة تشغيل جلسة من نسخة قديمة أو مخترقة؛ تُنهي المنصة الجلسة فوراً.', en: 'A consumed refresh token was reused — a signal of an old or compromised client replaying a session; the platform revokes it immediately.' },
    device: { ar: 'حدث ربط جهاز: تسجيل أو تغيير أو فشل ربط بصمة الجهاز بحساب الطالب.', en: 'A device-binding event: registering, changing, or failing to bind a device fingerprint to the student account.' },
    contentProtection: { ar: 'محاولة تحايل على حماية المحتوى (أدوات المطورين، لقطة شاشة، نسخ، تنزيل، طباعة) — تُسجَّل لأغراض التدقيق.', en: 'An attempt to bypass content protection (developer tools, screenshot, copy, download, print) — recorded for audit purposes.' },
    multipleAccounts: { ar: 'اشتباه بحسابات متعددة مرتبطة بنفس الشخص أو الجهاز — تُراجع يدوياً قبل أي إجراء.', en: 'A suspicion of multiple accounts tied to the same person or device — reviewed manually before any action.' },
    ban: { ar: 'إجراء حظر إداري على الحساب (إصدار أو رفع) مع سبب مسجل في سجل التدقيق.', en: 'An administrative ban action on the account (issued or lifted) with a reason recorded in the audit log.' },
    password: { ar: 'حدث كلمة مرور: تغيير من الطالب أو طلب استعادة عبر OTP أو إعادة تعيين من مدير.', en: 'A password event: changed by the student, reset via OTP, or reset by an administrator.' },
    mfa: { ar: 'حدث مصادقة ثنائية: تفعيل أو تعطيل أو فشل تحقق الرمز المؤقت.', en: 'A two-factor event: enabled, disabled, or a failed code verification.' },
    subscription: { ar: 'حدث اشتراك: تفعيل أو إبطال استحقاق المحتوى المميز.', en: 'A subscription event: activating or revoking a content entitlement.' },
    otp: { ar: 'حدث رمز تحقق: إرسال أو تحقق ناجح أو فشل رمز OTP للهاتف.', en: 'An OTP event: code sent, verified, or failed for the phone.' },
    file: { ar: 'حدث وصول لملف: وصول ناجح أو مرفوض، أو إصدار رابط موقّت، أو رفض فحص الفيروسات للملف.', en: 'A file-access event: successful or denied access, a signed URL issued, or a virus-scan rejection.' },
    entitlement: { ar: 'رفض استحقاق: طالبت الجلسة محتوى لا يملكه الطالب اشتراكاً صالحاً له.', en: 'An entitlement denial: the session requested content the student has no valid subscription for.' },
    offline: { ar: 'حدث حزم دون اتصال: إنشاء حزمة أو إبطالها أو رفض مزامنة خارج السياسة.', en: 'An offline-package event: a package created or revoked, or a sync rejected as out of policy.' },
    permission: { ar: 'تغيير صلاحيات أو أدوار: تعديل ما يملكه مدير من مفاتيح وصول.', en: 'A permissions or roles change: modifying an administrator\u0027s access keys.' },
    adminAction: { ar: 'إجراء إداري حساس نفّذه مدير (تعديل، نشر، حذف…) — يُسجَّل باسم المدير الفاعل.', en: 'A sensitive administrative action performed by an admin (edit, publish, delete…) — recorded under the acting admin\u0027s name.' },
    securityAlert: { ar: 'تنبيه أمني عام رصدته المنصة ولم يُصنّف تحت فئة أدق.', en: 'A general security alert the platform recorded that fits no finer category.' },
    suspiciousActivity: { ar: 'نشاط مشبوه: سلوك يخالف النمط الطبيعي (نقرات آلية، تلاعب…) — يُراجع قبل أي إجراء.', en: 'Suspicious activity: behavior that deviates from the normal pattern (automation, tampering…) — reviewed before any action.' },
    fallback: { ar: 'حدث أمني مسجّل ضمن نوع غير مفصّل — راجع الوصف التقني أدناه.', en: 'A recorded security event under an undetailed type — see the technical description below.' },
  },
} as const satisfies DictSection;
