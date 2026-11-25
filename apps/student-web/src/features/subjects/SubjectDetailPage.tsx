import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { isAxiosError } from 'axios';
import {
  BarChart3, BookOpen, ChevronLeft, FileText, GraduationCap,
  Loader2, Lock, PackageOpen,
} from 'lucide-react';
import { academicApi } from './services/academic-api';
import { LectureCard } from './LectureCard';
import { LockedEmptyState } from '@/features/my-studies/components/LockedEmptyState';
// W1 (UX 1D) — contextual «تحميل أسئلة المادة دون اتصال» CTA (Android shell only).
import { OfflineDownloadCta } from '@/features/offline/OfflineDownloadCta';

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Subject detail (Push 5 fix): the route param can be a slug (تشريح-مرضي) or a
 * GUID (library deep links carry subject IDs). Load errors are now
 * status-aware — 403 means "no active subscription" (locked state + CTA),
 * 404 means the subject genuinely doesn't exist.
 */
export default function SubjectDetailPage() {
  const { subjectSlug } = useParams<{ subjectSlug: string }>();
  const isGuid = Boolean(subjectSlug && GUID_PATTERN.test(subjectSlug));

  const { data: subject, isLoading: subjectLoading, error: subjectError } = useQuery({
    queryKey: ['subject', subjectSlug, isGuid ? 'id' : 'slug'],
    queryFn: () => (isGuid ? academicApi.getSubjectById(subjectSlug!) : academicApi.getSubjectBySlug(subjectSlug!)),
    enabled: !!subjectSlug,
    retry: false,
  });

  const { data: lectures, isLoading: lecturesLoading, isError: lecturesError, refetch: refetchLectures } = useQuery({
    queryKey: ['lectures', subject?.id],
    queryFn: () => academicApi.getLectures(subject!.id),
    enabled: !!subject?.id,
  });

  if (subjectLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  }

  // Status-aware failure states (Push 5 Task 2):
  // 403/401 → the student holds no active grant → locked + activation CTA.
  const status = isAxiosError(subjectError) ? subjectError.response?.status : undefined;
  if (!subject && (status === 403 || status === 401)) {
    return (
      <div className="max-w-xl mx-auto py-8">
        <LockedEmptyState
          title="هذه المادة تتطلب كود تفعيل"
          hint="المادة موجودة لكنها تحتاج اشتراكاً نشطاً. فعّل كودك للوصول إلى المحاضرات والملفات والاختبارات."
        />
        <div className="text-center mt-4">
          <Link to="/subjects" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--c-primary-700)] hover:underline">
            <ChevronLeft className="w-4 h-4" /> تصفّح المواد المتاحة
          </Link>
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="text-center py-20" data-testid="subject-not-found">
        <PackageOpen className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
        <p className="text-[var(--c-text-muted)] mb-4">المادة غير موجودة</p>
        <Link to="/subjects" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--c-primary-700)] hover:underline">
          <ChevronLeft className="w-4 h-4" /> العودة إلى المواد
        </Link>
      </div>
    );
  }

  // Content scopes gate the tabs (Populated by the backend per active grants).
  const scopes = subject.contentScopes ?? [];
  const canQuestions = scopes.includes('QuestionsExams');
  const canLectures = scopes.includes('LecturesText');
  const canVideoAudio = scopes.includes('VideoAudio');
  const hasLibrary = canLectures || canVideoAudio;

  return (
    <div className="space-y-6">
      {/* W17.2 — the local breadcrumb is retired: the global PathTrail in
          AppShell renders الرئيسية › المواد › {subject} on this page (and
          resolves the subject's real name from the query cache). */}

      {/* Subject Header */}
      <motion.div
        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6 border backdrop-blur-xl relative overflow-hidden"
        style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)', boxShadow: 'var(--shadow-glass)' }}
      >
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: subject.color || 'var(--grad-primary)' }}>
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-[var(--c-text)] mb-1">{subject.nameAr}</h1>
            {subject.description && <p className="text-sm text-[var(--c-text-soft)] mb-3">{subject.description}</p>}
            <div className="flex flex-wrap gap-4 text-sm text-[var(--c-text-muted)]">
              <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> <strong className="text-[var(--c-text)]" lang="en">{subject.totalQuestions}</strong> سؤال</span>
              <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> <strong className="text-[var(--c-text)]" lang="en">{subject.totalLectures}</strong> محاضرة</span>
              <span className="flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> <strong className="text-[var(--c-text)]" lang="en">{subject.totalExams}</strong> اختبار</span>
            </div>
            {/* W1 (UX 1D) — pre-bakes this subject's question bank into an
                offline package (subjectId resolved from the :subjectSlug query
                above; invisible in a plain browser). */}
            <div className="mt-4">
              <OfflineDownloadCta
                kind="package"
                subjectId={subject.id}
                title={subject.nameAr}
                label="تحميل أسئلة المادة دون اتصال"
                testId="subject-offline-download-cta"
              />
            </div>
          </div>
        </div>

        {subject.userProgress && (
          <div className="mt-4 pt-4 border-t border-[var(--c-border)]">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-[var(--c-text-muted)]">تقدّمك في المادة</span>
              <span className="font-bold text-[var(--c-primary-700)]" lang="en">{subject.userProgress.completedPercentage.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-[var(--c-bg)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${subject.userProgress.completedPercentage}%`, background: 'var(--grad-primary)' }} />
            </div>
          </div>
        )}
      </motion.div>

      {/* Tabs — only the surfaces the student's grants actually cover */}
      <div className="flex gap-2 border-b border-[var(--c-border)] overflow-x-auto" role="tablist" aria-label="أقسام المادة">
        <span className="px-4 py-2 text-sm font-semibold text-[var(--c-primary-700)] border-b-2 border-[var(--c-primary-700)] whitespace-nowrap" role="tab" aria-selected="true">المحاضرات</span>
        {hasLibrary && (
          <Link to={`/subjects/${subject.slug}/library`} role="tab" className="px-4 py-2 text-sm font-medium text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)] whitespace-nowrap">المكتبة</Link>
        )}
        {canVideoAudio && (
          // W17.5 — direct /study deep link (was /my-studies — redirect hop).
          <Link to={`/study?subjectId=${subject.id}&tab=courses`} role="tab" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)] whitespace-nowrap">
            <GraduationCap className="w-4 h-4" /> الكورسات
          </Link>
        )}
        {canQuestions && (
          // W17.0 — renamed to match the SubjectModal action: the questions
          // surface is the study bank (label = destination, no false labels).
          <Link to={`/study?subjectId=${subject.id}&tab=bank`} role="tab" className="px-4 py-2 text-sm font-medium text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)] whitespace-nowrap">بنك الأسئلة</Link>
        )}
        {!hasLibrary && !canQuestions && !canVideoAudio && (
          <span className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-[var(--c-text-faint)] whitespace-nowrap" data-testid="subject-no-extras">
            <Lock className="w-3.5 h-3.5" /> أقسام إضافية متاحة بعد توسيع اشتراكك
          </span>
        )}
      </div>

      {/* Lectures */}
      {canLectures ? (
        lecturesLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--c-primary-700)]" /></div>
        ) : lecturesError ? (
          // Wave 12.5.A (Group 4) — a failed lectures fetch used to render an
          // empty list with no explanation.
          <div role="alert" className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 text-center" data-testid="subject-lectures-error">
            <p className="font-bold text-[var(--c-text)]">تعذّر تحميل محاضرات هذه المادة</p>
            <button
              onClick={() => refetchLectures()}
              className="mt-3 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(lectures || []).map((lec, i) => (
              <motion.div key={lec.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.4) }}>
                <LectureCard
                  lecture={lec}
                  href={`/subjects/${subject.slug}/lectures/${lec.id}`}
                  testId={`subject-lecture-card-${lec.id}`}
                />
              </motion.div>
            ))}
          </div>
        )
      ) : (
        <div className="text-center py-12 rounded-2xl border border-dashed border-[var(--c-border)]" data-testid="subject-lectures-locked">
          <Lock className="w-10 h-10 mx-auto mb-3 text-[var(--c-text-faint)]" />
          <p className="text-sm text-[var(--c-text-muted)]">محاضرات هذه المادة متاحة ضمن اشتراك يشمل المحتوى التعليمي</p>
          <Link to="/activate-code" className="inline-block mt-3 text-sm font-bold text-[var(--c-primary-700)] hover:underline">تفعيل كود</Link>
        </div>
      )}

      {canLectures && lectures && lectures.length === 0 && (
        <div className="text-center py-12 text-[var(--c-text-muted)]">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>لا توجد محاضرات في هذه المادة بعد</p>
        </div>
      )}
    </div>
  );
}
