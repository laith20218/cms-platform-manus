/**
 * CMS Admin — Core dictionary sections (PR-3 / DESIGN-01).
 *
 * Sections in this file:
 *   • preserved from the original `lib/dictionary.ts` (login, navGroups, nav,
 *     topbar, common, dashboard, admins, roles, scope) — byte-identical
 *     strings, now actually consumed;
 *   • the PR-3 shell migration (nav additions, shell, palette, notFound,
 *     twoFactor login step, twoFactorCard, modal, errorBoundary, scopeSummary,
 *     status health, viewTitles, confirm dialogs, toasts);
 *   • nothing center-specific — each center owns its own section module
 *     (`./students`, `./questions`, …) composed by `./index`.
 *
 * Arabic is the primary product language: professional, concise, institutional
 * (medical-education register). English output stays supported everywhere the
 * product already supports it.
 */
import type { DictSection } from './types';

export const coreDict = {
  // ===== Login (preserved) =====
  login: {
    title: { ar: 'دخول إلى لوحة الإدارة', en: 'Sign in to the administration console' },
    description: { ar: 'أدر المحتوى والاختبارات والصلاحيات ضمن نطاقك الأكاديمي.', en: 'Manage content, exams, and permissions within your academic scope.' },
    email: { ar: 'البريد الإلكتروني', en: 'Email address' },
    password: { ar: 'كلمة المرور', en: 'Password' },
    submit: { ar: 'دخول آمن', en: 'Secure sign in' },
    errorInvalid: { ar: 'البريد أو كلمة المرور غير صحيحة', en: 'Invalid email or password' },
    errorRequired: { ar: 'هذا الحقل مطلوب', en: 'This field is required' },
    securityNote: { ar: 'لا تُحفظ بيانات الدخول في المتصفح. ينتهي الوصول عند تسجيل الخروج.', en: 'Credentials are not stored in the browser. Access ends when you sign out.' },
    environment: { ar: 'بيئة الإنتاج', en: 'Production environment' },
    heroLine1: { ar: 'إدارة أكاديمية', en: 'Academic operations,' },
    heroLine2: { ar: 'بدقة مؤسسية.', en: 'institutional precision.' },
    heroBody: { ar: 'راجع الصلاحيات قبل نشر أي تغيير. هذه قناة التشغيل المؤسسية للتعليم الطبي.', en: 'Review access before publishing any change. This is the institutional operations channel for medical education.' },
    systemReady: { ar: 'قناة الإدارة مؤمّنة', en: 'Administration channel secured' },
    // PR-2 2FA login step (dictionary-sourced in PR-3).
    otpLabel: { ar: 'رمز التحقق الثنائي (2FA)', en: 'Two-factor code (2FA)' },
    otpHint: { ar: 'أدخل الرمز المؤقت من تطبيق المصادقة لديك لإكمال الدخول.', en: 'Enter the temporary code from your authenticator app to complete sign-in.' },
    backToCredentials: { ar: 'العودة إلى بيانات الدخول', en: 'Back to sign-in details' },
    // PR-3 — sign-in failure fallback (previously an inline Arabic literal).
    errorGeneric: { ar: 'تعذر التحقق من بيانات الدخول.', en: 'Could not verify the sign-in details.' },
  },

  // ===== Navigation Groups (preserved) =====
  navGroups: {
    daily: { ar: 'التشغيل اليومي', en: 'Daily Operations' },
    content: { ar: 'المحتوى الأكاديمي', en: 'Academic Content' },
    access: { ar: 'المستخدمون والوصول', en: 'Users & Access' },
    audit: { ar: 'القياس والتدقيق', en: 'Measurement & Audit' },
    system: { ar: 'النظام', en: 'System' },
  },

  // ===== Nav Items (preserved + PR-3 additions for every routable view) =====
  nav: {
    overview: { ar: 'لوحة القيادة', en: 'Command Center' },
    // PR-3 — shell variant: the App copy used lower-case «Command center».
    overviewShell: { ar: 'لوحة القيادة', en: 'Command center' },
    students: { ar: 'الطلاب', en: 'Students' },
    academic: { ar: 'البنية الأكاديمية', en: 'Academic Structure' },
    questions: { ar: 'بنك الأسئلة', en: 'Question Bank' },
    exams: { ar: 'الاختبارات', en: 'Exams' },
    library: { ar: 'المكتبة والملفات', en: 'Library & Files' },
    codes: { ar: 'رموز الوصول', en: 'Access Codes' },
    admins: { ar: 'المدراء', en: 'Administrators' },
    roles: { ar: 'الأدوار والصلاحيات', en: 'Roles & Permissions' },
    // PR-3 — shell variant: the App copy's mixed-case English label.
    rolesShell: { ar: 'الأدوار والصلاحيات', en: 'Roles & permissions' },
    // PR-3 — views that previously lived only as inline shell ternaries.
    examCourses: { ar: 'الدورات الامتحانية', en: 'Exam Courses' },
    reports: { ar: 'التقارير والتحليلات', en: 'Reports & Analytics' },
    auditLog: { ar: 'السجل الأمني', en: 'Security Audit' },
    // PR-6 — Security Center (super-only; rides the audit permission key).
    security: { ar: 'مركز الأمان', en: 'Security Center' },
    offline: { ar: 'الحزم دون اتصال', en: 'Offline Packages' },
    settings: { ar: 'إعدادات النظام', en: 'System Settings' },
    content: { ar: 'صفحات المحتوى', en: 'Content Pages' },
  },

  // ===== Topbar (preserved + a11y additions) =====
  topbar: {
    search: { ar: 'بحث سريع...', en: 'Quick search...' },
    notifications: { ar: 'التنبيهات', en: 'Notifications' },
    help: { ar: 'المساعدة', en: 'Help' },
    language: { ar: 'English', en: 'العربية' },
    darkMode: { ar: 'الوضع الليلي', en: 'Dark mode' },
    lightMode: { ar: 'الوضع النهاري', en: 'Light mode' },
    toggleTheme: { ar: 'تبديل المظهر', en: 'Toggle theme' },
    statusHealthy: { ar: 'الخدمة تعمل', en: 'Service operational' },
    statusDegraded: { ar: 'أداء متدنٍ', en: 'Degraded' },
    statusUnknown: { ar: 'حالة غير معروفة', en: 'Unknown' },
    signOut: { ar: 'تسجيل الخروج', en: 'Sign out' },
    operator: { ar: 'المشغّل', en: 'Operator' },
    // PR-3 — a11y labels previously inline in App.tsx.
    composeNotification: { ar: 'إنشاء إشعار', en: 'Compose notification' },
    sentNotifications: { ar: 'سجل الإشعارات المرسلة', en: 'Sent notifications' },
    openPalette: { ar: 'فتح لوحة الأوامر', en: 'Open command palette' },
  },

  // ===== Common (preserved) =====
  common: {
    save: { ar: 'حفظ', en: 'Save' },
    cancel: { ar: 'إلغاء', en: 'Cancel' },
    create: { ar: 'إنشاء', en: 'Create' },
    edit: { ar: 'تعديل', en: 'Edit' },
    delete: { ar: 'حذف', en: 'Delete' },
    archive: { ar: 'أرشفة', en: 'Archive' },
    publish: { ar: 'نشر', en: 'Publish' },
    search: { ar: 'بحث', en: 'Search' },
    filter: { ar: 'تصفية', en: 'Filter' },
    clear: { ar: 'مسح', en: 'Clear' },
    refresh: { ar: 'تحديث', en: 'Refresh' },
    loading: { ar: 'جارٍ التحميل...', en: 'Loading...' },
    noData: { ar: 'لا توجد بيانات', en: 'No data available' },
    noResults: { ar: 'لا توجد نتائج مطابقة', en: 'No matching results' },
    error: { ar: 'حدث خطأ', en: 'An error occurred' },
    permissionDenied: { ar: 'لا تملك صلاحية الوصول', en: 'Permission denied' },
    confirm: { ar: 'تأكيد', en: 'Confirm' },
    close: { ar: 'إغلاق', en: 'Close' },
    active: { ar: 'نشط', en: 'Active' },
    disabled: { ar: 'معطّل', en: 'Disabled' },
    all: { ar: 'الكل', en: 'All' },
    status: { ar: 'الحالة', en: 'Status' },
    actions: { ar: 'إجراءات', en: 'Actions' },
    created: { ar: 'تاريخ الإنشاء', en: 'Created' },
    updated: { ar: 'آخر تحديث', en: 'Last updated' },
    yes: { ar: 'نعم', en: 'Yes' },
    no: { ar: 'لا', en: 'No' },
  },

  // ===== Dashboard (preserved + PR-3 additions) =====
  dashboard: {
    welcome: { ar: 'مرحباً', en: 'Welcome' },
    totalStudents: { ar: 'إجمالي الطلاب', en: 'Total students' },
    activeToday: { ar: 'نشط اليوم', en: 'Active today' },
    publishedQuestions: { ar: 'الأسئلة المنشورة', en: 'Published questions' },
    publishedExams: { ar: 'الاختبارات المنشورة', en: 'Published exams' },
    libraryFiles: { ar: 'ملفات المكتبة', en: 'Library files' },
    activeCodes: { ar: 'أكواد نشطة', en: 'Active codes' },
    pendingReports: { ar: 'بلاغات معلّقة', en: 'Pending reports' },
    monthlyRevenue: { ar: 'إيراد الشهر', en: 'Monthly revenue' },
    statsLoading: { ar: 'جارٍ تحميل المؤشرات...', en: 'Loading metrics...' },
    statsError: { ar: 'تعذّر تحميل المؤشرات', en: 'Could not load metrics' },
    noMetrics: { ar: 'لا تتوفر مؤشرات تشغيلية لهذا الحساب.', en: 'No operational metrics available for this account.' },
    // PR-3 — overview stat cards (previously in the App `copy` object).
    activeSubscriptions: { ar: 'اشتراكات فعّالة', en: 'Active subscriptions' },
    welcomeShort: { ar: 'مرحبًا بك', en: 'Welcome' },
    welcomeAdmin: { ar: 'لوحة المشغّل', en: 'Operator console' },
    welcomeBody: { ar: 'لا تتوفر مؤشرات تشغيلية لهذا الحساب. تواصل مع المدير العام لترقية الصلاحيات أو لربط نطاق أكاديمي.', en: 'No operational metrics are available for this account. Contact the super-administrator to upgrade your scope or assign an academic range.' },
    openCenter: { ar: 'افتح المركز', en: 'Open center' },
    metricsTab: { ar: 'المؤشرات', en: 'Metrics' },
    activityTab: { ar: 'مراقبة النشاط', en: 'Activity monitor' },
    sectionsA11y: { ar: 'أقسام لوحة القيادة', en: 'Overview sections' },
    open: { ar: 'افتح', en: 'Open' },
    lastUpdated: { ar: 'آخر تحديث', en: 'Last updated' },
    // PR-3 — shell variants of the stat banners (ellipsis/period differ from
    // the original 2024 entries above; preserved byte-identical from App copy).
    statsLoadingShell: { ar: 'جارٍ تحميل المؤشرات…', en: 'Loading metrics…' },
    statsErrorShell: { ar: 'تعذّر تحميل المؤشرات.', en: 'Could not load metrics.' },
    // PR-3 — the App copy used the undetermined-form plural «اختبارات منشورة».
    statExamsShell: { ar: 'اختبارات منشورة', en: 'Published exams' },
  },

  // ===== Admins (preserved + PR-3 shell additions) =====
  admins: {
    list: { ar: 'قائمة المدراء', en: 'Administrator directory' },
    add: { ar: 'إضافة مدير', en: 'Add administrator' },
    edit: { ar: 'تعديل بيانات المدير', en: 'Edit administrator' },
    fullName: { ar: 'الاسم الكامل', en: 'Full name' },
    phone: { ar: 'رقم الهاتف (اختياري)', en: 'Phone (optional)' },
    initialPassword: { ar: 'كلمة المرور الأولية', en: 'Initial password' },
    passwordReminder: { ar: 'ذكّر المدير بتغيير كلمة المرور الأولية عند أول دخول.', en: 'Remind this administrator to change the initial password at first sign-in.' },
    resetTitle: { ar: 'إعادة تعيين كلمة المرور', en: 'Reset password' },
    newPassword: { ar: 'كلمة المرور الجديدة', en: 'New password' },
    deleteTitle: { ar: 'تأكيد الحذف النهائي', en: 'Confirm permanent deletion' },
    deleteText: { ar: 'هذا الإجراء دائم ولا يمكن التراجع عنه. أدخل كلمة مرور المدير العام لتأكيد الحذف.', en: 'This action is permanent and cannot be undone. Enter the super-administrator password to confirm.' },
    currentPassword: { ar: 'كلمة مرور المدير العام', en: 'Super-admin password' },
    deleteConfirm: { ar: 'حذف نهائي', en: 'Delete permanently' },
    deactivate: { ar: 'تعطيل الحساب', en: 'Disable account' },
    activate: { ar: 'تفعيل الحساب', en: 'Enable account' },
    noResults: { ar: 'لا توجد نتائج مطابقة.', en: 'No matching administrators.' },
    created: { ar: 'تم إنشاء المدير. شارك كلمة المرور الأولية عبر قناة آمنة.', en: 'Administrator created. Share the initial password through a secure channel.' },
    // PR-3 — shell toasts + confirm dialogs (previously inline ternaries).
    savedToast: { ar: 'تم حفظ بيانات المدير.', en: 'Administrator details saved.' },
    enabledToast: { ar: 'تم تفعيل الحساب.', en: 'Account enabled.' },
    disabledToast: { ar: 'تم تعطيل الحساب وإبطال جلساته.', en: 'Account disabled and sessions revoked.' },
    passwordResetToast: { ar: 'تمت إعادة تعيين كلمة المرور وإبطال الجلسات.', en: 'Password reset and live sessions revoked.' },
    deletedToast: { ar: 'تم الحذف النهائي للمدير.', en: 'Administrator permanently deleted.' },
    enableTitle: { ar: 'تفعيل حساب مدير', en: 'Enable administrator account' },
    disableTitle: { ar: 'تعطيل حساب مدير', en: 'Disable administrator account' },
    enableDescription: { ar: 'سيُعاد تفعيل حساب "{{name}}" ويمكنه تسجيل الدخول من جديد.', en: '"{{name}}" will be re-enabled and can sign in again.' },
    disableDescription: { ar: 'سيُعطَّل حساب "{{name}}" وتُبطل جميع جلساته النشطة فورًا.', en: '"{{name}}" will be disabled and all their live sessions revoked immediately.' },
    // PR-3 — the App `copy` object variants (byte-identical to the pre-PR-3
    // shell copy; distinct from the 2024 dictionary entries above where the
    // wording differs, e.g. the longer password reminder / confirmation copy).
    searchHint: { ar: 'ابحث بالاسم أو البريد أو الهاتف', en: 'Search name, email or phone' },
    clearFilters: { ar: 'إزالة التصفية', en: 'Clear filters' },
    activeLabel: { ar: 'مفعّل', en: 'Active' },
    roleColumn: { ar: 'الدور', en: 'Role' },
    scopeColumn: { ar: 'النطاق الأكاديمي', en: 'Academic scope' },
    lastLogin: { ar: 'آخر دخول', en: 'Last login' },
    viewDetails: { ar: 'عرض التفاصيل', en: 'View details' },
    rowDelete: { ar: 'حذف نهائي', en: 'Permanent delete' },
    addTitle: { ar: 'إضافة مدير جديد', en: 'Add administrator' },
    saveChanges: { ar: 'حفظ التغيير', en: 'Save changes' },
    passwordReminderShell: { ar: 'يجب تذكير المدير بتغيير كلمة المرور الأولية عند الدخول، دون حجب اللوحة.', en: 'Remind this administrator to change the initial password at first sign-in; do not block their console.' },
    deleteTextShell: { ar: 'هذا الإجراء دائم. أدخل كلمة مرور المدير العام الحالية للتأكيد.', en: 'This action is permanent. Enter the current super-administrator password to confirm.' },
    currentPasswordShell: { ar: 'كلمة مرور المدير العام الحالية', en: 'Current super-administrator password' },
    deleteConfirmShell: { ar: 'حذف المدير نهائيًا', en: 'Delete administrator permanently' },
    createdShell: { ar: 'تم إنشاء المدير. شارك كلمة المرور الأولية عبر قناة آمنة، وذكّره بتغييرها عند أول دخول.', en: 'Administrator created. Share the initial password through a secure channel and remind them to change it on first sign-in.' },
    // PR-7 (Settings + Role Studio) — effective-access inspector copy (the
    // per-admin drawer over GET /api/v1/admin/admins/{id}/effective-permissions).
    effective: {
      actionLabel: { ar: 'الوصول الفعّال', en: 'Effective access' },
      drawerTitle: { ar: 'الوصول الفعّال', en: 'Effective access' },
      drawerDescription: {
        ar: 'قراءة فقط: ما يستطيع هذا المدير فعله فعلياً كما يفرضه الخادم.',
        en: 'Read-only: what this administrator can actually do, as enforced by the server.',
      },
      roleState: { ar: 'حالة الدور', en: 'Role state' },
      adminState: { ar: 'حالة الحساب', en: 'Account state' },
      roleLabel: { ar: 'الدور', en: 'Role' },
      // Access source card
      accessSourceTitle: { ar: 'مصدر الوصول', en: 'Access source' },
      bypass: { ar: 'تجاوز المدير العام', en: 'Super-admin bypass' },
      bypassExplanation: {
        ar: 'يتجاوز هذا الحساب فحوصات الصلاحيات لكونه مديراً عاماً — الحماية الحقيقية تبقى في الخادم.',
        en: 'This account bypasses permission checks because it is a super administrator — the real protection stays server-side.',
      },
      roleGrants: { ar: 'صلاحيات الدور', en: 'Role grants' },
      roleGrantsExplanation: {
        ar: 'الصلاحيات تُفرض في الخادم من دور هذا الحساب.',
        en: 'Permissions are enforced server-side from this account\u0027s role.',
      },
      // Grants table
      grantsTitle: { ar: 'الصلاحيات الفعلية', en: 'Effective grants' },
      grantsEmpty: { ar: 'لا توجد صلاحيات ممنوحة لهذا الدور — الحساب لا يملك أي وصول خارج الواجهة.', en: 'No grants are configured for this role — the account has no access beyond the UI shell.' },
      resource: { ar: 'المورد', en: 'Resource' },
      actions: { ar: 'الإجراءات', en: 'Actions' },
      scope: { ar: 'النطاق', en: 'Scope' },
      // UI-permission envelope
      uiTitle: { ar: 'غلاف صلاحيات الواجهة', en: 'UI permissions envelope' },
      uiModeFull: { ar: 'كامل', en: 'Full' },
      uiModeCustom: { ar: 'مخصص', en: 'Custom' },
      uiModeLabel: { ar: 'النمط', en: 'Mode' },
      uiKeysCount: { ar: 'المفاتيح المسموحة: {{count}}', en: 'Allowed keys: {{count}}' },
      uiRegistryVersion: { ar: 'إصدار سجل المفاتيح: {{version}}', en: 'Key registry version: {{version}}' },
      uiCosmeticNote: {
        ar: 'مفاتيح الواجهة تجميلية فقط — تحجب عناصر من الشاشة ولا تمنح أي صلاحية فعلية؛ الفرض الحقيقي في سياسات الـ API.',
        en: 'UI keys are cosmetic only — they hide screen elements and grant no real permission; enforcement lives in the API policies.',
      },
      // Academic scope card
      scopeTitle: { ar: 'النطاق الأكاديمي', en: 'Academic scope' },
      scopeExplanation: {
        ar: 'هذا النطاق يقيّد البيانات التي يصل إليها الحساب — ويُفرض في الخادم بغض النظر عن الواجهة.',
        en: 'This scope filters the data the account can reach — enforced server-side regardless of the UI.',
      },
      scopeEmpty: { ar: 'غير محدد — المنصة بالكامل', en: 'Unassigned — entire platform' },
      university: { ar: 'الجامعة', en: 'University' },
      college: { ar: 'الكلية', en: 'College' },
      year: { ar: 'السنة', en: 'Year' },
      subject: { ar: 'المادة', en: 'Subject' },
      // States
      loadFailed: { ar: 'تعذّر تحميل الوصول الفعّال.', en: 'Could not load the effective access.' },
      retry: { ar: 'إعادة المحاولة', en: 'Retry' },
      close: { ar: 'إغلاق الوصول الفعّال', en: 'Close effective access' },
    },
  },

  // ===== Roles (preserved + PR-3 shell additions) =====
  roles: {
    title: { ar: 'الأدوار والصلاحيات', en: 'Roles & Permissions' },
    add: { ar: 'إنشاء دور', en: 'Create role' },
    name: { ar: 'الاسم التقني', en: 'Technical name' },
    nameAr: { ar: 'الاسم العربي', en: 'Arabic name' },
    description: { ar: 'الوصف', en: 'Description' },
    system: { ar: 'نظامي', en: 'System' },
    custom: { ar: 'مخصص', en: 'Custom' },
    adminsCount: { ar: 'عدد المدراء', en: 'Administrators' },
    permissions: { ar: 'الصلاحيات', en: 'Permissions' },
    noRoles: { ar: 'لا توجد أدوار بعد.', en: 'No roles available yet.' },
    // PR-3 — role shell toasts + confirm dialogs (previously inline ternaries).
    createdEmptyToast: { ar: 'تم إنشاء الدور فارغًا. أضف الصلاحيات قبل تعيينه.', en: 'Role created empty. Add permissions before assigning it.' },
    enabledToast: { ar: 'تم تفعيل الدور.', en: 'Role enabled.' },
    disabledToast: { ar: 'تم تعطيل الدور وإبطال جلسات المدراء المعيّنين.', en: 'Role disabled and assigned sessions revoked.' },
    deletedToast: { ar: 'تم حذف الدور.', en: 'Role deleted.' },
    enableTitle: { ar: 'تفعيل الدور', en: 'Enable role' },
    disableTitle: { ar: 'تعطيل الدور', en: 'Disable role' },
    deleteTitle: { ar: 'حذف الدور نهائيًا', en: 'Permanently delete role' },
    deleteAck: { ar: 'أفهم أن حذف الدور نهائي ولا يمكن التراجع عنه', en: 'I understand this role deletion is permanent and cannot be undone' },
    enableDescription: { ar: 'سيُفعَّل الدور "{{name}}" لجميع المدراء المعيّنين له.', en: 'Role "{{name}}" will be enabled for all assigned administrators.' },
    disableDescription: { ar: 'سيُعطَّل الدور "{{name}}" وتُبطل جلسات جميع المدراء المعيّنين له حتى يُعاد تفعيله.', en: 'Role "{{name}}" will be disabled and every assigned administrator\u0027s sessions revoked until it is re-enabled.' },
    deleteDescription: { ar: 'سيُحذف الدور "{{name}}" نهائيًا. يجب أن لا يكون معيّنًا لأي مدير حاليًا. لا يمكن التراجع عن هذا الإجراء.', en: 'Role "{{name}}" will be permanently deleted. It must not currently be assigned to any administrator. This cannot be undone.' },
    accessTitle: { ar: 'أدوار الوصول', en: 'Access roles' },
  },

  // ===== Scope (preserved + summary additions) =====
  scope: {
    label: { ar: 'حسب النطاق المعيّن', en: 'By assigned scope' },
    limited: { ar: 'الوصول مقيّد بالدور والنطاق الأكاديمي', en: 'Access is limited by your role and academic scope' },
    // PR-3 — shell variant: the App copy's shorter LimitedNotice wording.
    limitedShell: { ar: 'الوصول مقيّد بالدور والنطاق', en: 'Access is limited by your role and academic scope' },
    entire: { ar: 'المنصة بالكامل', en: 'Entire platform' },
    university: { ar: 'جامعة محددة', en: 'Specific university' },
    college: { ar: 'كلية محددة', en: 'Specific college' },
    year: { ar: 'سنة محددة', en: 'Specific year' },
    subject: { ar: 'مادة محددة', en: 'Specific subject' },
    unassigned: { ar: 'غير محدد', en: 'Unassigned' },
  },

  // ===== Shell (PR-3 — App.tsx furniture previously in the inline copy) =====
  shell: {
    title: { ar: 'لوحة تحكم منصة CMS', en: 'CMS Administration Console' },
    command: { ar: 'مركز القيادة المؤسسي لإدارة المنصة الأكاديمية.', en: 'Institutional command center for academic platform management.' },
    commandSub: { ar: 'راجع الصلاحيات قبل نشر التغيير، ثم تابع الإدارة ضمن نطاقك الأكاديمي.', en: 'Review access before publishing a change, then manage within your academic scope.' },
    brandWelcome: { ar: 'Cliver Medical Student', en: 'Cliver Medical Student' },
    brandTagline: { ar: 'Study smart...Not study hard', en: 'Study smart...Not study hard' },
    operatorProfile: { ar: 'المشغّل الحالي', en: 'Current operator' },
    dataError: { ar: 'تعذر تحميل بيانات الإدارة.', en: 'Could not load administration data.' },
    welcomeToast: { ar: 'أهلًا {{name}}', en: 'Welcome, {{name}}' },
    statusNotChecked: { ar: 'غير متحقق', en: 'Unknown' },
    statusHealthyShort: { ar: 'الخدمة تعمل', en: 'Operational' },
    closeNav: { ar: 'إغلاق القائمة', en: 'Close navigation' },
    openNav: { ar: 'فتح القائمة', en: 'Open navigation' },
    toggleSidebar: { ar: 'طي القائمة', en: 'Toggle sidebar' },
    operatorMenu: { ar: 'قائمة المشغّل', en: 'Operator menu' },
    operatorMenuWith: { ar: 'قائمة المشغّل: {{name}}', en: 'Operator menu: {{name}}' },
    breadcrumbNav: { ar: 'مسار التنقل', en: 'Breadcrumb' },
    adminCrumb: { ar: 'الإدارة', en: 'Admin' },
  },

  // ===== Command palette (PR-2 labels, dictionary-sourced in PR-3) =====
  palette: {
    title: { ar: 'لوحة الأوامر', en: 'Command palette' },
    placeholder: { ar: 'ابحث في مراكز الإدارة…', en: 'Search admin centers…' },
    noResults: { ar: 'لا توجد نتائج مطابقة', en: 'No matching results' },
    openHint: { ar: 'بحث سريع في مراكز الإدارة', en: 'Quick search across admin centers' },
  },

  // ===== 404 (PR-2 view, dictionary-sourced in PR-3) =====
  notFound: {
    title: { ar: 'الصفحة غير موجودة', en: 'Page not found' },
    description: {
      ar: 'المسار المطلوب غير موجود في لوحة الإدارة: {{path}}. تحقق من الرابط أو عد إلى لوحة القيادة.',
      en: 'The requested path does not exist in the administration console: {{path}}. Check the link or return to the command center.',
    },
    return: { ar: 'العودة إلى لوحة القيادة', en: 'Return to command center' },
  },

  // ===== 2FA self-service card (previously the TwoFactorCard copy object) =====
  twoFactorCard: {
    title: { ar: 'أمان الحساب', en: 'Account security' },
    subtitle: { ar: 'المصادقة الثنائية (2FA)', en: 'Two-factor authentication (2FA)' },
    body: { ar: 'طبقة حماية إضافية لحساب{{name}}: يُطلب رمز تحقق من تطبيق المصادقة عند كل تسجيل دخول. فعّلها من هنا، أو عطّلها بتأكيد كلمة المرور.', en: 'An extra layer of protection for{{name}}: an authenticator code is required at every sign-in. Enable it here, or disable it with a password confirmation.' },
    bodyNameDefaultAr: { ar: 'ك', en: ' your account' },
    enable: { ar: 'تفعيل المصادقة الثنائية', en: 'Enable 2FA' },
    disable: { ar: 'تعطيل المصادقة الثنائية', en: 'Disable 2FA' },
    setupTitle: { ar: 'تفعيل المصادقة الثنائية', en: 'Enable two-factor authentication' },
    setupBody: { ar: 'امسح رمز QR بتطبيق المصادقة (Google Authenticator / Authy…) أو أدخل المفتاح يدويًا، ثم أكّد في التطبيق.', en: 'Scan the QR code with your authenticator app (Google Authenticator / Authy…) or enter the key manually, then confirm in the app.' },
    qrAlt: { ar: 'رمز QR لإعداد تطبيق المصادقة', en: 'QR code for the authenticator app' },
    secretLabel: { ar: 'المفتاح اليدوي', en: 'Manual key' },
    codesLabel: { ar: 'رموز الاسترجاع (تظهر مرة واحدة فقط — احفظها الآن)', en: 'Recovery codes (shown once — save them now)' },
    codesHint: { ar: 'تُستخدم مرة واحدة لكل رمز إذا فقدت جهازك.', en: 'Each code can be used once if you lose your device.' },
    copied: { ar: 'تم النسخ', en: 'Copied' },
    working: { ar: 'جارٍ التنفيذ...', en: 'Working...' },
    done: { ar: 'تم التفعيل — أكّد الحساب في تطبيق المصادقة', en: 'Enabled — confirm the account in your authenticator app' },
    disableTitle: { ar: 'تعطيل المصادقة الثنائية', en: 'Disable two-factor authentication' },
    disableBody: { ar: 'أدخل كلمة مرور حسابك لتأكيد التعطيل. سيعود تسجيل الدخول إلى الاعتماد على كلمة المرور فقط.', en: 'Enter your account password to confirm. Sign-in will rely on the password only.' },
    passwordLabel: { ar: 'كلمة المرور الحالية', en: 'Current password' },
    passwordPlaceholder: { ar: 'كلمة مرور حسابك', en: 'Your password' },
    disableConfirm: { ar: 'تأكيد التعطيل', en: 'Confirm disable' },
    disableOk: { ar: 'تم تعطيل المصادقة الثنائية', en: 'Two-factor authentication disabled' },
    enableFail: { ar: 'فشل تفعيل المصادقة الثنائية', en: 'Failed to enable 2FA' },
    disableFail: { ar: 'فشل تعطيل المصادقة الثنائية', en: 'Failed to disable 2FA' },
  },

  // ===== Shared modal furniture =====
  modal: {
    closeLabel: { ar: 'إغلاق النافذة', en: 'Close dialog' },
  },

  // ===== Error boundary (crash surface) =====
  errorBoundary: {
    title: { ar: 'حدث خطأ غير متوقع', en: 'An unexpected error occurred' },
    body: { ar: 'يرجى تحديث الصفحة. إذا استمرت المشكلة، تواصل مع الدعم الفني.', en: 'Please refresh the page. If the problem persists, contact support.' },
    details: { ar: 'تفاصيل الخطأ', en: 'Error details' },
    reload: { ar: 'تحديث الصفحة', en: 'Reload page' },
  },
} as const satisfies DictSection;
