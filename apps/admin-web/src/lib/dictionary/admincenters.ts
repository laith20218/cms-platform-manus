/**
 * PR-3 — admincenters dictionary section (filled by the center migration).
 * Strings are moved BYTE-IDENTICAL from the component ternaries/copy
 * objects into this section; the component then reads them through
 * `t(locale, 'admincenters.key')`.
 *
 * Sections (one per migrated surface):
 *   • adminsCenter — AdminsCenter.tsx local furniture (the bulk of the admin
 *     surface copy arrives via the App `copy` prop / `admins.*` in core);
 *   • rolesCenter  — RolesCenter.tsx local furniture;
 *   • settings     — SettingsCenter.tsx (local `t` copy object + toasts +
 *     the reset ConfirmDialog copy);
 *   • permissions  — PermissionMatrixEditor + UiPermissionsEditor furniture
 *     (the RESOURCES/ACTIONS/SCOPES/UI_PERMISSION_LABELS ar/en maps are
 *     permission metadata and stay as data in the components).
 *
 * Reused core entries (byte-identical, no duplication here):
 *   common.save / common.cancel / common.close / common.loading /
 *   common.refresh / roles.permissions / nav.settings / common.updated.
 */
import type { DictSection } from './types';

export const admincentersDict = {
  // ===== AdminsCenter (local furniture) =====
  adminsCenter: {
    eyebrow: { ar: 'الإدارة المركزية', en: 'Central administration' },
    description: {
      ar: 'تُدار المدراء والصلاحيات والنطاقات الأكاديمية من هذا المركز المؤسسي.',
      en: 'Manage administrators, their roles and academic scopes from this institutional center.',
    },
    emptyHint: { ar: 'عدّل عوامل التصفية أو أضف مديراً جديداً.', en: 'Adjust filters or add a new administrator.' },
    identityColumn: { ar: 'المدير', en: 'Administrator' },
    phoneLabel: { ar: 'هاتف: {{phone}}', en: 'Phone: {{phone}}' },
    createdLabel: { ar: 'أُنشئ في {{date}}', en: 'Created {{date}}' },
    dialogEyebrow: { ar: 'إجراء إداري', en: 'Administrative action' },
    dialogClose: { ar: 'إغلاق', en: 'Close dialog' },
    resetSessionsNotice: {
      ar: 'سيتم إبطال جميع جلسات {{name}} فورًا.',
      en: 'All {{name}}\u0027s live sessions will be invalidated immediately.',
    },
    roleNamePatternHint: {
      ar: 'أحرف وأرقام وشرطة سفلية فقط، من 3 إلى 50 رمزًا.',
      en: 'Letters, numbers and underscores only; 3–50 characters.',
    },
    roleEmptyPermissionsNote: {
      ar: 'ينشأ الدور بلا صلاحيات. أضف الصلاحيات قبل تعيينه لأي مدير.',
      en: 'The role begins with no permissions. Add grants before assigning it.',
    },
  },

  // ===== RolesCenter (local furniture) =====
  rolesCenter: {
    eyebrow: { ar: 'سياسة الوصول', en: 'Access policy' },
    policyHint: {
      ar: 'الأدوار النظامية محمية من الحذف؛ يمكن تعطيلها مؤقتاً. الأدوار المخصصة قابلة للحذف النهائي.',
      en: 'System roles are protected from deletion but can be disabled. Custom roles can be permanently deleted.',
    },
    emptyHint: { ar: 'أنشئ أول دور مخصص لتعيين الصلاحيات لاحقاً.', en: 'Create your first custom role to assign permissions later.' },
    noDescription: { ar: 'دور بلا وصف إضافي.', en: 'Role without an additional description.' },
    matrixButtonTitle: { ar: 'تعديل مصفوفة الصلاحيات', en: 'Edit permission matrix' },
    uiKeysButtonTitle: { ar: 'صلاحيات الواجهة المتقدمة (64 مفتاحاً)', en: 'Advanced UI permissions (62 keys)' },
    uiKeysButton: { ar: 'الواجهة', en: 'UI keys' },
    superAdminLocked: { ar: 'لا يمكن تعطيل دور المدير العام', en: 'Super-admin role cannot be disabled' },
  },

  // ===== SettingsCenter =====
  settings: {
    loadFailed: { ar: 'تعذّر تحميل الإعدادات', en: 'Could not load settings' },
    savedToast: { ar: 'تم تحديث الإعداد', en: 'Setting updated' },
    saveFailed: { ar: 'فشل التحديث', en: 'Update failed' },
    noDefaultToast: { ar: 'لا يوجد وصف لهذا الإعداد', en: 'No description for default value' },
    resetToast: { ar: 'تمت إعادة التعيين', en: 'Reset to default' },
    resetFailed: { ar: 'فشلت إعادة التعيين', en: 'Reset failed' },
    generalCategory: { ar: 'عام', en: 'General' },
    description: {
      ar: 'إعدادات قابلة للتعديل من قبل المدير (مفصولة عن الأسرار)',
      en: 'Admin-editable platform config (separated from secrets)',
    },
    search: { ar: 'ابحث بالمفتاح أو القيمة...', en: 'Search by key or value...' },
    reset: { ar: 'إعادة تعيين', en: 'Reset' },
    locked: { ar: 'مقفل — يتطلب super_admin', en: 'Locked — requires super_admin' },
    noData: { ar: 'لا توجد إعدادات', en: 'No settings found' },
    resetConfirmTitle: { ar: 'إعادة تعيين الإعداد', en: 'Reset setting' },
    resetConfirmDescription: {
      ar: 'سيتم استبدال القيمة الحالية لـ "{{key}}" ({{current}}) بالقيمة الافتراضية "{{defaultValue}}".',
      en: '"{{key}}" will be reset from its current value ({{current}}) to the default "{{defaultValue}}".',
    },
    resetConfirmLabel: { ar: 'تأكيد إعادة التعيين', en: 'Confirm reset' },
  },

  // ===== Permission editors (PermissionMatrixEditor + UiPermissionsEditor) =====
  permissions: {
    // Shared by both editors (identical wording in the originals).
    loadFailed: { ar: 'تعذّر تحميل الصلاحيات', en: 'Could not load permissions' },
    savedToast: { ar: 'تم حفظ الصلاحيات', en: 'Permissions saved' },
    saveFailed: { ar: 'فشل الحفظ', en: 'Save failed' },
    unsavedChanges: { ar: 'تغييرات غير محفوظة', en: 'Unsaved changes' },
    grantsLabel: { ar: 'صلاحية ممنوحة', en: 'grants' },
    matrix: {
      title: { ar: 'مصفوفة الصلاحيات', en: 'Permission Matrix' },
      desc: { ar: 'حدد الصلاحيات لكل مورد. كل خلية قابلة للتبديل.', en: 'Toggle permissions per resource. Each cell is independent.' },
      resource: { ar: 'المورد', en: 'Resource' },
      scope: { ar: 'النطاق', en: 'Scope' },
      actions: { ar: 'الإجراءات', en: 'Actions' },
      reset: { ar: 'تراجع', en: 'Reset' },
      systemLocked: { ar: 'دور نظام — للقراءة فقط', en: 'System role — read only' },
      noGrants: { ar: 'لا توجد صلاحيات ممنوحة بعد', en: 'No permissions granted yet' },
    },
    ui: {
      title: { ar: 'صلاحيات الواجهة المتقدمة', en: 'Advanced UI Permissions' },
      desc: {
        ar: 'حدد ما يظهر للمدراء المعيّنين لهذا الدور في لوحة الإدارة (64 مفتاحاً: مشاهد + أقسام + أزرار).',
        en: 'Choose what assigned administrators see in the console (64 keys: views + tabs + buttons).',
      },
      loadFailed: { ar: 'تعذّر تحميل صلاحيات الواجهة', en: 'Could not load UI permissions' },
      configured: { ar: 'مُهيأ', en: 'Configured' },
      notConfigured: { ar: 'غير مُهيأ — وصول كامل', en: 'Not configured — full access' },
      systemLocked: { ar: 'دور نظام — للقراءة فقط (يشمل المدير العام)', en: 'System role — read only (includes super_admin)' },
      save: { ar: 'حفظ المفاتيح', en: 'Save keys' },
      resetToFull: { ar: 'إعادة إلى الوصول الكامل', en: 'Reset to full access' },
      selected: { ar: 'مفاتيح محددة', en: 'keys selected' },
      searchPlaceholder: { ar: 'ابحث بالاسم أو المفتاح… (مثال: btn:codes.export)', en: 'Search by label or key… (e.g. btn:codes.export)' },
      noMatches: { ar: 'لا توجد مفاتيح مطابقة للبحث', en: 'No keys match the search' },
      templates: { ar: 'قوالب بداية سريعة', en: 'Quick-start templates' },
      unconfiguredTitle: { ar: 'هذا الدور غير مُهيأ بعد', en: 'This role is not configured yet' },
      unconfiguredBody: {
        ar: 'NULL يعني وصولاً كاملاً: كل المشاهد والأقسام والأزرار تظهر للمدراء المعيّنين — دون أي تغيير في السلوك. أول حفظ يثبّت القائمة؛ بعدها تظهر للمدير فقط المفاتيح المحددة. ملاحظة أمنية (طبقتان): هذه المفاتيح تُخفي عناصر الواجهة فقط — الحماية الحقيقية تبقى في سياسات الـ API ([Authorize] + فحوصات النطاق). مفتاح view:codes لا يمنح صلاحية codes:view الكلاسيكية.',
        en: 'NULL means full access: every view, tab and button shows for assigned administrators — zero behavior change. The first save pins the list; after that only the selected keys render. Security note (two layers): these keys only hide UI elements — the REAL boundary stays in the API policies ([Authorize] + scope checks). view:codes never grants the classic codes:view permission.',
      },
      emptyTree: { ar: 'لا توجد أزرار أو أقسام تحت هذا المشهد.', en: 'No buttons or tabs under this view.' },
      views: { ar: 'المشاهد', en: 'Views' },
      saveOk: { ar: 'تم حفظ مفاتيح صلاحيات الواجهة', en: 'UI permission keys saved' },
      resetOk: { ar: 'أُعيد الدور إلى غير مُهيأ (وصول كامل)', en: 'Role reset to unconfigured (full access)' },
      confirmReset: {
        ar: 'إعادة الدور إلى غير مُهيأ (NULL = وصول كامل لكل المدراء المعيّنين)؟',
        en: 'Reset the role to unconfigured (NULL = full access for every assigned administrator)?',
      },
      resetAcknowledge: {
        ar: 'أفهم أن هذا يمنح وصولًا كاملًا لكل مدراء الدور ولا يمكن التراجع إلا بحفظ قائمة جديدة',
        en: 'I understand this grants full access to every administrator of the role and can only be undone by saving a new list',
      },
    },
  },
} as const satisfies DictSection;
