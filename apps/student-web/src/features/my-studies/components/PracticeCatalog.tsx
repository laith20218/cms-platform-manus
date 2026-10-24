import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen, CheckCircle2, ChevronLeft, CircleHelp, LoaderCircle, Target,
} from 'lucide-react';
import { academicApi, type LectureSummary } from '@/features/subjects/services/academic-api';
import { useMySubjects, hasScope, type MySubjectEntry } from '../hooks/useMySubjects';
import { LockedEmptyState } from './LockedEmptyState';

interface PracticeLecture extends LectureSummary {
  subjectId: string;
  subjectSlug: string;
  subjectName: string;
}

/**
 * My Studies → الدورات tab (Push 6 Task 2): the question-practice surface.
 * Lists every lecture that carries questions across the student's entitled
 * subjects (QuestionsExams scope) and links straight into the practice player
 * (`/subjects/:slug/lectures/:lectureId/questions` — the Push 2 question bank UI).
 *
 * Pass `subjectId` to restrict the catalog to a single subject (deep links from
 * the subjects browser: /my-studies?subjectId=…&tab=practice).
 */
export function PracticeCatalog({ subjectId }: { subjectId?: string | null }) {
  const mySubjects = useMySubjects();
  const allSubjects = useMemo(() => mySubjects.data ?? [], [mySubjects.data]);

  // Locked logic always considers the FULL entitled list — a filtered view of a
  // single subject must never fall back into the "no subscription" state.
  const practiceSubjects = useMemo(
    () => allSubjects.filter((s) => hasScope(s, 'QuestionsExams')),
    [allSubjects]
  );
  const effectiveSubjects = useMemo(
    () => (subjectId ? practiceSubjects.filter((s) => s.id === subjectId) : practiceSubjects),
    [practiceSubjects, subjectId]
  );

  const { data: lectures, isLoading } = useQuery({
    queryKey: ['practice-catalog', effectiveSubjects.map((s) => s.id).join(',')],
    enabled: effectiveSubjects.length > 0,
    queryFn: async (): Promise<PracticeLecture[]> => {
      const all: PracticeLecture[] = [];
      await Promise.all(
        effectiveSubjects.map(async (subject: MySubjectEntry) => {
          try {
            const items = await academicApi.getLectures(subject.id);
            items.forEach((lecture) => {
              all.push({
                ...lecture,
                subjectId: subject.id,
                subjectSlug: subject.slug,
                subjectName: subject.nameAr,
              });
            });
          } catch { /* silent — subject may hold no accessible lectures */ }
        })
      );
      // Only lectures that actually carry questions are practicable.
      return all.filter((lecture) => lecture.questionsCount > 0);
    },
  });

  if (mySubjects.isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="practice-loading">
        <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
      </div>
    );
  }

  // No active code at all → locked state with the activation CTA.
  if (allSubjects.length === 0) {
    return <LockedEmptyState title="الدورات مُقفلة" hint="دورات الأسئلة التفاعلية لموادك تُفتح بعد تفعيل كود اشتراك يشمل الأسئلة والاختبارات." />;
  }

  // Has codes, but none covering questions → scope-specific lock.
  if (practiceSubjects.length === 0) {
    return <LockedEmptyState title="الدورات غير مشمولة باشتراكك" hint="اشتراكك الحالي لا يشمل بنك الأسئلة — وسّع تفعيلك ليشمل الأسئلة والاختبارات لفتح الدورات." />;
  }

  // A subjectId deep link the student isn't entitled to (stale link).
  if (subjectId && effectiveSubjects.length === 0) {
    return (
      <div className="text-center py-14 rounded-2xl border border-dashed border-[var(--c-border)]" data-testid="practice-subject-locked">
        <Target className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
        <p className="text-[var(--c-text-muted)]">لا يمكنك الوصول إلى دورات هذه المادة بعد</p>
        <p className="text-xs text-[var(--c-text-faint)] mt-1">فعّل كوداً يشمل هذه المادة لفتح دوراتها</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="practice-loading">
        <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
      </div>
    );
  }

  if (!lectures || lectures.length === 0) {
    return (
      <div className="text-center py-14 rounded-2xl border border-dashed border-[var(--c-border)]" data-testid="practice-empty">
        <CircleHelp className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
        <p className="text-[var(--c-text-muted)]">لا توجد دورات أسئلة متاحة بعد</p>
        <p className="text-xs text-[var(--c-text-faint)] mt-1">تظهر الدورات هنا بمجرد إضافة أسئلة إلى محاضرات موادك</p>
      </div>
    );
  }

  const totalQuestions = lectures.reduce((sum, lecture) => sum + lecture.questionsCount, 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-xs text-[var(--c-text-muted)]" data-testid="practice-summary">
        <span className="px-2.5 py-1 rounded-full bg-[var(--c-primary-50)] text-[var(--c-primary-700)] font-semibold">
          {lectures.length} دورة
        </span>
        <span className="px-2.5 py-1 rounded-full bg-[var(--c-bg-hover)] font-medium">
          {totalQuestions} سؤال
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="practice-grid">
        {lectures.map((lecture, index) => (
          <motion.div key={lecture.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }}>
            <Link
              to={`/subjects/${lecture.subjectSlug}/lectures/${lecture.id}/questions`}
              className="flex items-start gap-3 p-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:shadow-md hover:-translate-y-0.5 transition-all group"
              data-testid="practice-card"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-bold text-white text-sm" style={{ background: 'var(--grad-primary)' }} lang="en">
                {lecture.lectureNumber}
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-[var(--c-text)] truncate group-hover:text-[var(--c-primary-700)] transition-colors">
                  {lecture.titleAr}
                </span>
                <div className="flex flex-wrap items-center gap-2.5 text-xs text-[var(--c-text-muted)] mt-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-[var(--c-bg-hover)] font-medium inline-flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />{lecture.subjectName}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[var(--c-primary-700)]">
                    <CircleHelp className="w-3.5 h-3.5" />{lecture.questionsCount} سؤال
                  </span>
                  {lecture.isCompleted && (
                    <span className="inline-flex items-center gap-1 text-[var(--c-success-700)] font-medium" data-testid="practice-card-completed">
                      <CheckCircle2 className="w-3.5 h-3.5" />مكتملة
                    </span>
                  )}
                </div>
                {!lecture.isCompleted && lecture.userProgress !== undefined && lecture.userProgress > 0 && (
                  <div className="mt-2 h-1.5 bg-[var(--c-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${lecture.userProgress}%`, background: 'var(--grad-primary)' }} />
                  </div>
                )}
              </div>
              <ChevronLeft className="w-4 h-4 text-[var(--c-text-muted)] group-hover:text-[var(--c-primary-700)] transition-colors shrink-0 mt-1" />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
