/**
 * DangerZone — SuperAdmin data-wipe surface (Command Center P1, D-3).
 *
 * The owner's locked decisions (2026-11-25):
 *  • questions wipe NEVER touches the academic structure (universities/colleges/years survive)
 *  • students wipe takes their sessions + subscriptions with them
 *  • "academic" is the nuclear tree (structure dies; students/admins/codes survive unscoped)
 *
 * Flow (double confirmation):
 *  1. Module card → «معاينة المحو» fires the backend dryRun and lists the EXACT
 *     per-table row counts that would vanish (nothing is deleted yet).
 *  2. Inside the preview dialog: type DELETE or حذف + re-enter the acting admin's
 *     password → the real wipe executes in one FK-safe transaction and reports
 *     what it deleted.
 *
 * Every destructive call is SuperAdmin + re-auth gated on the backend
 * (POST /api/v1/admin/system/wipe — AdminSystemController); this component only
 * refuses to send an obviously-invalid request client-side.
 */
import { useState } from 'react';
import { AlertTriangle, Eye, LoaderCircle, Trash2 } from 'lucide-react';
import { Dialog } from '@cms/ui';
import { adminWipe, ApiError, type WipeResult } from '../lib/api';
import { t, localeOf } from '../lib/dictionary';

type DangerZoneProps = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

type WipeModuleKey = 'questions' | 'students' | 'exams' | 'library' | 'courses' | 'subscriptions' | 'offline' | 'academic';

const MODULES: Array<{ key: WipeModuleKey; labelAr: string; labelEn: string; consequenceAr: string; consequenceEn: string }> = [
  {
    key: 'questions',
    labelAr: 'بنك الأسئلة',
    labelEn: 'Question bank',
    consequenceAr: 'يحذف جميع الأسئلة وخياراتها وصورها وسجلات المحاولات وروابطها بالاختبارات والممارسة. البنية الأكاديمية (الجامعات والكليات والسنوات والمواد) تبقى سليمة.',
    consequenceEn: 'Deletes every question with its options, images, attempt logs and exam/practice links. The academic structure survives untouched.',
  },
  {
    key: 'students',
    labelAr: 'الطلاب',
    labelEn: 'Students',
    consequenceAr: 'يحذف الطلاب مع جلساتهم واشتراكاتهم وسجلاتهم الأمنية ومفضلاتهم وتعليقاتهم وأجهزتهم. رموز الوصول تبقى وتتحرر للاستخدام مجددًا.',
    consequenceEn: "Deletes students with their sessions, subscriptions, security logs, favorites, annotations and devices. Access codes survive and are released for reuse.",
  },
  {
    key: 'exams',
    labelAr: 'الاختبارات',
    labelEn: 'Exams',
    consequenceAr: 'يحذف الاختبارات وجلساتها وأسئلتها المرتبطة ونتائج الطلاب فيها وروابطها بالدورات الامتحانية.',
    consequenceEn: 'Deletes exams with their sessions, linked questions, student results and exam-course links.',
  },
  {
    key: 'library',
    labelAr: 'المكتبة والملفات',
    labelEn: 'Library files',
    consequenceAr: 'يحذف ملفات المكتبة مع علامات المرجعية والتعليقات والتقييمات المرتبطة بها.',
    consequenceEn: 'Deletes library files with their bookmarks, annotations and views.',
  },
  {
    key: 'courses',
    labelAr: 'الدورات',
    labelEn: 'Courses',
    consequenceAr: 'يحذف الدورات التعليمية مع حلقاتها ومفضلات الطلاب لها.',
    consequenceEn: 'Deletes courses with their episodes and student favorites.',
  },
  {
    key: 'subscriptions',
    labelAr: 'الاشتراكات والأكواد',
    labelEn: 'Subscriptions & codes',
    consequenceAr: 'يحذف اشتراكات الطلاب ورموز الوصول ودُفعاتها بالكامل.',
    consequenceEn: 'Deletes student subscriptions, access codes and their batches.',
  },
  {
    key: 'offline',
    labelAr: 'الحزم دون اتصال',
    labelEn: 'Offline packages',
    consequenceAr: 'يحذف حزم العمل دون اتصال وسجلات تحرير مفاتيحها.',
    consequenceEn: 'Deletes offline packages and their key-release logs.',
  },
  {
    key: 'academic',
    labelAr: 'البنية الأكاديمية (شامل)',
    labelEn: 'Academic structure (nuclear)',
    consequenceAr: 'محو شامل: الجامعات والكليات والسنوات والفصول والمواد والمحاضرات مع كل الأسئلة والاختبارات والدورات والملفات المرتبطة. الطلاب والمدراء ورموز الوصول يبقون مع تصفير نطاقاتهم الأكاديمية.',
    consequenceEn: 'Nuclear wipe: the whole academic tree with every linked question, exam, course and file. Students, admins and codes survive with their scope references cleared.',
  },
];

/** Machine table labels → bilingual glossary (fallback: the raw label). */
const TABLE_LABELS: Record<string, { ar: string; en: string }> = {
  error_reports: { ar: 'بلاغات الأخطاء', en: 'Error reports' },
  favorites_questions: { ar: 'مفضلات الأسئلة', en: 'Question favorites' },
  favorites_files: { ar: 'مفضلات الملفات', en: 'File favorites' },
  favorites_episodes: { ar: 'مفضلات الحلقات', en: 'Episode favorites' },
  favorites: { ar: 'المفضلات', en: 'Favorites' },
  favorite_list_items: { ar: 'عناصر قوائم المفضلة', en: 'Favorite list items' },
  favorite_lists: { ar: 'قوائم المفضلة', en: 'Favorite lists' },
  attempt_logs: { ar: 'سجلات المحاولات', en: 'Attempt logs' },
  exam_questions: { ar: 'روابط الأسئلة بالاختبارات', en: 'Exam-question links' },
  practice_answers: { ar: 'إجابات التدريب', en: 'Practice answers' },
  practice_sessions: { ar: 'جلسات التدريب', en: 'Practice sessions' },
  question_options: { ar: 'خيارات الأسئلة', en: 'Question options' },
  question_images: { ar: 'صور الأسئلة', en: 'Question images' },
  questions: { ar: 'الأسئلة', en: 'Questions' },
  notification_deliveries: { ar: 'تسليمات الإشعارات', en: 'Notification deliveries' },
  notifications_targeted: { ar: 'الإشعارات الموجهة للطلاب', en: 'Targeted notifications' },
  security_logs_student: { ar: 'السجلات الأمنية للطلاب', en: 'Student security logs' },
  offline_key_release_logs: { ar: 'سجلات تحرير مفاتيح الحزم', en: 'Offline key releases' },
  offline_packages: { ar: 'الحزم دون اتصال', en: 'Offline packages' },
  exam_session_questions: { ar: 'أسئلة جلسات الاختبار', en: 'Exam session questions' },
  exam_sessions: { ar: 'جلسات الاختبار', en: 'Exam sessions' },
  lecture_completions: { ar: 'إكمالات المحاضرات', en: 'Lecture completions' },
  library_views: { ar: 'مشاهدات الملفات', en: 'Library views' },
  playback_progress: { ar: 'تقدم المشاهدة', en: 'Playback progress' },
  media_bookmarks: { ar: 'علامات الوسائط', en: 'Media bookmarks' },
  file_annotations: { ar: 'تعليقات الملفات', en: 'File annotations' },
  file_bookmarks: { ar: 'علامات الملفات', en: 'File bookmarks' },
  student_subscriptions: { ar: 'اشتراكات الطلاب', en: 'Student subscriptions' },
  subscription_codes_released: { ar: 'أكواد محرَّرة للاستخدام مجددًا', en: 'Codes released for reuse' },
  user_installations: { ar: 'تثبيتات التطبيق', en: 'User installations' },
  device_bindings: { ar: 'ربط الأجهزة', en: 'Device bindings' },
  user_sessions: { ar: 'جلسات المستخدمين', en: 'User sessions' },
  students: { ar: 'الطلاب', en: 'Students' },
  exam_course_items: { ar: 'عناصر الدورات الامتحانية', en: 'Exam-course items' },
  exams: { ar: 'الاختبارات', en: 'Exams' },
  exam_courses: { ar: 'الدورات الامتحانية', en: 'Exam courses' },
  course_episodes: { ar: 'حلقات الدورات', en: 'Course episodes' },
  courses: { ar: 'الدورات', en: 'Courses' },
  library_files: { ar: 'ملفات المكتبة', en: 'Library files' },
  subscription_codes: { ar: 'رموز الوصول', en: 'Access codes' },
  code_batches: { ar: 'دفعات الأكواد', en: 'Code batches' },
  students_scope_cleared: { ar: 'طلاب أُصفِّرت نطاقاتهم', en: 'Students unscoped' },
  admins_scope_cleared: { ar: 'مدراء أُصفِّرت نطاقاتهم', en: 'Admins unscoped' },
  subscription_codes_scope_cleared: { ar: 'أكواد أُصفِّرت نطاقاتها', en: 'Codes unscoped' },
  code_batches_scope_cleared: { ar: 'دفعات أُصفِّرت نطاقاتها', en: 'Batches unscoped' },
  student_subscriptions_scope_cleared: { ar: 'اشتراكات أُصفِّرت نطاقاتها', en: 'Subscriptions unscoped' },
  lectures: { ar: 'المحاضرات', en: 'Lectures' },
  subjects: { ar: 'المواد', en: 'Subjects' },
  semesters: { ar: 'الفصول', en: 'Semesters' },
  academic_years: { ar: 'السنوات الأكاديمية', en: 'Academic years' },
  colleges: { ar: 'الكليات', en: 'Colleges' },
  universities: { ar: 'الجامعات', en: 'Universities' },
};

export function DangerZone({ token, isArabic, onError, onNotice }: DangerZoneProps) {
  // PR-3 — destructive-warning strings resolve from the shared dictionary.
  const locale = localeOf(isArabic);
  const [previewing, setPreviewing] = useState<WipeModuleKey | null>(null);
  const [preview, setPreview] = useState<WipeResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [step, setStep] = useState<'counts' | 'confirm'>('counts');
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');

  const activeModule = MODULES.find((m) => m.key === previewing);

  const runPreview = async (key: WipeModuleKey) => {
    setPreviewing(key);
    setStep('counts');
    setPreview(null);
    setConfirmText('');
    setPassword('');
    setError('');
    setPreviewLoading(true);
    try {
      const result = await adminWipe(token, { module: key, confirmText: '', actorPassword: '', dryRun: true });
      setPreview(result);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : t(locale, 'danger.wipe.previewError'));
      setPreviewing(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmValid = confirmText.trim().toUpperCase() === 'DELETE' || confirmText.trim() === 'حذف';

  const executeWipe = async () => {
    if (!previewing || !confirmValid || !password) return;
    setExecuting(true);
    setError('');
    try {
      const result = await adminWipe(token, { module: previewing, confirmText: confirmText.trim(), actorPassword: password, dryRun: false });
      const total = result.tables.reduce((sum, t) => sum + t.rows, 0);
      onNotice(t(locale, 'danger.wipe.wipedToast', {
        module: MODULES.find((m) => m.key === result.module)?.labelAr ?? result.module,
        rows: total,
        tables: result.tables.length,
      }));
      setPreviewing(null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t(locale, 'danger.wipe.wipeFailed'));
    } finally {
      setExecuting(false);
    }
  };

  return (
    <section
      className="rounded-xl border-2 border-red-300 bg-red-50/40 p-5 space-y-4"
      aria-labelledby="danger-zone-heading"
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl shrink-0 bg-red-100 text-red-700">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h2 id="danger-zone-heading" className="text-xl font-bold text-red-800">
            {t(locale, 'danger.wipe.title')}
          </h2>
          <p className="text-sm mt-1 text-red-700 max-w-3xl">
            {t(locale, 'danger.wipe.intro')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {MODULES.map((module) => (
          <article
            key={module.key}
            className={`rounded-lg border p-4 flex flex-col gap-3 ${module.key === 'academic' ? 'border-red-400 bg-red-50' : 'border-red-200 bg-white'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-sm text-red-900">
                {module.key === 'academic' && '☢ '}
                {isArabic ? module.labelAr : module.labelEn}
              </h3>
              <span className="text-[10px] font-mono text-red-400/80 uppercase">{module.key}</span>
            </div>
            <p className="text-xs leading-relaxed text-red-800/90 flex-1">
              {isArabic ? module.consequenceAr : module.consequenceEn}
            </p>
            <button
              type="button"
              onClick={() => void runPreview(module.key)}
              disabled={previewLoading}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-red-700 border border-red-300 bg-white hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {previewLoading && previewing === module.key
                ? <LoaderCircle className="w-4 h-4 animate-spin" />
                : <Eye className="w-4 h-4" />}
              {t(locale, 'danger.wipe.previewButton')}
            </button>
          </article>
        ))}
      </div>

      {/* Preview + double-confirmation dialog */}
      <Dialog
        open={previewing !== null}
        onOpenChange={(open) => { if (!open && !executing) { setPreviewing(null); setPreview(null); } }}
        title={t(locale, 'danger.wipe.dialogTitle', { module: isArabic ? (activeModule?.labelAr ?? '') : (activeModule?.labelEn ?? '') })}
        dir={isArabic ? 'rtl' : 'ltr'}
        size="lg"
        testId="wipe-preview-dialog"
      >
        {step === 'counts' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {t(locale, 'danger.wipe.previewIntro')}
            </p>
            {previewLoading || !preview ? (
              <div className="h-24 flex items-center justify-center text-slate-400">
                <LoaderCircle className="w-6 h-6 animate-spin" />
              </div>
            ) : preview.tables.length === 0 ? (
              <p className="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                {t(locale, 'danger.wipe.noData')}
              </p>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-start px-3 py-2 font-semibold text-slate-600">{t(locale, 'danger.wipe.tableHeader')}</th>
                        <th className="text-end px-3 py-2 font-semibold text-slate-600">{t(locale, 'danger.wipe.rowsHeader')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.tables.map((table) => (
                        <tr key={table.table} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-700">
                            {isArabic ? TABLE_LABELS[table.table]?.ar : TABLE_LABELS[table.table]?.en ?? table.table}
                          </td>
                          <td className="px-3 py-2 text-end font-semibold tabular-nums text-red-700">{table.rows.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-red-50 border-t-2 border-red-200">
                      <tr>
                        <td className="px-3 py-2 font-bold text-red-800">{t(locale, 'danger.wipe.total')}</td>
                        <td className="px-3 py-2 text-end font-bold tabular-nums text-red-800">
                          {preview.tables.reduce((sum, t) => sum + t.rows, 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setStep('confirm')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-700 hover:bg-red-800 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t(locale, 'danger.wipe.continueToConfirm')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => { event.preventDefault(); void executeWipe(); }}
          >
            <p className="text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
              {t(locale, 'danger.wipe.confirmInstructions')}
            </p>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">{t(locale, 'danger.wipe.confirmWordLabel')}</span>
              <input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                autoComplete="off"
                data-testid="wipe-confirm-text"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-red-500 focus:outline-none text-sm font-mono"
                placeholder="DELETE / حذف"
                dir="ltr"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">{t(locale, 'danger.wipe.passwordLabel')}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                data-testid="wipe-actor-password"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-red-500 focus:outline-none text-sm"
              />
            </label>
            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep('counts')}
                disabled={executing}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {t(locale, 'danger.wipe.backToPreview')}
              </button>
              <button
                type="submit"
                disabled={executing || !confirmValid || !password}
                data-testid="wipe-execute"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-700 hover:bg-red-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {executing && <LoaderCircle className="w-4 h-4 animate-spin" />}
                {t(locale, 'danger.wipe.executeButton')}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  );
}
