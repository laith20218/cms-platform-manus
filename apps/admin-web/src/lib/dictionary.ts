/**
 * CMS Admin — Centralized Dictionary (DESIGN-01)
 * قاموس مركزي للترجمة العربية والإنجليزية.
 * لا ترجمات حرفية. نصوص مؤسسية طبيعية.
 */

export type Locale = 'ar' | 'en';

export const dictionary = {
  // ===== Login =====
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
  },

  // ===== Navigation Groups =====
  navGroups: {
    daily: { ar: 'التشغيل اليومي', en: 'Daily Operations' },
    content: { ar: 'المحتوى الأكاديمي', en: 'Academic Content' },
    access: { ar: 'المستخدمون والوصول', en: 'Users & Access' },
    audit: { ar: 'القياس والتدقيق', en: 'Measurement & Audit' },
    system: { ar: 'النظام', en: 'System' },
  },

  // ===== Nav Items =====
  nav: {
    overview: { ar: 'لوحة القيادة', en: 'Command Center' },
    students: { ar: 'الطلاب', en: 'Students' },
    academic: { ar: 'البنية الأكاديمية', en: 'Academic Structure' },
    questions: { ar: 'بنك الأسئلة', en: 'Question Bank' },
    exams: { ar: 'الاختبارات', en: 'Exams' },
    library: { ar: 'المكتبة والملفات', en: 'Library & Files' },
    codes: { ar: 'رموز الوصول', en: 'Access Codes' },
    admins: { ar: 'المدراء', en: 'Administrators' },
    roles: { ar: 'الأدوار والصلاحيات', en: 'Roles & Permissions' },
  },

  // ===== Topbar =====
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
  },

  // ===== Common =====
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

  // ===== Dashboard =====
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
  },

  // ===== Admins =====
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
  },

  // ===== Roles =====
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
  },

  // ===== Scope =====
  scope: {
    label: { ar: 'حسب النطاق المعيّن', en: 'By assigned scope' },
    limited: { ar: 'الوصول مقيّد بالدور والنطاق الأكاديمي', en: 'Access is limited by your role and academic scope' },
    entire: { ar: 'المنصة بالكامل', en: 'Entire platform' },
    university: { ar: 'جامعة محددة', en: 'Specific university' },
    college: { ar: 'كلية محددة', en: 'Specific college' },
    year: { ar: 'سنة محددة', en: 'Specific year' },
    subject: { ar: 'مادة محددة', en: 'Specific subject' },
    unassigned: { ar: 'غير محدد', en: 'Unassigned' },
  },
} as const;

/** Helper to get a localized string from the dictionary */
export function t(locale: Locale, path: string): string {
  const parts = path.split('.');
  let current: unknown = dictionary;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return path; // fallback to key name
    }
  }
  if (current && typeof current === 'object' && locale in (current as Record<string, unknown>)) {
    return String((current as Record<string, string>)[locale]);
  }
  return path;
}
