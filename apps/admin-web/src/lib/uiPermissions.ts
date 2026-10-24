/**
 * Mirror of the backend UI permission registry (CMS.Application.Interfaces.UiPermissionRegistry).
 * v2 (Push 4): 70 keys = 12 views + 11 top-level tabs + 47 buttons. Keep in lockstep with
 * the backend — the /me/ui-permissions envelope carries allKeys + registryVersion so drift
 * between this mirror and the backend is detectable at runtime (see useUiPermissions).
 *
 * TWO SECURITY LAYERS — important:
 *   1. REAL security lives ONLY in the API: [Authorize] policies + CanManageAsync → Forbid().
 *      A caller that bypasses admin-web (curl, tampered bundles) is stopped by classic RBAC
 *      and never consults these keys.
 *   2. can() here is the COSMETIC layer: it hides UI elements in the browser. It is NOT a
 *      security boundary — that is why can() fails OPEN while loading or on fetch errors:
 *      the backend remains the real gate either way.
 */

export const UI_PERMISSIONS_REGISTRY_VERSION = 'v2';

// ===== 12 views =====
export const VIEW_KEYS = [
  'view:overview',
  'view:academic',
  'view:questions',
  'view:exams',
  'view:library',
  'view:students',
  'view:codes',
  'view:reports',
  'view:admins',
  'view:roles',
  'view:audit',
  'view:settings',
] as const;

// ===== 11 tabs (overview 2 + reports 8 + library courses 1 (v2) — StudentsCenter drawer deferred, Q3) =====
export const TAB_KEYS = [
  'tab:overview.metrics',
  'tab:overview.activity',
  'tab:reports.overview',
  'tab:reports.students',
  'tab:reports.academic',
  'tab:reports.exams',
  'tab:reports.questions',
  'tab:reports.content',
  'tab:reports.codes',
  'tab:reports.operations',
  'tab:library.courses',
] as const;

// ===== 47 buttons =====
export const BUTTON_KEYS = [
  'btn:questions.create',
  'btn:questions.publish',
  'btn:questions.archive',
  'btn:questions.delete',
  'btn:questions.edit',
  'btn:exams.create',
  'btn:exams.publish',
  'btn:exams.archive',
  'btn:exams.delete',
  'btn:library.upload',
  'btn:library.publish',
  'btn:library.archive',
  'btn:library.delete',
  'btn:library.course.create',
  'btn:library.course.edit',
  'btn:library.course.publish',
  'btn:library.course.archive',
  'btn:library.course.delete',
  'btn:library.course.episode.upload',
  'btn:library.course.episode.delete',
  'btn:codes.generate',
  'btn:codes.revoke',
  'btn:codes.revoke-bulk',
  'btn:codes.export',
  'btn:students.edit',
  'btn:students.ban',
  'btn:students.revoke-session',
  'btn:academic.add-university',
  'btn:academic.add-college',
  'btn:academic.add-year',
  'btn:academic.add-semester',
  'btn:academic.add-subject',
  'btn:academic.add-lecture',
  'btn:academic.archive',
  'btn:settings.save',
  'btn:settings.reset',
  'btn:admins.create',
  'btn:admins.edit',
  'btn:admins.reset-password',
  'btn:admins.status',
  'btn:admins.delete',
  'btn:roles.create',
  'btn:roles.matrix',
  'btn:roles.status',
  'btn:roles.delete',
  'btn:overview.compose-notification',
  'btn:reports.export',
] as const;

/** All 70 keys in canonical order: views, then tabs, then buttons. */
export const ALL_UI_KEYS: readonly string[] = [...VIEW_KEYS, ...TAB_KEYS, ...BUTTON_KEYS];

/** View → ordered children (its tabs + buttons). Mirrors UiPermissionRegistry.Tree. */
export const UI_PERMISSIONS_TREE: Record<string, readonly string[]> = {
  'view:overview': ['tab:overview.metrics', 'tab:overview.activity', 'btn:overview.compose-notification'],
  'view:academic': [
    'btn:academic.add-university',
    'btn:academic.add-college',
    'btn:academic.add-year',
    'btn:academic.add-semester',
    'btn:academic.add-subject',
    'btn:academic.add-lecture',
    'btn:academic.archive',
  ],
  'view:questions': ['btn:questions.create', 'btn:questions.publish', 'btn:questions.archive', 'btn:questions.delete', 'btn:questions.edit'],
  'view:exams': ['btn:exams.create', 'btn:exams.publish', 'btn:exams.archive', 'btn:exams.delete'],
  'view:library': [
    'tab:library.courses',
    'btn:library.upload',
    'btn:library.publish',
    'btn:library.archive',
    'btn:library.delete',
    'btn:library.course.create',
    'btn:library.course.edit',
    'btn:library.course.publish',
    'btn:library.course.archive',
    'btn:library.course.delete',
    'btn:library.course.episode.upload',
    'btn:library.course.episode.delete',
  ],
  'view:students': ['btn:students.edit', 'btn:students.ban', 'btn:students.revoke-session'],
  'view:codes': ['btn:codes.generate', 'btn:codes.revoke', 'btn:codes.revoke-bulk', 'btn:codes.export'],
  'view:reports': [
    'tab:reports.overview',
    'tab:reports.students',
    'tab:reports.academic',
    'tab:reports.exams',
    'tab:reports.questions',
    'tab:reports.content',
    'tab:reports.codes',
    'tab:reports.operations',
    'btn:reports.export',
  ],
  'view:admins': ['btn:admins.create', 'btn:admins.edit', 'btn:admins.reset-password', 'btn:admins.status', 'btn:admins.delete'],
  'view:roles': ['btn:roles.create', 'btn:roles.matrix', 'btn:roles.status', 'btn:roles.delete'],
  'view:audit': [],
  'view:settings': ['btn:settings.save', 'btn:settings.reset'],
};

/** Bilingual labels for the editor tree and tooltips. */
export const UI_PERMISSION_LABELS: Record<string, { ar: string; en: string }> = {
  'view:overview': { ar: 'لوحة القيادة', en: 'Command center' },
  'view:academic': { ar: 'البنية الأكاديمية', en: 'Academic structure' },
  'view:questions': { ar: 'بنك الأسئلة', en: 'Question bank' },
  'view:exams': { ar: 'الاختبارات', en: 'Exams' },
  'view:library': { ar: 'المكتبة والملفات', en: 'Library & files' },
  'view:students': { ar: 'الطلاب', en: 'Students' },
  'view:codes': { ar: 'رموز الوصول', en: 'Access codes' },
  'view:reports': { ar: 'التقارير والتحليلات', en: 'Reports & analytics' },
  'view:admins': { ar: 'المدراء', en: 'Administrators' },
  'view:roles': { ar: 'الأدوار والصلاحيات', en: 'Roles & permissions' },
  'view:audit': { ar: 'السجل الأمني', en: 'Security audit' },
  'view:settings': { ar: 'إعدادات النظام', en: 'System settings' },

  'tab:overview.metrics': { ar: 'مؤشرات لوحة القيادة', en: 'Overview metrics' },
  'tab:overview.activity': { ar: 'مراقبة نشاط المدراء (مدير عام فقط)', en: 'Admin activity monitor (super-admin only)' },
  'tab:reports.overview': { ar: 'نظرة عامة (تقارير)', en: 'Reports overview' },
  'tab:reports.students': { ar: 'تقرير الطلاب', en: 'Students report' },
  'tab:reports.academic': { ar: 'التقرير الأكاديمي', en: 'Academic report' },
  'tab:reports.exams': { ar: 'تقرير الاختبارات', en: 'Exams report' },
  'tab:reports.questions': { ar: 'تقرير الأسئلة', en: 'Questions report' },
  'tab:reports.content': { ar: 'تقرير المحتوى', en: 'Content report' },
  'tab:reports.codes': { ar: 'تقرير الأكواد', en: 'Codes report' },
  'tab:reports.operations': { ar: 'التقرير التشغيلي', en: 'Operations report' },
  'tab:library.courses': { ar: 'تبويب الكورسات (داخل المكتبة)', en: 'Courses tab (inside Library)' },

  'btn:questions.create': { ar: 'إنشاء سؤال (يشمل "حفظ وإضافة آخر")', en: 'New question (incl. Save & Add Another)' },
  'btn:questions.publish': { ar: 'نشر السؤال', en: 'Publish question' },
  'btn:questions.archive': { ar: 'أرشفة السؤال', en: 'Archive question' },
  'btn:questions.delete': { ar: 'حذف السؤال', en: 'Delete question' },
  'btn:questions.edit': { ar: 'تعديل السؤال', en: 'Edit question' },
  'btn:exams.create': { ar: 'إنشاء اختبار', en: 'New exam' },
  'btn:exams.publish': { ar: 'نشر الاختبار', en: 'Publish exam' },
  'btn:exams.archive': { ar: 'أرشفة الاختبار', en: 'Archive exam' },
  'btn:exams.delete': { ar: 'حذف الاختبار', en: 'Delete exam' },
  'btn:library.upload': { ar: 'رفع ملف إلى المكتبة', en: 'Upload file' },
  'btn:library.publish': { ar: 'نشر الملف', en: 'Publish file' },
  'btn:library.archive': { ar: 'أرشفة الملف', en: 'Archive file' },
  'btn:library.delete': { ar: 'حذف الملف', en: 'Delete file' },
  'btn:library.course.create': { ar: 'إنشاء كورس', en: 'Create course' },
  'btn:library.course.edit': { ar: 'تعديل الكورس', en: 'Edit course' },
  'btn:library.course.publish': { ar: 'نشر الكورس', en: 'Publish course' },
  'btn:library.course.archive': { ar: 'أرشفة الكورس', en: 'Archive course' },
  'btn:library.course.delete': { ar: 'حذف الكورس', en: 'Delete course' },
  'btn:library.course.episode.upload': { ar: 'رفع حلقة فيديو (متعدد الأجزاء)', en: 'Upload video episode (multipart)' },
  'btn:library.course.episode.delete': { ar: 'حذف حلقة', en: 'Delete episode' },
  'btn:codes.generate': { ar: 'توليد الأكواد', en: 'Generate codes' },
  'btn:codes.revoke': { ar: 'إبطال كود', en: 'Revoke code' },
  'btn:codes.revoke-bulk': { ar: 'إبطال جماعي للأكواد', en: 'Bulk revoke' },
  'btn:codes.export': { ar: 'تصدير الأكواد', en: 'Export codes' },
  'btn:students.edit': { ar: 'تعديل بيانات طالب', en: 'Edit student' },
  'btn:students.ban': { ar: 'حظر / رفع الحظر', en: 'Ban / unban student' },
  'btn:students.revoke-session': { ar: 'إبطال جلسات طالب', en: 'Revoke student sessions' },
  'btn:academic.add-university': { ar: 'إضافة جامعة', en: 'Add university' },
  'btn:academic.add-college': { ar: 'إضافة كلية', en: 'Add college' },
  'btn:academic.add-year': { ar: 'إضافة سنة', en: 'Add year' },
  'btn:academic.add-semester': { ar: 'إضافة فصل', en: 'Add semester' },
  'btn:academic.add-subject': { ar: 'إضافة مادة', en: 'Add subject' },
  'btn:academic.add-lecture': { ar: 'إضافة محاضرة', en: 'Add lecture' },
  'btn:academic.archive': { ar: 'أرشفة عناصر البنية الأكاديمية', en: 'Archive academic items' },
  'btn:settings.save': { ar: 'حفظ الإعدادات', en: 'Save settings' },
  'btn:settings.reset': { ar: 'استعادة الإعدادات الافتراضية', en: 'Reset settings to defaults' },
  'btn:admins.create': { ar: 'إضافة مدير', en: 'Add administrator' },
  'btn:admins.edit': { ar: 'تعديل مدير', en: 'Edit administrator' },
  'btn:admins.reset-password': { ar: 'إعادة تعيين كلمة مرور مدير', en: 'Reset administrator password' },
  'btn:admins.status': { ar: 'تفعيل / تعطيل مدير', en: 'Enable / disable administrator' },
  'btn:admins.delete': { ar: 'حذف مدير نهائياً', en: 'Delete administrator' },
  'btn:roles.create': { ar: 'إنشاء دور', en: 'Create role' },
  'btn:roles.matrix': { ar: 'مصفوفة الصلاحيات (الكلاسيكية والمتقدمة)', en: 'Permissions (classic matrix + advanced UI)' },
  'btn:roles.status': { ar: 'تفعيل / تعطيل دور', en: 'Enable / disable role' },
  'btn:roles.delete': { ar: 'حذف دور مخصص', en: 'Delete custom role' },
  'btn:overview.compose-notification': { ar: 'إنشاء إشعار', en: 'Compose notification' },
  'btn:reports.export': { ar: 'تصدير التقرير (CSV/PDF)', en: 'Export report (CSV/PDF)' },
};

/** Quick-start templates offered by the editor (all keys validated against the registry). */
export const ROLE_TEMPLATES: ReadonlyArray<{
  id: 'readonly' | 'contentEditor' | 'codesManager';
  ar: string;
  en: string;
  keys: readonly string[];
}> = [
  {
    id: 'readonly',
    ar: 'قارئ — كل الواجهات والأقسام بلا أزرار',
    en: 'Read-only — every view and tab, zero buttons',
    keys: [...VIEW_KEYS, ...TAB_KEYS],
  },
  {
    id: 'contentEditor',
    ar: 'محرر محتوى — الأسئلة والاختبارات والمكتبة',
    en: 'Content editor — questions, exams, library',
    keys: [
      'view:questions',
      'view:exams',
      'view:library',
      'btn:questions.create',
      'btn:questions.publish',
      'btn:questions.archive',
      'btn:questions.delete',
      'btn:questions.edit',
      'btn:exams.create',
      'btn:exams.publish',
      'btn:exams.archive',
      'btn:exams.delete',
      'btn:library.upload',
      'btn:library.publish',
      'btn:library.archive',
      'btn:library.delete',
    ],
  },
  {
    id: 'codesManager',
    ar: 'مدير أكواد — توليد الأكواد وتقاريرها',
    en: 'Codes manager — generate codes and their reports',
    keys: ['view:codes', 'view:reports', 'tab:reports.codes', 'btn:codes.generate', 'btn:codes.revoke', 'btn:codes.revoke-bulk', 'btn:codes.export'],
  },
];

/** Wire shape of GET /api/v1/auth/admin/me/ui-permissions (camelCase JSON). */
export type UiPermissionsBundle = {
  mode: 'super_admin' | 'unconfigured' | 'custom';
  isSuperAdmin: boolean;
  registryVersion: string;
  allKeys: string[];
  allowedKeys: string[];
};

/**
 * Creates the can(key) predicate used across admin-web.
 * Fail-open semantics: while the bundle is missing (loading or fetch error) can() returns
 * true — the backend remains the real security gate; the frontend layer is cosmetic only.
 */
export function createCanFunction(bundle: UiPermissionsBundle | null): (key: string) => boolean {
  if (!bundle) return () => true;
  if (bundle.isSuperAdmin || bundle.mode !== 'custom') return () => true;
  const allowed = new Set(bundle.allowedKeys);
  return (key: string) => allowed.has(key);
}
