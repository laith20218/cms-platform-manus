/**
 * PR-9 — servers dictionary section (Servers Dashboard).
 *
 * Owns every user-facing string of the read-only provider-monitoring view:
 *   • title/description + the fixed read-only notices (no mutation controls);
 *   • refresh/checkedAt/last-check lines + the conservative polling note;
 *   • status.* / overall.* — bilingual labels for every wire status;
 *   • statusExplanation.* — the «what this status means» sentences;
 *   • freshness.* — cached (age) vs fresh check;
 *   • providers.* — per-provider section furniture (render/vercel/neon/github);
 *   • fields.* — the shared fact-label vocabulary (name/plan/region/…);
 *   • history.* — the collapsible per-provider check history.
 *
 * Backend-authored strings (unavailableReason, the summary head note, the
 * history windowNote, metrics/usage unavailable reasons) are displayed
 * VERBATIM by the component — they are never duplicated here.
 */
import type { DictSection } from './types';

export const serversDict = {
  title: { ar: 'لوحة الخوادم', en: 'Servers Dashboard' },
  description: {
    ar: 'مراقبة قراءة فقط لحالة مزوّدي الاستضافة الأربعة (Render و Vercel و Neon و GitHub) — دون أي أمر تشغيلي.',
    en: 'Read-only monitoring of the four hosting providers (Render, Vercel, Neon, GitHub) — no operational commands.',
  },
  readOnlyNotice: {
    ar: 'لوحة عرض فقط: لا تتيح أي أمر تشغيلي (نشر، إعادة تشغيل، تعديل متغيرات البيئة، نطاقات، فوترة أو SQL) — تُدار العمليات من قنوات المزوّدين المعتمدة.',
    en: 'View-only panel: no operational commands (deploy, restart, environment edits, domains, billing, or SQL) — operations run through the approved provider consoles.',
  },
  noMutationsNotice: {
    ar: 'عن قصد لا توجد في هذه اللوحة أزرار نشر أو إعادة تشغيل أو تعديل بيئة — الاطلاع فقط.',
    en: 'By design there are no deploy, restart, or environment-edit controls here — observation only.',
  },
  pollingNote: {
    ar: 'تحديث تلقائي كل ٥ دقائق ويتوقف مؤقتاً عند إخفاء التبويب؛ التحديث اليدوي متاح دائماً.',
    en: 'Auto-refresh every 5 minutes, paused while the tab is hidden; manual refresh is always available.',
  },
  refresh: { ar: 'تحديث', en: 'Refresh' },
  refreshA11y: { ar: 'تحديث حالة الخوادم الآن', en: 'Refresh server statuses now' },
  refreshToast: { ar: 'تم تحديث حالة الخوادم.', en: 'Server statuses refreshed.' },
  overallLabel: { ar: 'الحالة الإجمالية', en: 'Overall status' },
  checkedAt: { ar: 'وقت الفحص', en: 'Checked at' },
  lastSuccessfulCheck: { ar: 'آخر فحص ناجح', en: 'Last successful check' },
  lastAttemptedCheck: { ar: 'آخر فحص مُجرّب', en: 'Last attempted check' },
  responseTime: { ar: 'زمن الاستجابة: {{ms}} ملّي', en: 'Response time: {{ms}} ms' },
  responseTimeUnavailable: { ar: 'زمن الاستجابة: غير متاح', en: 'Response time: unavailable' },
  unavailable: { ar: 'غير متاح', en: 'Unavailable' },
  reasonLabel: { ar: 'السبب', en: 'Reason' },
  summaryLoadError: { ar: 'تعذّر تحميل ملخص حالة الخوادم.', en: 'Unable to load the servers summary.' },
  forbidden: { ar: 'لا تملك صلاحية عرض حالة الخوادم', en: 'You do not have permission to view server statuses' },
  retry: { ar: 'إعادة المحاولة', en: 'Retry' },
  // Phase 3 (command-center dashboard) — the compact Overview summary card.
  summaryCardTitle: { ar: 'حالة الخدمات', en: 'Service health' },
  summaryCardOpenCenter: { ar: 'فتح المركز', en: 'Open the center' },
  providerNavLabel: { ar: 'أقسام المزوّدين', en: 'Provider sections' },
  cardOpenDetail: { ar: 'الانتقال إلى تفاصيل {{provider}}', en: 'Jump to {{provider}} details' },
  sectionReasonUnavailable: { ar: 'بيانات هذا المزوّد غير متاحة الآن', en: 'This provider\u0027s data is unavailable right now' },
  noProviderData: { ar: 'لم تُنتج بيانات لهذا المزوّد — لا تُخترع أرقام.', en: 'No data was produced for this provider — no numbers are invented.' },

  // ===== Provider status labels (wire vocabulary) =====
  status: {
    operational: { ar: 'يعمل', en: 'Operational' },
    degraded: { ar: 'متدنٍ', en: 'Degraded' },
    down: { ar: 'متوقف', en: 'Down' },
    unavailable: { ar: 'غير متاح', en: 'Unavailable' },
    missingCredentials: { ar: 'بيانات اعتماد غير مهيأة', en: 'Missing credentials' },
    invalidCredentials: { ar: 'بيانات اعتماد مرفوضة', en: 'Invalid credentials' },
    rateLimited: { ar: 'حد معدل الاستدعاءات', en: 'Rate limited' },
    unknown: { ar: 'غير معروفة', en: 'Unknown' },
  },

  // ===== Overall status labels (summary wire vocabulary) =====
  overall: {
    healthy: { ar: 'سليم', en: 'Healthy' },
    degraded: { ar: 'متدنٍ', en: 'Degraded' },
    down: { ar: 'متوقف', en: 'Down' },
    unavailable: { ar: 'غير متاح', en: 'Unavailable' },
    unknown: { ar: 'غير معروفة', en: 'Unknown' },
  },

  // ===== What each status MEANS (rendered beside the badge, never color-only) =====
  statusExplanation: {
    operational: {
      ar: 'أجاب المزوّد بنجاح وحُمّلت بياناته المُخطَّطة — كل شيء ضمن المألوف.',
      en: 'The provider answered successfully and its data mapped — everything nominal.',
    },
    degraded: {
      ar: 'أجاب المزوّد لكن حالته الذاتية تشير إلى مشكلة (مثل خدمة موقوفة) أو لم تُجلب سوى بيانات جزئية.',
      en: 'The provider answered but its own state signals a problem (e.g. a suspended service) or only partial data could be fetched.',
    },
    down: {
      ar: 'فشل وصول مؤقت (مهلة أو خطأ 5xx) استمر بعد إعادة محاولة واحدة محدودة.',
      en: 'A transient upstream failure (timeout or 5xx) that persisted after one bounded retry.',
    },
    unavailable: {
      ar: 'لم يُنتج الاستدعاء أي نتيجة (قاطع مفتوح أو استجابة غير صالحة) — لا تُخترع أرقام.',
      en: 'No upstream call produced a result (circuit open or malformed payload) — no numbers are invented.',
    },
    missingCredentials: {
      ar: 'أسماء متغيرات المراقبة غير مهيأة في الخادم — لم يُجرَ أي استدعاء للمزوّد أصلاً، لذا زمن الاستجابة غير متاح.',
      en: 'The monitoring environment names are not configured server-side — no provider call was attempted at all, so the response time is unavailable.',
    },
    invalidCredentials: {
      ar: 'رفض المزوّد بيانات الاعتماد المهيأة (401/403) — راجع تدوير بيانات الاعتماد المعتمد.',
      en: 'The provider rejected the configured credentials (401/403) — check the approved credential rotation.',
    },
    rateLimited: {
      ar: 'حد معدل استدعاءات المزوّد — المحاولة أُعيدت ٤٢٩؛ ستُعاد المحاولة تلقائياً بعد فترة الانتظار.',
      en: 'Provider rate limit — the attempt returned 429; the check will be retried automatically after the wait window.',
    },
    unknown: {
      ar: 'قيمة حالة غير معروفة وردت من الخادم — تُعرض كما هي دون تفسير مُختلَق.',
      en: 'An unrecognized status arrived from the server — shown as-is without an invented interpretation.',
    },
  },

  // ===== Freshness badge =====
  freshness: {
    cached: { ar: 'مخزّن مؤقتاً (عمر {{seconds}} ثانية)', en: 'Cached (age {{seconds}}s)' },
    fresh: { ar: 'فحص جديد', en: 'Fresh check' },
  },

  // ===== Shared fact labels (per-provider detail sections) =====
  fields: {
    name: { ar: 'الاسم', en: 'Name' },
    id: { ar: 'المعرّف', en: 'ID' },
    plan: { ar: 'الخطة', en: 'Plan' },
    region: { ar: 'المنطقة', en: 'Region' },
    state: { ar: 'الحالة', en: 'State' },
    target: { ar: 'الهدف', en: 'Target' },
    url: { ar: 'الرابط', en: 'URL' },
    commit: { ar: 'المُراجعة', en: 'Commit' },
    commitMessage: { ar: 'رسالة المُراجعة', en: 'Commit message' },
    createdAt: { ar: 'بدأ في', en: 'Created at' },
    finishedAt: { ar: 'انتهى في', en: 'Finished at' },
    readyAt: { ar: 'جهز في', en: 'Ready at' },
    updatedAt: { ar: 'آخر تحديث', en: 'Updated at' },
    pushedAt: { ar: 'آخر دفع', en: 'Last push' },
    visibility: { ar: 'الظهور', en: 'Visibility' },
    defaultBranch: { ar: 'الفرع الافتراضي', en: 'Default branch' },
    ref: { ar: 'المرجع/الفرع', en: 'Ref' },
    openIssues: { ar: 'البلاغات المفتوحة', en: 'Open issues' },
    none: { ar: '—', en: '—' },
  },

  // ===== Per-provider furniture =====
  providers: {
    render: {
      title: { ar: 'Render — استضافة الـ API', en: 'Render — API hosting' },
      serviceHeading: { ar: 'الخدمة', en: 'Service' },
      suspended: { ar: 'موقوفة', en: 'Suspended' },
      notSuspended: { ar: 'غير موقوفة', en: 'Not suspended' },
      autoDeployOn: { ar: 'النشر التلقائي مفعّل', en: 'Auto-deploy on' },
      autoDeployOff: { ar: 'النشر التلقائي معطّل', en: 'Auto-deploy off' },
      lastDeployHeading: { ar: 'آخر نشر', en: 'Last deploy' },
      noDeploy: { ar: 'لا يوجد نشر مسجل لهذه الخدمة.', en: 'No deploy recorded for this service.' },
      metricsHeading: { ar: 'مقاييس الأداء', en: 'Performance metrics' },
      metricsUnavailable: { ar: 'مقاييس الأداء غير متاحة في هذه الخطة', en: 'Performance metrics are not available on this plan' },
    },
    vercel: {
      title: { ar: 'Vercel — واجهتا الإدارة والطلاب', en: 'Vercel — Admin & Student webs' },
      projectsHeading: { ar: 'المشروعان (الإداري + الطلابي)', en: 'Projects (Admin + Student)' },
      deploymentHeading: { ar: 'آخر نشر', en: 'Latest deployment' },
      noDeployment: { ar: 'لا يوجد نشر مسجل لهذا المشروع.', en: 'No deployment recorded for this project.' },
      production: { ar: 'إنتاج', en: 'Production' },
      preview: { ar: 'معاينة', en: 'Preview' },
      openSite: { ar: 'فتح رابط {{name}} في تبويب جديد', en: 'Open {{name}} link in a new tab' },
      noUrl: { ar: 'لا يوجد رابط لهذا المشروع.', en: 'No URL for this project.' },
    },
    neon: {
      title: { ar: 'Neon — قاعدة البيانات', en: 'Neon — database' },
      projectHeading: { ar: 'المشروع', en: 'Project' },
      branchHeading: { ar: 'الفرع', en: 'Branch' },
      branchDefault: { ar: 'افتراضي', en: 'Default' },
      branchProtected: { ar: 'محمي', en: 'Protected' },
      usageHeading: { ar: 'الاستهلاك', en: 'Usage' },
      usageUnavailable: { ar: 'الاستهلاك غير متاح لهذا المفتاح/الخطة', en: 'Usage is not available for this key/plan' },
      connectionStringsNever: { ar: 'لا تُعرض سلاسل الاتصال أبداً في هذه اللوحة.', en: 'No connection details are ever displayed in this dashboard.' },
    },
    github: {
      title: { ar: 'GitHub — المستودع وسير العمل', en: 'GitHub — repository & workflows' },
      repositoryHeading: { ar: 'المستودع', en: 'Repository' },
      workflowsHeading: { ar: 'أحدث تشغيلات سير العمل', en: 'Recent workflow runs' },
      workflowsEmpty: { ar: 'لا توجد تشغيلات سير عمل حديثة مسجلة.', en: 'No recent workflow runs recorded.' },
    },
  },

  // ===== Collapsible per-provider check history =====
  history: {
    heading: { ar: 'سجل الفحوصات', en: 'Check history' },
    toggle: { ar: 'سجل فحوصات {{provider}}', en: 'Check history for {{provider}}' },
    capacity: { ar: 'سجل محدود بسعة {{count}} فحص في الذاكرة.', en: 'Bounded history of {{count}} checks in memory.' },
    windowNoteLabel: { ar: 'نطاق السجل', en: 'History window' },
    time: { ar: 'الوقت', en: 'Time' },
    empty: { ar: 'لا توجد فحوصات مسجلة بعد إعادة التشغيل الأخيرة.', en: 'No checks recorded since the last restart.' },
    loadError: { ar: 'تعذّر تحميل سجل الفحوصات.', en: 'Unable to load the check history.' },
  },
} as const satisfies DictSection;
