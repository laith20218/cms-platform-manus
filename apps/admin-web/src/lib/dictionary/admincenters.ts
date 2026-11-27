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
    // PR-7 — high-impact change explanation on system-role cards: toggling a
    // system role's status hits every assigned administrator immediately.
    systemRoleImpactNote: {
      ar: 'تغيير حالة دور نظامي يمسّ كل المدراء المعيّنين له فوراً — الحماية الحقيقية تُفرض في الخادم بغض النظر عن الواجهة.',
      en: 'Toggling a system role affects every assigned administrator immediately — the real protection is enforced server-side regardless of this UI.',
    },
    // PR-7 — inline conflict banner copy for the role-delete confirm dialog
    // (ROLE_HAS_ADMINS carries the live admin count from the card metrics).
    deleteConflictHasAdmins: {
      ar: 'الدور معيّن لـ {{count}} مديراً — انقلهم إلى دور آخر قبل الحذف',
      en: 'The role is assigned to {{count}} administrators — move them to another role before deleting.',
    },
    deleteConflictTitle: { ar: 'تعذّر حذف الدور', en: 'Role deletion refused' },
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
      ar: 'سيتم استرجاع القيمة الافتراضية المسجّلة في سجلّ الخادم للإعداد "{{key}}" (القيمة الحالية: {{current}}). القيمة المستعادة يحددها الخادم حصراً ولا تعتمد على أي قيمة من الواجهة.',
      en: '"{{key}}" will be restored to the REGISTERED server-side default (current value: {{current}}). The restored value is decided by the server registry alone — never by a client-supplied value.',
    },
    resetConfirmLabel: { ar: 'تأكيد إعادة التعيين', en: 'Confirm reset' },
    // PR-7 — why the security category is super-admin-only (banner copy).
    securityCategoryNote: {
      ar: 'إعدادات فئة الأمان مخصصة للمدير العام فقط لأنها تتحكم بقواعد الدخول والقفل والجلسات — تغييرها من غير مدير عام مرفوض في الخادم.',
      en: 'Security-category settings are reserved for the super administrator because they govern sign-in, lockout and session rules — the server rejects changes from anyone else.',
    },

    // ===== PR-7 — typed controls (valueType-driven rendering) =====
    typed: {
      boolEnabled: { ar: 'مفعّل', en: 'Enabled' },
      boolDisabled: { ar: 'معطّل', en: 'Disabled' },
      boolYes: { ar: 'نعم', en: 'Yes' },
      boolNo: { ar: 'لا', en: 'No' },
      intBoundsHint: { ar: 'الحد المسموح: {{min}} إلى {{max}}', en: 'Allowed range: {{min}} to {{max}}' },
      intInvalid: {
        ar: 'أدخل رقماً صحيحاً بين {{min}} و {{max}}',
        en: 'Enter a whole number between {{min}} and {{max}}',
      },
      enumInvalid: { ar: 'اختر إحدى القيم المسموحة', en: 'Choose one of the allowed values' },
      typeBool: { ar: 'منطقي', en: 'Boolean' },
      typeInt: { ar: 'رقم', en: 'Number' },
      typeEnum: { ar: 'قائمة', en: 'Enum' },
      typeString: { ar: 'نص', en: 'Text' },
      a11yBoolOption: { ar: 'خيار منطقي', en: 'Boolean choice' },
    },

    // ===== PR-7 — per-setting change-history drawer =====
    history: {
      openLabel: { ar: 'سجل تغييرات {{key}}', en: 'Change history for {{key}}' },
      drawerTitle: { ar: 'سجل تغييرات الإعداد', en: 'Setting change history' },
      drawerDescription: {
        ar: 'كل تغيير مسجّل على هذا الإعداد بقيمه قبل وبعد ونوع التغيير.',
        en: 'Every recorded change with its before/after values and the change reason.',
      },
      oldValue: { ar: 'القيمة السابقة', en: 'Old value' },
      newValue: { ar: 'القيمة الجديدة', en: 'New value' },
      actor: { ar: 'بواسطة', en: 'By' },
      actorUnknown: { ar: 'غير معروف', en: 'Unknown' },
      reasonUpdate: { ar: 'تعديل', en: 'Update' },
      reasonReset: { ar: 'إعادة تعيين', en: 'Reset' },
      reasonUnknown: { ar: 'تغيير', en: 'Change' },
      empty: { ar: 'لم يُسجَّل أي تغيير على هذا الإعداد بعد.', en: 'No changes recorded for this setting yet.' },
      loadFailed: { ar: 'تعذّر تحميل سجل التغييرات.', en: 'Could not load the change history.' },
      retry: { ar: 'إعادة المحاولة', en: 'Retry' },
      navLabel: { ar: 'تصفّح سجل التغييرات', en: 'Browse change history' },
      prev: { ar: 'السابق', en: 'Previous' },
      next: { ar: 'التالي', en: 'Next' },
    },

    // ===== PR-7 — read-only feature-flag inventory (super admin only) =====
    featureFlags: {
      title: { ar: 'أعلام الميزات (بيئة النشر)', en: 'Feature flags (deployment environment)' },
      description: {
        ar: 'القيم الفعلية النافذة لأعلام الميزات كما تحلّها بيئة النشر — للقراءة فقط.',
        en: 'The runtime-effective feature-flag values resolved from the deployment environment — read-only.',
      },
      readOnlyNotice: {
        ar: 'للعرض فقط — أي تعديل يتم عبر متغيرات البيئة في مزوّد النشر حصراً، لا من الواجهة.',
        en: 'For display only — changes are made exclusively through environment variables on the deployment provider, never from this UI.',
      },
      envName: { ar: 'متغير البيئة', en: 'Environment variable' },
      sourceLabel: { ar: 'المصدر', en: 'Source' },
      sourceEnvironment: { ar: 'من البيئة', en: 'From environment' },
      sourceDefault: { ar: 'افتراضي الشيفرة', en: 'Code default' },
      stateLabel: { ar: 'الحالة', en: 'State' },
      enabled: { ar: 'مفعّل', en: 'Enabled' },
      disabled: { ar: 'معطّل', en: 'Disabled' },
      valueLabel: { ar: 'القيمة', en: 'Value' },
      loadFailed: { ar: 'تعذّر تحميل أعلام الميزات.', en: 'Could not load the feature flags.' },
      retry: { ar: 'إعادة المحاولة', en: 'Retry' },
      flags: {
        otp: {
          label: { ar: 'رمز التحقق للطلاب (OTP)', en: 'Student OTP verification' },
          note: { ar: 'عند التفعيل يُطلب رمز تحقق عبر الهاتف عند تسجيل دخول الطلاب.', en: 'When enabled, students verify a phone code at sign-in.' },
        },
        offline: {
          label: { ar: 'الحزم دون اتصال', en: 'Offline packages' },
          note: { ar: 'يتحكم بتمكين تنزيل الحزم دون اتصال وتشغيلها خارج الشبكة.', en: 'Controls enabling offline package downloads and offline playback.' },
        },
        hardDelete: {
          label: { ar: 'الحذف النهائي من الواجهة', en: 'Hard delete from the UI' },
          note: {
            ar: 'معطّل افتراضياً (fail-closed) — لا يمكن تفعيله من الواجهة؛ التعديل عبر متغيرات البيئة في مزوّد النشر فقط.',
            en: 'Disabled by default (fail-closed) — it cannot be enabled from this UI; changes are made only via environment variables on the deployment provider.',
          },
        },
        playIntegrity: {
          label: { ar: 'فحص Play Integrity', en: 'Play Integrity verification' },
          note: { ar: 'فحص نزاهة جهاز الطالب لتطبيق أندرويد قبل الوصول للمحتوى المحمي.', en: 'Verifies the Android device integrity of the student app before protected content access.' },
        },
        retention: {
          label: { ar: 'مدة الاستبقاء قبل الحذف', en: 'Retention window before deletion' },
          note: { ar: 'نافذة الاستبقاء قبل أي حذف فعلي — بالأيام.', en: 'The retention window before any actual deletion — in days.' },
        },
      },
    },
  },

  // ===== Permission editors (PermissionMatrixEditor + UiPermissionsEditor) =====
  permissions: {
    // Shared by both editors (identical wording in the originals).
    loadFailed: { ar: 'تعذّر تحميل الصلاحيات', en: 'Could not load permissions' },
    savedToast: { ar: 'تم حفظ الصلاحيات', en: 'Permissions saved' },
    saveFailed: { ar: 'فشل الحفظ', en: 'Save failed' },
    unsavedChanges: { ar: 'تغييرات غير محفوظة', en: 'Unsaved changes' },
    grantsLabel: { ar: 'صلاحية ممنوحة', en: 'grants' },
    // PR-7 — why the system-role editors are read-only (high-impact copy).
    systemRoleNote: {
      ar: 'منح هذا الدور ثابتة في المنصة ولا تعدّل من الواجهة — يضمن ذلك ألا يتغير سلوك الأدوار النظامية دون قصد.',
      en: 'This role\u0027s grants are fixed by the platform and are not editable from the UI — it keeps system-role behavior from changing accidentally.',
    },
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
