/**
 * PR-3 — students dictionary section (filled by the center migration).
 *
 * Every entry was MOVED BYTE-IDENTICAL from the StudentsCenter inline
 * ternaries / label helpers (JSX, object literals, handler bodies, dialog
 * copy). The component now reads them through `t(locale, 'students.…')`.
 *
 * Conventions carried over from the pre-migration component:
 *   • «Revoke failed» is the English twin of two different Arabic failure
 *     messages (session revoke vs subscription revoke) — kept as two entries.
 *   • `en: '{{value}}'` entries reproduce the legacy unknown-value pass-through
 *     (Arabic rendered a fixed label, English echoed the raw wire value).
 *   • `students.security.events.*` — the Arabic labels are the authored copy;
 *     the English values mirror what the legacy code COMPUTED from the wire
 *     value (`eventType.replace(/([A-Z])/g, ' $1').trim()`), so both locales
 *     stay byte-identical for known event types. Unknown types keep the
 *     computed English label in the component (see eventTypeLabel).
 *   • `errors.*Fallback` — the legacy catch-arms were English-only literals;
 *     PR-3-A added the Arabic twins (marked below) per the fallback rule.
 *
 * Status glossaries (account/session/severity/scope/report-reason) live in
 * the central registry (`./statuses`) — the center's label helpers delegate
 * there and only the legacy pass-through defaults live in this section.
 */
import type { DictSection } from './types';

export const studentsDict = {
  // ===== Strings reused by several surfaces of the center =====
  common: {
    status: { ar: 'الحالة', en: 'Status' },
    lastSignIn: { ar: 'آخر دخول', en: 'Last sign-in' },
    loading: { ar: 'جارٍ التحميل...', en: 'Loading...' },
    cancel: { ar: 'إلغاء', en: 'Cancel' },
    close: { ar: 'إغلاق', en: 'Close' },
    userManagement: { ar: 'إدارة المستخدمين', en: 'User management' },
    addStudent: { ar: 'إضافة طالب', en: 'Add student' },
    editProfile: { ar: 'تعديل الملف', en: 'Edit profile' },
    banAccount: { ar: 'حظر الحساب', en: 'Ban account' },
    reactivate: { ar: 'إعادة التفعيل', en: 'Reactivate' },
    revokeSessions: { ar: 'إنهاء الجلسات', en: 'Revoke sessions' },
    unbindDevice: { ar: 'إلغاء ربط الجهاز', en: 'Unbind device' },
    academicProgress: { ar: 'التقدم الدراسي', en: 'Academic progress' },
    securityLog: { ar: 'السجل الأمني', en: 'Security log' },
    deviceActive: { ar: 'نشط', en: 'Active' },
    deviceInactive: { ar: 'معطّل', en: 'Inactive' },
    bound: { ar: 'الربط', en: 'Bound' },
    lastUsed: { ar: 'آخر استخدام', en: 'Last used' },
    revoke: { ar: 'إنهاء', en: 'Revoke' },
    fullName: { ar: 'الاسم الكامل', en: 'Full name' },
    university: { ar: 'الجامعة', en: 'University' },
    college: { ar: 'الكلية', en: 'College' },
    notSpecified: { ar: 'غير محدد', en: 'Not specified' },
    male: { ar: 'ذكر', en: 'Male' },
    female: { ar: 'أنثى', en: 'Female' },
  },

  // ===== Page header =====
  header: {
    title: { ar: 'الطلاب', en: 'Students' },
    subtitle: { ar: 'تُعرض النتائج وتُنفّذ الإجراءات ضمن نطاق المدير وصلاحياته من الخادم.', en: 'Results and protected actions are constrained by the acting administrator’s server-side scope and permissions.' },
  },

  // ===== Filter bar =====
  filters: {
    searchPlaceholder: { ar: 'ابحث بالاسم أو رقم الهاتف', en: 'Search name or phone' },
    universityAll: { ar: 'الجامعة: الكل', en: 'University: All' },
    statusAll: { ar: 'الحالة: الكل', en: 'Status: All' },
    clear: { ar: 'إزالة التصفية', en: 'Clear filters' },
  },

  // ===== Empty states =====
  list: {
    emptyFiltered: { ar: 'لا توجد نتائج مطابقة', en: 'No matching results' },
    empty: { ar: 'لا يوجد طلاب ضمن نطاقك بعد.', en: 'No students are available in your scope yet.' },
    emptyHint: { ar: 'عدّل عوامل التصفية أو أعد المحاولة لاحقاً.', en: 'Adjust the filters or try again later.' },
  },

  // ===== Students table =====
  table: {
    student: { ar: 'الطالب', en: 'Student' },
    academicPath: { ar: 'المسار الأكاديمي', en: 'Academic path' },
    activity: { ar: 'التفاعل', en: 'Activity' },
    actionsSr: { ar: 'إجراءات', en: 'Actions' },
    registeredAt: { ar: 'سُجّل في {{date}}', en: 'Registered {{date}}' },
    accuracyStat: { ar: '{{value}}% دقة', en: '{{value}}% accuracy' },
    viewProfileTitle: { ar: 'عرض الملف والسجل الأمني', en: 'View profile and security log' },
    rowActionsLabel: { ar: 'إجراءات {{name}}', en: 'Actions for {{name}}' },
    paginationSummary: { ar: 'النتائج {{from}}–{{to}} من {{total}}', en: 'Showing {{from}}–{{to}} of {{total}}' },
    previous: { ar: 'السابق', en: 'Previous' },
    pageOf: { ar: 'صفحة {{page}} من {{total}}', en: 'Page {{page}} of {{total}}' },
    next: { ar: 'التالي', en: 'Next' },
  },

  // ===== Slide-in drawer =====
  drawer: {
    ariaLabel: { ar: 'تفاصيل الطالب', en: 'Student details' },
    recordLabel: { ar: 'ملف الطالب', en: 'Student record' },
    closeDetails: { ar: 'إغلاق التفاصيل', en: 'Close details' },
    tabs: {
      overview: { ar: 'المعلومات الأساسية', en: 'Basic info' },
      exams: { ar: 'الاختبارات', en: 'Exams' },
      subscriptions: { ar: 'الاشتراكات', en: 'Subscriptions' },
      sessions: { ar: 'الجلسات والأجهزة', en: 'Sessions & devices' },
      reports: { ar: 'البلاغات', en: 'Reports' },
      // «التقدم الدراسي» / «السجل الأمني» tabs reuse common.academicProgress /
      // common.securityLog — byte-identical to the tab + heading copy.
    },
    overview: {
      answers: { ar: 'إجابات', en: 'Answers' },
      accuracy: { ar: 'دقة', en: 'Accuracy' },
      sessionsTitle: { ar: 'الجلسات', en: 'Sessions' },
      sessionsBody: { ar: 'إنهاء آمن لجميع الجلسات الحالية.', en: 'Securely revoke every current session.' },
      devicesTitle: { ar: 'الأجهزة', en: 'Devices' },
      devicesBody: { ar: 'يُلغي ربط الجهاز الحالي؛ لا يحذف سجل الأمان.', en: 'Removes the current device binding without deleting audit history.' },
      accountStatus: { ar: 'حالة الحساب', en: 'Account status' },
      banNote: { ar: 'سيُسجَّل الحظر مع سبب واضح للتدقيق.', en: 'A ban will be recorded with an audit-safe reason.' },
      reactivateNote: { ar: 'يمكن إعادة تفعيل الحساب فوراً.', en: 'The account can be reactivated immediately.' },
    },
  },

  // ===== Security log tab =====
  security: {
    recentEvents: { ar: 'آخر الأحداث المرئية', en: 'Recent visible events' },
    empty: { ar: 'لا توجد أحداث أمنية', en: 'No security events' },
    emptyHint: { ar: 'لم تُسجَّل أحداث أمنية لهذا الطالب ضمن الصلاحيات الحالية.', en: 'No security events are visible for this student within the current permissions.' },
    fingerprint: { ar: 'بصمة الجهاز', en: 'Fingerprint' },
    // Legacy unknown-severity behavior: Arabic showed a fixed label, English
    // echoed the raw wire value — reproduced by the pass-through template.
    severityUnknown: { ar: 'غير محدد', en: '{{value}}' },
    events: {
      loginSuccess: { ar: 'تسجيل دخول ناجح', en: 'Login Success' },
      loginFailed: { ar: 'فشل تسجيل الدخول', en: 'Login Failed' },
      logout: { ar: 'تسجيل خروج', en: 'Logout' },
      sessionCreated: { ar: 'إنشاء جلسة', en: 'Session Created' },
      sessionRevoked: { ar: 'إنهاء جلسة', en: 'Session Revoked' },
      refresh: { ar: 'تجديد رمز الجلسة', en: 'Refresh' },
      refreshReuse: { ar: 'تجديد رمز الجلسة', en: 'Refresh Reuse' },
      deviceRegistered: { ar: 'تسجيل جهاز', en: 'Device Registered' },
      deviceChange: { ar: 'تغيير جهاز', en: 'Device Change' },
      deviceBindingFailed: { ar: 'فشل ربط الجهاز', en: 'Device Binding Failed' },
      devtoolsDetected: { ar: 'كشف أدوات المطوّرين', en: 'Devtools Detected' },
      screenshotAttempt: { ar: 'محاولة التقاط شاشة', en: 'Screenshot Attempt' },
      copyAttempt: { ar: 'محاولة نسخ', en: 'Copy Attempt' },
      downloadAttempt: { ar: 'محاولة تنزيل', en: 'Download Attempt' },
      printAttempt: { ar: 'محاولة طباعة', en: 'Print Attempt' },
      multipleAccountsSuspected: { ar: 'اشتباه حسابات متعددة', en: 'Multiple Accounts Suspected' },
      banIssued: { ar: 'إصدار حظر', en: 'Ban Issued' },
      banLifted: { ar: 'رفع حظر', en: 'Ban Lifted' },
      passwordChanged: { ar: 'تغيير كلمة المرور', en: 'Password Changed' },
      passwordResetRequested: { ar: 'طلب استعادة كلمة المرور', en: 'Password Reset Requested' },
      mfaEnabled: { ar: 'تفعيل المصادقة الثنائية', en: 'Mfa Enabled' },
      mfaFailed: { ar: 'فشل المصادقة الثنائية', en: 'Mfa Failed' },
      mfaDisabled: { ar: 'تعطيل المصادقة الثنائية', en: 'Mfa Disabled' },
      subscriptionActivated: { ar: 'تفعيل اشتراك', en: 'Subscription Activated' },
      subscriptionRevoked: { ar: 'إبطال اشتراك', en: 'Subscription Revoked' },
      fileAccess: { ar: 'وصول لملف', en: 'File Access' },
      entitlementDenied: { ar: 'رفض استحقاق', en: 'Entitlement Denied' },
      otpSent: { ar: 'إرسال رمز تحقق', en: 'Otp Sent' },
      otpVerified: { ar: 'تحقق رمز OTP', en: 'Otp Verified' },
      otpFailed: { ar: 'فشل رمز OTP', en: 'Otp Failed' },
      // PR-6 — the remaining SecurityEventType members (Enums.cs) so every
      // enum name renders bilingually on both centers (student + security).
      permissionChange: { ar: 'تغيير صلاحية', en: 'Permission Change' },
      roleChange: { ar: 'تغيير دور', en: 'Role Change' },
      offlinePackageCreated: { ar: 'إنشاء حزمة دون اتصال', en: 'Offline Package Created' },
      offlinePackageRevoked: { ar: 'إبطال حزمة دون اتصال', en: 'Offline Package Revoked' },
      offlineSyncRejected: { ar: 'رفض مزامنة دون اتصال', en: 'Offline Sync Rejected' },
      adminScopeDenied: { ar: 'رفض وصول خارج نطاق المدير', en: 'Admin Scope Denied' },
      signedUrlIssued: { ar: 'إصدار رابط موقّت', en: 'Signed Url Issued' },
      fileAccessDenied: { ar: 'رفض وصول لملف', en: 'File Access Denied' },
      fileScanRejected: { ar: 'رفض فحص ملف', en: 'File Scan Rejected' },
      adminAction: { ar: 'إجراء إداري', en: 'Admin Action' },
      securityAlert: { ar: 'تنبيه أمني', en: 'Security Alert' },
      suspiciousActivity: { ar: 'نشاط مشبوه', en: 'Suspicious Activity' },
      // Unknown event types: Arabic label; English is computed from the wire
      // value in the component (legacy split-camelCase), so `en` is unused.
      fallback: { ar: 'حدث أمني', en: 'Security event' },
    },
  },

  // ===== PR-6 — student detail (GET /admin/students/{id}) overview panel =====
  detail: {
    accountStateTitle: { ar: 'حالة الحساب', en: 'Account state' },
    banReason: { ar: 'سبب الحظر', en: 'Ban reason' },
    banUntil: { ar: 'ينتهي الحظر في', en: 'Ban until' },
    lockoutTitle: { ar: 'قفل مؤقت بعد محاولات فاشلة', en: 'Temporary lockout' },
    lockoutUntil: { ar: 'مقفل حتى', en: 'Locked until' },
    failedAttempts: { ar: 'محاولات دخول فاشلة', en: 'Failed sign-in attempts' },
    phoneVerified: { ar: 'الهاتف موثّق', en: 'Phone verified' },
    phoneUnverified: { ar: 'الهاتف غير موثّق', en: 'Phone not verified' },
    mustChangePassword: { ar: 'يلزم تغيير كلمة المرور عند الدخول التالي', en: 'Must change password at next sign-in' },
    archivedTitle: { ar: 'مؤرشف — خارج الخدمة', en: 'Archived — out of service' },
    archivedExplanation: { ar: 'هذا الحساب مؤرشف (حذف منطقي): جلساته منتهية، ولا يظهر في القائمة الاعتيادية، ويمكن استعادته بالكامل في أي وقت.', en: 'This account is archived (soft delete): sessions are revoked, it is hidden from the normal list, and it can be fully restored at any time.' },
    archivedAt: { ar: 'أُرشف في', en: 'Archived at' },
    academicScopeTitle: { ar: 'النطاق الأكاديمي', en: 'Academic scope' },
    academicScopeExplanation: { ar: 'يحدد هذا النطاق المحتوى الظاهر للطالب: مواد وسنوات جامعته وكليته فقط.', en: 'This scope decides the content the student sees: subjects and years of their university and college only.' },
    academicYear: { ar: 'السنة', en: 'Academic year' },
    subscriptionsTitle: { ar: 'الاشتراكات', en: 'Subscriptions' },
    activeSubscriptions: { ar: 'اشتراكات نشطة', en: 'Active subscriptions' },
    latestSubscription: { ar: 'أحدث اشتراك', en: 'Latest subscription' },
    noSubscriptions: { ar: 'لا توجد اشتراكات لهذا الطالب.', en: 'No subscriptions for this student.' },
    identityTitle: { ar: 'هوية الحساب', en: 'Account identity' },
    loginCount: { ar: 'مرات الدخول', en: 'Sign-in count' },
    registeredAt: { ar: 'تاريخ التسجيل', en: 'Registered at' },
    loadError: { ar: 'تعذّر تحميل تفاصيل الطالب.', en: 'Unable to load the student details.' },
    retry: { ar: 'إعادة المحاولة', en: 'Retry' },
  },

  // ===== PR-6 — student activity tab (GET /admin/students/{id}/activity) =====
  activity: {
    title: { ar: 'سجل النشاط', en: 'Activity log' },
    typeAll: { ar: 'النوع: الكل', en: 'Type: All' },
    severityAll: { ar: 'الخطورة: الكل', en: 'Severity: All' },
    empty: { ar: 'لا توجد أحداث مطابقة للتصفية', en: 'No events match the filters' },
    emptyHint: { ar: 'عدّل النوع أو الخطورة أو نطاق التاريخ لرؤية المزيد.', en: 'Adjust the type, severity, or date range to see more.' },
    loadError: { ar: 'تعذّر تحميل سجل النشاط.', en: 'Unable to load the activity log.' },
    retry: { ar: 'إعادة المحاولة', en: 'Retry' },
    paginationNav: { ar: 'تصفح سجل النشاط', en: 'Browse activity log' },
    pagerSummary: { ar: 'النتائج {{from}}–{{to}} من {{total}}', en: 'Showing {{from}}–{{to}} of {{total}}' },
    pagerPrev: { ar: 'السابق', en: 'Previous' },
    pagerNext: { ar: 'التالي', en: 'Next' },
    actorUnknown: { ar: 'غير معروف', en: 'Unknown' },
    studentActor: { ar: 'الطالب', en: 'The student' },
  },

  // ===== PR-6 — password reset dialog (POST /admin/students/{id}/password-reset) =====
  passwordReset: {
    title: { ar: 'إعادة تعيين كلمة المرور', en: 'Reset password' },
    subtitle: { ar: 'إجراء محمي يتطلب كلمة مرورك الحالية وتأكيداً مكتوباً.', en: 'Protected action — requires your current password and a typed confirmation.' },
    actorPassword: { ar: 'كلمة مرورك الحالية', en: 'Your current password' },
    actorPasswordPlaceholder: { ar: 'كلمة مرور المدير الحالية', en: 'Current administrator password' },
    newPassword: { ar: 'كلمة المرور الجديدة', en: 'New password' },
    confirmPassword: { ar: 'تأكيد كلمة المرور الجديدة', en: 'Confirm new password' },
    forceLabel: { ar: 'إلزام الطالب بتغيير كلمة المرور عند الدخول التالي', en: 'Require the student to change the password at next sign-in' },
    consequence: { ar: 'سيُنفَّذ فوراً: تُنهى جميع جلسات الطالب، وتصبح كلمة المرور التي تحددها هنا هي كلمة دخوله. لن يعرض النظام كلمة المرور الجديدة مجدداً — أبلغها للطالب عبر قناة آمنة، وعليه تغييرها بعد الدخول.', en: 'Immediate effect: every student session is revoked and the password you set here becomes their sign-in password. The system will NEVER display the new password again — share it through a secure channel; the student should change it after signing in.' },
    typedConfirmLabel: { ar: 'اكتب رقم هاتف الطالب لتأكيد التنفيذ', en: 'Type the student\u0027s phone number to confirm' },
    typedConfirmPlaceholder: { ar: 'رقم هاتف الطالب', en: 'Student phone number' },
    typedConfirmHint: { ar: 'يجب مطابقة رقم الهاتف المعروض أعلاه لتفعيل زر التنفيذ.', en: 'Must match the phone number shown above to enable the button.' },
    submit: { ar: 'تنفيذ إعادة التعيين', en: 'Reset password now' },
    successToast: { ar: 'تمت إعادة تعيين كلمة المرور وإنهاء الجلسات.', en: 'Password reset and sessions revoked.' },
    failedToast: { ar: 'فشلت إعادة تعيين كلمة المرور.', en: 'Password reset failed.' },
    mismatch: { ar: 'كلمتا المرور الجديدتان غير متطابقتين.', en: 'The two new passwords do not match.' },
    actorPasswordRequired: { ar: 'أدخل كلمة مرورك الحالية أولاً.', en: 'Enter your current password first.' },
  },

  // ===== PR-6 — archive / restore (POST /admin/students/{id}/archive|restore) =====
  archive: {
    archiveTitle: { ar: 'أرشفة حساب الطالب', en: 'Archive student account' },
    archiveBody: { ar: 'الأرشفة حذف منطقي: تُنهى جلسات الطالب فوراً، ويختفي الحساب من القائمة الاعتيادية (يبقى مع بياناته عبر تصفية «مؤرشف»)، ويمكن استعادته لاحقاً دون فقد بيانات.', en: 'Archiving is a soft delete: the student\u0027s sessions are revoked immediately, the account disappears from the normal list (its data stays, reachable via the «Archived» filter), and it can be restored later with no data loss.' },
    archiveConfirm: { ar: 'تأكيد الأرشفة', en: 'Confirm archive' },
    archivedToast: { ar: 'تمت أرشفة حساب الطالب.', en: 'Student account archived.' },
    restoreTitle: { ar: 'استعادة حساب مؤرشف', en: 'Restore archived account' },
    restoreBody: { ar: 'سيُعاد الحساب إلى القائمة الاعتيادية بكامل بياناته. الأرشفة والأرشفة المتكررة آمنة — لا يوجد أثر جانبي.', en: 'The account returns to the normal list with all its data. Archiving and restoring are idempotent — no side effects.' },
    restoreConfirm: { ar: 'تأكيد الاستعادة', en: 'Confirm restore' },
    restoredToast: { ar: 'تمت استعادة حساب الطالب.', en: 'Student account restored.' },
    failedToast: { ar: 'تعذّر إكمال العملية.', en: 'The operation could not be completed.' },
    restoreAction: { ar: 'استعادة الحساب', en: 'Restore account' },
  },

  // ===== Sessions & devices tab =====
  sessions: {
    boundDevice: { ar: 'الجهاز المرتبط', en: 'Bound device' },
    fingerprint: { ar: 'البصمة', en: 'Fingerprint' },
    revokeActiveTitle: { ar: 'إنهاء الجلسات النشطة', en: 'Revoke active sessions' },
    revokeActiveBody: { ar: 'ينهي هذا الإجراء جميع الجلسات النشطة على مختلف الأجهزة فوراً. سيُطلب من الطالب تسجيل الدخول مجدداً.', en: 'This terminates every active session across devices immediately. The student must sign in again.' },
    unbindBody: { ar: 'يلغي ربط بصمة الجهاز الحالية، وسيُعاد التحقق عند الدخول التالي. لا يحذف سجل الأحداث.', en: 'Removes the current device fingerprint binding; the server will re-verify at the next sign-in. Audit history is preserved.' },
    listTitle: { ar: 'قائمة الجلسات', en: 'Sessions list' },
    empty: { ar: 'لا توجد جلسات مسجلة.', en: 'No sessions recorded.' },
    created: { ar: 'الإنشاء', en: 'Created' },
    lastActive: { ar: 'آخر نشاط', en: 'Last active' },
    revoked: { ar: 'أُنهيت', en: 'Revoked' },
    revokeThisTitle: { ar: 'إنهاء هذه الجلسة', en: 'Revoke this session' },
    // Legacy unknown-session behavior: Arabic fixed label, raw value in English.
    statusUnknown: { ar: 'غير معروفة', en: '{{status}}' },
    revokeConfirmTitle: { ar: 'إنهاء الجلسة', en: 'Revoke session' },
    revokeConfirmBody: { ar: 'سيُنهى نشاط هذه الجلسة فورًا وسيُطلب من الطالب تسجيل الدخول مجددًا على ذلك الجهاز.', en: 'This session is terminated immediately; the student must sign in again on that device.' },
  },

  // ===== Academic progress tab =====
  academic: {
    questionsAnswered: { ar: 'إجابات', en: 'Questions answered' },
    accuracy: { ar: 'الدقة', en: 'Accuracy' },
    perSubject: { ar: 'التقدم حسب المادة', en: 'Per-subject progress' },
    empty: { ar: 'لا توجد بيانات تقدم بعد. سيظهر هنا عند إجابة الطالب على الأسئلة.', en: 'No progress data yet. It will appear here once the student answers questions.' },
    correct: { ar: 'صحيحة', en: 'correct' },
    lastActivity: { ar: 'آخر نشاط', en: 'Last activity' },
  },

  // ===== Exams tab =====
  exams: {
    title: { ar: 'الاختبارات والنتائج', en: 'Exams & results' },
    empty: { ar: 'لم يخض هذا الطالب أي اختبار بعد.', en: 'This student has not taken any exams yet.' },
    inProgress: { ar: 'قيد التقدم', en: 'In progress' },
    passed: { ar: 'ناجح', en: 'Passed' },
    failed: { ar: 'راسب', en: 'Failed' },
    score: { ar: 'الدرجة', en: 'Score' },
  },

  // ===== Subscriptions tab =====
  subscriptions: {
    title: { ar: 'الاشتراكات والأكواد', en: 'Subscriptions & codes' },
    empty: { ar: 'لا توجد اشتراكات لهذا الطالب.', en: 'No subscriptions for this student.' },
    scopeLabel: { ar: 'نطاق', en: 'Scope' },
    active: { ar: 'نشط', en: 'Active' },
    expired: { ar: 'منتهي', en: 'Expired' },
    from: { ar: 'من', en: 'From' },
    until: { ar: 'إلى', en: 'Until' },
    revokedAt: { ar: 'ألغي في', en: 'Revoked at' },
    revokeThisTitle: { ar: 'إبطال هذا الاشتراك', en: 'Revoke this subscription' },
    revokeTitle: { ar: 'إبطال الاشتراك', en: 'Revoke subscription' },
    // {{scope}} exists only in the Arabic sentence (legacy behavior): the
    // English copy never interpolated the scope label.
    revokeBody: { ar: 'سيفقد الطالب وصوله للمحتوى ضمن نطاق «{{scope}}» حتى نهاية مدة الاشتراك. لا يمكن التراجع، وسيُسجَّل السبب في سجل التدقيق.', en: 'The student loses access to the content in this subscription’s scope until it expires. This cannot be undone; the reason is recorded in the audit log.' },
    confirmRevoke: { ar: 'تأكيد الإبطال', en: 'Confirm revoke' },
    revokeReasonLabel: { ar: 'سبب الإبطال', en: 'Revoke reason' },
    revokeReasonPlaceholder: { ar: 'سبب واضح وآمن للتدقيق.', en: 'A clear, audit-safe reason.' },
    // Legacy unknown-scope behavior: Arabic fixed label, raw value in English.
    scopeUnknown: { ar: 'نطاق غير معروف', en: '{{scope}}' },
  },

  // ===== Reports tab =====
  reports: {
    title: { ar: 'البلاغات المرتبطة', en: 'Associated reports' },
    empty: { ar: 'لم يقدّم هذا الطالب أي بلاغ.', en: 'This student has not filed any reports.' },
    reasonOther: { ar: 'أخرى', en: 'Other' },
    statusPending: { ar: 'قيد الانتظار', en: 'Pending' },
    statusReviewing: { ar: 'قيد المراجعة', en: 'Reviewing' },
    statusResolved: { ar: 'تم الحل', en: 'Resolved' },
    statusRejected: { ar: 'مرفوض', en: 'Rejected' },
    statusClosed: { ar: 'مغلق', en: 'Closed' },
  },

  // ===== Protected-action dialog (ban / revoke-sessions / unbind-device) =====
  dialog: {
    protectedAction: { ar: 'إجراء محمي', en: 'Protected action' },
    banTitle: { ar: 'حظر حساب الطالب', en: 'Ban student account' },
    revokeTitle: { ar: 'إنهاء جلسات الطالب', en: 'Revoke student sessions' },
    unbindTitle: { ar: 'إلغاء ربط جهاز الطالب', en: 'Unbind student device' },
    confirmBan: { ar: 'تأكيد الحظر', en: 'Confirm ban' },
    confirmUnbind: { ar: 'تأكيد إلغاء الربط', en: 'Confirm unbind' },
    scopeNoteBan: { ar: 'يُسجل الخادم هذا الإجراء الحساس. يمكن ترك تاريخ الانتهاء فارغاً للحظر المفتوح وفق السياسة.', en: 'The server records this sensitive action. Leave expiry empty for an open-ended ban where policy permits.' },
    scopeNoteRevoke: { ar: 'سيؤدي هذا إلى إنهاء وصول الطالب من جميع الأجهزة. لا يمكن التراجع عن الجلسات المنتهية.', en: 'This ends the student’s access on every device. Revoked sessions cannot be restored.' },
    scopeNoteUnbind: { ar: 'سيطلب الخادم التحقق وربط الجهاز عند الدخول التالي. لا يحذف هذا الإجراء سجل الأحداث.', en: 'The server will verify and bind a device at the next sign-in. This action preserves event history.' },
    banReason: { ar: 'سبب الحظر', en: 'Ban reason' },
    banReasonPlaceholder: { ar: 'أدخل سبباً واضحاً وآمناً للتدقيق.', en: 'Provide a clear, audit-safe reason.' },
    optionalExpiry: { ar: 'تاريخ انتهاء اختياري', en: 'Optional expiry date' },
  },

  // ===== Edit-profile modal =====
  editModal: {
    uploadAvatar: { ar: 'رفع صورة', en: 'Upload avatar' },
    avatarHint: { ar: 'JPG/PNG/WebP · حد أقصى 3MB', en: 'JPG/PNG/WebP · max 3MB' },
    gender: { ar: 'الجنس', en: 'Gender' },
    phone: { ar: 'الهاتف', en: 'Phone' },
    save: { ar: 'حفظ', en: 'Save' },
  },

  // ===== Create-student modal =====
  createModal: {
    title: { ar: 'إضافة طالب جديد', en: 'Add new student' },
    phone: { ar: 'رقم الهاتف', en: 'Phone' },
    phoneHint: { ar: 'صيغة سورية: يبدأ بـ 09 ويتكون من 10 أرقام.', en: 'Syrian format: starts with 09, 10 digits.' },
    password: { ar: 'كلمة المرور', en: 'Password' },
    passwordHint: { ar: '8 أحرف على الأقل.', en: 'At least 8 characters.' },
    chooseUniversity: { ar: 'اختر الجامعة', en: 'Choose university' },
    chooseCollege: { ar: 'اختر الكلية', en: 'Choose college' },
    year: { ar: 'السنة', en: 'Academic year' },
    chooseYear: { ar: 'اختر السنة', en: 'Choose year' },
    genderOptional: { ar: 'الجنس (اختياري)', en: 'Gender (optional)' },
    emailOptional: { ar: 'البريد الإلكتروني (اختياري)', en: 'Email (optional)' },
    submit: { ar: 'إنشاء الحساب', en: 'Create student' },
  },

  // ===== Confirm-reactivation dialog =====
  unban: {
    title: { ar: 'تأكيد إعادة التفعيل', en: 'Confirm reactivation' },
    question: { ar: 'هل تريد إعادة تفعيل حساب {{name}}؟', en: 'Reactivate {{name}}\u0027s account?' },
    description: { ar: 'سيُعاد تفعيل الحساب فوراً ويمكن للطالب تسجيل الدخول من جديد.', en: 'The account will be reactivated immediately and the student may sign in again.' },
  },

  // ===== Success / failure notices =====
  toasts: {
    sessionRevoked: { ar: 'تم إنهاء الجلسة', en: 'Session revoked' },
    sessionRevokeFailed: { ar: 'فشل إنهاء الجلسة', en: 'Revoke failed' },
    subscriptionRevoked: { ar: 'تم إبطال الاشتراك', en: 'Subscription revoked' },
    subscriptionRevokeFailed: { ar: 'فشل إبطال الاشتراك', en: 'Revoke failed' },
    banned: { ar: 'تم حظر الطالب وإنهاء جلساته وفق سياسة الخادم.', en: 'Student banned and their sessions were handled by the server policy.' },
    sessionsRevoked: { ar: 'تم إنهاء جميع الجلسات النشطة للطالب.', en: 'All active student sessions were revoked.' },
    deviceUnbound: { ar: 'تم إلغاء ربط جهاز الطالب. سيُعاد التحقق عند الدخول التالي.', en: 'Student device binding was removed. It will be verified again at the next sign-in.' },
    reactivated: { ar: 'تمت إعادة تفعيل حساب الطالب.', en: 'Student account reactivated.' },
    profileUpdated: { ar: 'تم تحديث ملف الطالب', en: 'Student profile updated' },
    updateFailed: { ar: 'فشل التحديث', en: 'Update failed' },
    avatarTooLarge: { ar: 'الصورة كبيرة جداً (الحد 3MB)', en: 'Image too large (max 3MB)' },
    avatarUploaded: { ar: 'تم رفع الصورة الشخصية', en: 'Avatar uploaded' },
    avatarUploadFailed: { ar: 'فشل رفع الصورة', en: 'Avatar upload failed' },
    studentCreated: { ar: 'تم إنشاء حساب الطالب بنجاح.', en: 'Student account created successfully.' },
  },

  // ===== Error surfaces (permission denials + catch fallbacks) =====
  errors: {
    loadForbidden: { ar: 'لا تملك صلاحية عرض الطلاب ضمن نطاقك الحالي.', en: 'You do not have permission to view students within your current scope.' },
    // Arabic twins added in PR-3-A — the legacy fallbacks were English-only.
    loadFallback: { ar: 'تعذّر تحميل الطلاب.', en: 'Unable to load students.' },
    securityLogForbidden: { ar: 'لا تملك صلاحية عرض السجل الأمني لهذا الطالب.', en: 'You do not have permission to view this student’s security log.' },
    securityLogFallback: { ar: 'تعذّر تحميل السجل الأمني.', en: 'Unable to load the security log.' },
    actionFallback: { ar: 'تعذّر إكمال الإجراء المحمي.', en: 'The protected action could not be completed.' },
    reactivateFallback: { ar: 'تعذّر إعادة تفعيل الطالب.', en: 'Unable to reactivate the student.' },
    collegesLoadFailed: { ar: 'تعذّر تحميل الكليات.', en: 'Unable to load colleges.' },
    yearsLoadFailed: { ar: 'تعذّر تحميل السنوات.', en: 'Unable to load academic years.' },
    createFailed: { ar: 'تعذّر إنشاء حساب الطالب.', en: 'Unable to create the student.' },
  },

  // ===== Form validation messages =====
  validation: {
    banReasonRequired: { ar: 'أدخل سبب الحظر قبل المتابعة.', en: 'Provide a ban reason before continuing.' },
    fullNameRequired: { ar: 'أدخل الاسم الكامل.', en: 'Enter the full name.' },
    phoneInvalid: { ar: 'رقم الهاتف يجب أن يبدأ بـ 09 ويتكون من 10 أرقام.', en: 'Phone must start with 09 and be 10 digits.' },
    passwordTooShort: { ar: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.', en: 'Password must be at least 8 characters.' },
    cascadeRequired: { ar: 'اختر الجامعة والكلية والسنة.', en: 'Choose university, college and academic year.' },
  },
} as const satisfies DictSection;
