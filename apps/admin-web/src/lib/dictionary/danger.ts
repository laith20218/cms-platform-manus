/**
 * PR-3 — Danger Zone + Hard Delete dictionary section.
 *
 * These are the destructive-action surfaces (module-by-module data wipe and
 * physical row deletion). Arabic wording is the destructive-action contract:
 * consequences are stated explicitly, the typed confirmation and re-entry of
 * the acting password are demanded, and the disabled-flag notice explains
 * that Archive is the default lifecycle. Strings are moved byte-identical
 * from the two components; module label/consequence maps (labelAr/labelEn,
 * consequenceAr/consequenceEn, TABLE_LABELS) stay as component DATA — they
 * describe backend modules, not UI furniture.
 */
import type { DictSection } from './types';

export const dangerDict = {
  // ===== Danger Zone (module-by-module data wipe) =====
  wipe: {
    title: { ar: 'منطقة الخطر — محو البيانات', en: 'Danger Zone — data wipe' },
    intro: {
      ar: 'هذه العمليات للمدير العام فقط وتتطلب إعادة إدخال كلمة المرور وكتابة كلمة التأكيد. ابدأ بمعاينة المحو لترى بالضبط ما سيُحذف قبل التنفيذ — لا شيء يُحذف خلال المعاينة.',
      en: 'SuperAdmin only; every action re-asks for your password and a typed confirmation. Start with a dry-run preview to see exactly what would vanish — nothing is deleted during a preview.',
    },
    previewButton: { ar: 'معاينة المحو (بدون حذف)', en: 'Preview wipe (deletes nothing)' },
    previewError: { ar: 'تعذّر جلب المعاينة', en: 'Could not load the preview' },
    wipeFailed: { ar: 'فشل تنفيذ المحو', en: 'The wipe failed' },
    wipedToast: { ar: 'تم محو «{{module}}» — {{rows}} صفًا في {{tables}} جدولًا', en: 'Wiped "{{module}}" — {{rows}} rows across {{tables}} tables' },
    dialogTitle: { ar: 'محو «{{module}}»', en: 'Wipe "{{module}}"' },
    previewIntro: { ar: 'سيُحذف ما يلي نهائيًا (معاينة فقط — لم يُحذف شيء بعد):', en: 'The following will be permanently deleted (preview only — nothing has been deleted yet):' },
    noData: { ar: 'لا توجد بيانات في هذه الوحدة — لا حاجة لأي محو.', en: 'This module has no data — nothing to wipe.' },
    tableHeader: { ar: 'الجدول', en: 'Table' },
    rowsHeader: { ar: 'الصفوف', en: 'Rows' },
    total: { ar: 'الإجمالي', en: 'Total' },
    continueToConfirm: { ar: 'متابعة إلى التأكيد النهائي', en: 'Continue to final confirmation' },
    confirmInstructions: { ar: 'لتنفيذ المحو نهائيًا: اكتب كلمة DELETE أو حذف، ثم أدخل كلمة مرورك الحالية. لا يمكن التراجع عن هذه العملية.', en: 'To execute the wipe: type DELETE or حذف, then enter your current password. This cannot be undone.' },
    confirmWordLabel: { ar: 'كلمة التأكيد', en: 'Confirmation word' },
    passwordLabel: { ar: 'كلمة مرورك الحالية', en: 'Your current password' },
    backToPreview: { ar: 'عودة إلى المعاينة', en: 'Back to preview' },
    executeButton: { ar: 'محو هذه البيانات نهائيًا', en: 'Wipe this data permanently' },
  },

  // ===== Hard Delete dialog (physical row deletion) =====
  hardDelete: {
    failed: { ar: 'فشل الحذف النهائي', en: 'Hard delete failed' },
    dialogTitle: { ar: 'حذف نهائي: {{label}}', en: 'Hard delete: {{label}}' },
    disabledNotice: {
      ar: 'الحذف النهائي معطّل في هذه البيئة (Features:HardDeleteEnabled) — الأرشفة هي المسار الافتراضي، ويُفعَّل الحذف النهائي فقط بقرار صريح من الإدارة العامة.',
      en: 'Hard delete is disabled in this environment (Features:HardDeleteEnabled). Archiving is the default lifecycle; hard delete requires an explicit SuperAdmin decision to enable.',
    },
    disabledArchiveHint: { ar: 'استخدم «أرشفة» من قائمة الإجراءات بدلاً من الحذف النهائي.', en: 'Use "Archive" from the actions menu instead of hard delete.' },
    physicalDeleteHint: { ar: 'هذا حذف فعلي من قاعدة البيانات يتجاوز الأرشفة. أدخل كلمة مرورك الحالية للمتابعة.', en: 'This physically deletes the row, bypassing archiving. Enter your current password to proceed.' },
    cascadeLabel: { ar: 'حذف العناصر المرتبطة أيضًا (أسئلة/جلسات/ملفات تابعة)', en: 'Also delete linked children (questions/sessions/files)' },
    passwordLabel: { ar: 'كلمة مرورك الحالية', en: 'Your current password' },
    execute: { ar: 'حذف نهائي', en: 'Hard delete' },
  },
} as const satisfies DictSection;
