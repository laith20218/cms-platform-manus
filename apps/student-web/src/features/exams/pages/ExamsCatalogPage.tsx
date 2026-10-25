import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Clock, ChevronLeft, LoaderCircle, Target } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { LockedEmptyState } from '@/features/my-studies/components/LockedEmptyState';

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

  const { data: subjectsWithExams, isLoading } = useQuery({
    queryKey: ['exams-catalog', subjects.map((s) => s.id).join(',')],
    enabled: subjects.length > 0,
    queryFn: async (): Promise<SubjectWithExams[]> => {
      // Fetch exams for each entitled subject in parallel
      const result = await Promise.all(
        subjects.map(async (subject) => {
          try {
            const examsRes = await apiClient.get(`/exams/by-subject/${subject.id}`, await entitlementRequestConfig());
            const exams = Array.isArray(examsRes.data) ? examsRes.data : (examsRes.data?.items ?? []);
            return {
              subjectId: subject.id,
              subjectName: subject.nameAr,
              exams: exams.filter((e: ExamListItem) => e.status === 'Published'),
            };
          } catch {
            return { subjectId: subject.id, subjectName: subject.nameAr, exams: [] };
          }
        })
      );
      return result.filter((s) => s.exams.length > 0);
    },
  });

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
      ) : !subjectsWithExams || subjectsWithExams.length === 0 ? (
        <div className="text-center py-14 rounded-2xl border border-dashed border-[var(--c-border)]" data-testid="exams-empty">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
          <p className="text-[var(--c-text-muted)]">لا توجد اختبارات منشورة لموادك بعد</p>
          <p className="text-xs text-[var(--c-text-faint)] mt-1">الاختبارات الجديدة تظهر هنا بمجرد نشرها</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subjectsWithExams.map((subject: SubjectWithExams) => (
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
