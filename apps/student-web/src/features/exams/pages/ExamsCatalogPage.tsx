import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ClipboardCheck, Clock, ChevronLeft, LibraryBig, LoaderCircle, Target } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { LockedEmptyState } from '@/features/my-studies/components/LockedEmptyState';
import { CatalogEntitlementErrorCard, CatalogErrorCard } from '@/features/my-studies/components/CatalogErrorCards';
import { loadCatalogAcrossSubjects } from '@/features/my-studies/utils/catalog-load';
import { variantForReason, EntitlementDeniedError } from '@/features/my-studies/services/courses-api';

interface ExamListItem {
  id: string;
  titleAr: string;
  examType: string;
  totalQuestions: number;
  durationMinutes: number;
  status: string;
  attemptsCount: number;
  completedCount: number;
  averageScore?: number | null;
}

interface SubjectWithExams {
  subjectId: string;
  subjectName: string;
  exams: ExamListItem[];
}

/**
 * Exams catalog (My Studies → الاختبارات tab). `subjectId` (Push 6) narrows
 * the catalog to a single subject — used by the /my-studies?subjectId=…&tab=exams
 * deep links from the subjects browser.
 */
export function ExamsCatalogPage({ subjectId }: { subjectId?: string | null }) {
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  const mySubjects = useMySubjects();
  const allSubjects = mySubjects.data ?? [];
  const subjects = subjectId ? allSubjects.filter((s) => s.id === subjectId) : allSubjects;

  // Wave 12.5.A (Group 1) — R69 taxonomy: per-subject failures surface, never
  // a silent subject-vanish (`catch { exams: [] }` used to drop whole subjects).
  const [entitlementDenied, setEntitlementDenied] = useState<ReturnType<typeof variantForReason> | null>(null);
  const { data: subjectsWithExams, isLoading, isError, isFetching, error, refetch } = useQuery({
    queryKey: ['exams-catalog', subjects.map((s) => s.id).join(',')],
    enabled: subjects.length > 0,
    retry: (failureCount, failure) => !(failure instanceof EntitlementDeniedError) && failureCount < 1,
    queryFn: async (): Promise<SubjectWithExams[]> =>
      loadCatalogAcrossSubjects(subjects.map((s) => s.id), async (subjectId) => {
        const subject = subjects.find((s) => s.id === subjectId);
        const examsRes = await apiClient.get(`/exams/by-subject/${subjectId}`, await entitlementRequestConfig());
        const exams = Array.isArray(examsRes.data) ? examsRes.data : (examsRes.data?.items ?? []);
        return [{
          subjectId,
          subjectName: subject?.nameAr ?? subjectId,
          exams: exams.filter((e: ExamListItem) => e.status === 'Published'),
        }];
      }),
  });

  const fetchingRef = useRef(false);
  useEffect(() => { fetchingRef.current = isFetching; }, [isFetching]);
  useEffect(() => {
    const onEntitlementError = (event: Event) => {
      if (fetchingRef.current) return;
      const detail = (event as CustomEvent<{ url?: string; reason?: string }>).detail;
      if (!detail?.url) return;
      if (detail.url.includes('/entitlements/issue')) { setEntitlementDenied('no-grants'); return; }
      if (detail.url.includes('/exams/')) setEntitlementDenied(variantForReason(detail.reason));
    };
    window.addEventListener('cms-entitlement-error', onEntitlementError);
    return () => window.removeEventListener('cms-entitlement-error', onEntitlementError);
  }, []);
  useEffect(() => {
    if (subjectsWithExams !== undefined) setEntitlementDenied(null);
  }, [subjectsWithExams]);

  // W15.1 (C.1): zero-exam subjects are hidden entirely — a wall of collapsed
  // «0 اختبار» rows read as a broken catalog. Only subjects with published exams
  // reach the accordion. Declared BEFORE the early returns (hooks order).
  const visibleSubjects = useMemo(
    () => (subjectsWithExams ?? []).filter((subject) => subject.exams.length > 0),
    [subjectsWithExams]
  );

  // W15.1 (C.1): auto-expand the FIRST subject carrying exams — once — so the tab
  // never opens on a fully-collapsed list. The user stays in control afterwards
  // (toggling any header, including collapsing the auto-opened one).
  const autoExpandedRef = useRef(false);
  useEffect(() => {
    if (autoExpandedRef.current || visibleSubjects.length === 0) return;
    autoExpandedRef.current = true;
    setExpandedSubject((current) => current ?? visibleSubjects[0].subjectId);
  }, [visibleSubjects]);

  const queryDenied = isError && error instanceof EntitlementDeniedError
    ? variantForReason(error.reason)
    : null;

  if (entitlementDenied || queryDenied) {
    return (
      <CatalogEntitlementErrorCard
        variant={queryDenied ?? entitlementDenied ?? 'device'}
        onRetry={() => { setEntitlementDenied(null); refetch(); }}
        testId="exams-catalog-entitlement-error"
      />
    );
  }

  if (mySubjects.isError) {
    return (
      <CatalogErrorCard
        onRetry={() => mySubjects.refetch()}
        testId="exams-catalog-error"
        title="تعذّر تحميل الاختبارات"
        body="حدث خطأ في الاتصال. تحقّق من الشبكة ثم أعد المحاولة."
      />
    );
  }

  const examTypeBadge = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t === 'final') return 'bg-red-50 text-red-700 border-red-200';
    if (t === 'midterm') return 'bg-[var(--c-warning-50)] text-[var(--c-warning-500)] border-[var(--c-warning-50)]';
    if (t === 'quiz') return 'bg-teal-50 text-teal-700 border-teal-200';
    return 'bg-sky-50 text-sky-700 border-sky-200';
  };

  if (mySubjects.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
      </div>
    );
  }

  // Wave 12.5.A (Group 1) — every subject failed → honest error, never "empty".
  if (isError) {
    return (
      <CatalogErrorCard
        onRetry={() => refetch()}
        testId="exams-catalog-error"
        title="تعذّر تحميل الاختبارات"
        body="حدث خطأ في الاتصال. تحقّق من الشبكة ثم أعد المحاولة."
      />
    );
  }

  // No active subscription code → locked state with the activation CTA.
  if (allSubjects.length === 0) {
    return <LockedEmptyState title="الاختبارات مُقفلة" hint="اختبارات موادك تُفتح بعد تفعيل كود الاشتراك — جرّب بنك الأسئلة والحلقات التفاعلية." />;
  }

  // Deep-linked subject the student holds no grant for (stale link).
  if (subjectId && subjects.length === 0) {
    return (
      <div className="text-center py-14 rounded-2xl border border-dashed border-[var(--c-border)]" data-testid="exams-subject-locked">
        <Target className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
        <p className="text-[var(--c-text-muted)]">لا يمكنك الوصول إلى اختبارات هذه المادة بعد</p>
        <p className="text-xs text-[var(--c-text-faint)] mt-1">فعّل كوداً يشمل هذه المادة لفتح اختباراتها</p>
      </div>
    );
  }

  return (
    <div>
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
        </div>
      ) : visibleSubjects.length === 0 ? (
        // W15.1 (C.2): the empty state matches the LockedEmptyState anatomy —
        // decorative gradient blob, tinted icon tile, title + hint, and an actionable
        // CTA into the exam-courses tab (practice material) instead of a dead end.
        // Every color rides the --c-* tokens, so dark mode adapts automatically.
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] px-6 py-12 text-center"
          data-testid="exams-empty"
        >
          <div
            className="absolute -top-10 -end-10 h-36 w-36 rounded-full opacity-[0.06] pointer-events-none"
            style={{ background: 'var(--grad-primary)' }}
            aria-hidden="true"
          />
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
            <ClipboardCheck className="w-7 h-7" aria-hidden="true" />
          </div>
          <h3 className="mb-1.5 text-base font-bold text-[var(--c-text)]">لا توجد اختبارات منشورة لموادك بعد</h3>
          <p className="mx-auto mb-5 max-w-sm text-sm leading-relaxed text-[var(--c-text-muted)]">
            الاختبارات الجديدة تظهر هنا بمجرد نشرها — في هذه الأثناء يمكنك التدرّب على نماذج الاختبارات من الدورات الامتحانية.
          </p>
          <Link
            to="/my-studies?tab=exam-courses"
            data-testid="exams-empty-cta"
            className="press inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.03] active:scale-95"
            style={{ background: 'var(--grad-primary)' }}
          >
            <LibraryBig className="h-4 w-4" aria-hidden="true" />
            انتقل إلى الدورات الامتحانية
          </Link>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {visibleSubjects.map((subject: SubjectWithExams) => (
            <div key={subject.subjectId} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] overflow-hidden">
              {/* Subject header */}
              <button
                onClick={() => setExpandedSubject(expandedSubject === subject.subjectId ? null : subject.subjectId)}
                className="w-full flex items-center justify-between p-4 hover:bg-[var(--c-bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold text-[var(--c-text)]">{subject.subjectName}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--c-primary-50)] text-[var(--c-primary-700)] font-medium">
                    {subject.exams.length} اختبار
                  </span>
                </div>
                <ChevronLeft className={`w-4 h-4 text-[var(--c-text-muted)] transition-transform ${expandedSubject === subject.subjectId ? '-rotate-90' : ''}`} />
              </button>

              {/* Exams list */}
              {expandedSubject === subject.subjectId && (
                <div className="border-t border-[var(--c-border)] divide-y divide-[var(--c-border)]">
                  {subject.exams.map((exam) => (
                    <Link
                      key={exam.id}
                      to={`/exams/${exam.id}`}
                      className="flex items-center justify-between p-4 hover:bg-[var(--c-bg-hover)] transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-[var(--c-text)] truncate">{exam.titleAr}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${examTypeBadge(exam.examType)}`}>
                            {exam.examType}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[var(--c-text-muted)]">
                          <span>{exam.totalQuestions} سؤال</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {exam.durationMinutes} دقيقة</span>
                          {exam.completedCount > 0 && <span>{exam.completedCount} مكتمل</span>}
                        </div>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-[var(--c-text-muted)] group-hover:text-[var(--c-primary-700)] transition-colors" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export { ExamsCatalogPage as default } from "./ExamsCatalogPage";
