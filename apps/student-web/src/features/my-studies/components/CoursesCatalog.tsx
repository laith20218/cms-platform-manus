import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle, BookOpen, Clock, Eye, GraduationCap, MonitorPlay, PlayCircle,
  RotateCcw, Target,
} from 'lucide-react';
import { coursesApi } from '../services/courses-api';
import { useMySubjects } from '../hooks/useMySubjects';
import { LockedEmptyState } from './LockedEmptyState';

/**
 * Catalog of courses across every subject the student is entitled to (VideoAudio
 * scope). `subjectId` narrows the catalog to a single subject — used by the
 * /my-studies?subjectId=…&tab=courses deep links from the subjects browser.
 *
 * Push 8: the old loader swallowed every per-subject error (`catch {}`), so a
 * full API failure rendered the misleading "no courses" empty state — the
 * infamous blank "الكورسات" tab. Failures are now surfaced honestly:
 * partial failures keep showing what loaded, a TOTAL failure renders an
 * error card with a Retry button, and only a genuinely empty catalog shows
 * the empty state.
 */
export function CoursesCatalog({ subjectId }: { subjectId?: string | null }) {
  const mySubjects = useMySubjects();
  const allSubjects = mySubjects.data ?? [];

  const subjects = subjectId ? allSubjects.filter((s) => s.id === subjectId) : allSubjects;

  const { data: courses, isLoading, isError, refetch } = useQuery({
    queryKey: ['courses-catalog', subjects.map((s) => s.id).join(',')],
    enabled: subjects.length > 0,
    retry: 1,
    queryFn: async () => {
      let loaded = 0;
      let failed = 0;
      const all: Awaited<ReturnType<typeof coursesApi.getSubjectCourses>> = [];
      await Promise.all(
        subjects.map(async (subject) => {
          try {
            const items = await coursesApi.getSubjectCourses(subject.id);
            all.push(...items);
            loaded += 1;
          } catch {
            failed += 1; // partial failure — keep going, remember it
          }
        })
      );
      // TOTAL failure: every subject blew up → throw so isError kicks in.
      if (loaded === 0 && failed > 0) {
        throw new Error('courses-catalog-unreachable');
      }
      return all;
    },
  });

  if (mySubjects.isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="courses-loading">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl" style={{ background: 'var(--c-bg-hover)' }} />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 w-2/3 animate-pulse rounded" style={{ background: 'var(--c-bg-hover)' }} />
                <div className="h-3 w-1/2 animate-pulse rounded" style={{ background: 'var(--c-bg-hover)' }} />
                <div className="h-3 w-1/3 animate-pulse rounded" style={{ background: 'var(--c-bg-hover)' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // The entitlement query itself failed — that's an error, NOT a lock.
  if (mySubjects.isError) {
    return <CatalogErrorCard onRetry={() => mySubjects.refetch()} />;
  }

  // No active subscription code → locked state with the activation CTA.
  // (Based on the FULL entitled list — a subject filter must not fake a lock.)
  if (allSubjects.length === 0) {
    return <LockedEmptyState title="الكورسات مُقفلة" hint="كورسات الفيديو والصوت لموادك تُفتح بعد تفعيل كود اشتراك يشمل محتوى الفيديو." />;
  }

  // Deep-linked subject the student holds no grant for (stale link).
  if (subjectId && subjects.length === 0) {
    return (
      <div className="text-center py-14 rounded-3xl border border-dashed border-[var(--c-border)]" data-testid="courses-subject-locked">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--c-bg-hover)]">
          <Target className="w-9 h-9 text-[var(--c-text-faint)]" />
        </div>
        <p className="font-bold text-[var(--c-text)]">لا يمكنك الوصول إلى كورسات هذه المادة بعد</p>
        <p className="text-xs text-[var(--c-text-faint)] mt-1">فعّل كوداً يشمل هذه المادة لفتح كورساتها</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="courses-loading">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl" style={{ background: 'var(--c-bg-hover)' }} />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 w-2/3 animate-pulse rounded" style={{ background: 'var(--c-bg-hover)' }} />
                <div className="h-3 w-1/2 animate-pulse rounded" style={{ background: 'var(--c-bg-hover)' }} />
                <div className="h-3 w-1/3 animate-pulse rounded" style={{ background: 'var(--c-bg-hover)' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Every entitled subject failed to load → honest error, not "empty".
  if (isError) {
    return <CatalogErrorCard onRetry={() => refetch()} />;
  }

  if (!courses || courses.length === 0) {
    return (
      <div className="text-center py-14 rounded-3xl border border-dashed border-[var(--c-border)]" data-testid="courses-empty">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--c-primary-50)]">
          <MonitorPlay className="w-9 h-9 text-[var(--c-primary-700)]" />
        </div>
        <p className="font-bold text-[var(--c-text)]">لا توجد كورسات متاحة حالياً</p>
        <p className="text-xs text-[var(--c-text-faint)] mt-1 mb-5">الكورسات الجديدة تظهر هنا بمجرد نشرها لموادك</p>
        <Link
          to="/subjects"
          className="press inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--c-primary-200)] bg-[var(--c-primary-50)] px-5 py-2.5 text-sm font-bold text-[var(--c-primary-700)] transition-colors hover:bg-[var(--c-primary-100)]"
        >
          <GraduationCap className="w-4 h-4" /> تصفّح المواد
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="courses-grid">
      {courses.map((course, index) => (
        <motion.div key={course.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }}>
          <Link
            to={`/my-studies/courses/${course.id}`}
            className="lift flex items-start gap-3 rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 transition-all group hover:border-[var(--c-primary-300)]"
            data-testid="course-card"
          >
            {course.coverImageUrl ? (
              <img
                src={course.coverImageUrl}
                alt={course.title}
                className="w-12 h-12 rounded-2xl object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
                <GraduationCap className="w-6 h-6" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-[var(--c-text)] truncate group-hover:text-[var(--c-primary-700)] transition-colors">
                {course.title}
              </span>
              <p className="text-xs text-[var(--c-text-muted)] line-clamp-2 mt-0.5">{course.description || course.subjectNameAr}</p>
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-[var(--c-text-muted)] mt-1.5">
                <span className="px-2 py-0.5 rounded-full bg-[var(--c-bg-hover)] font-medium inline-flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />{course.subjectNameAr}
                </span>
                <span className="inline-flex items-center gap-1"><PlayCircle className="w-3.5 h-3.5" />{course.episodesCount} حلقة</span>
                {course.totalDurationSeconds > 0 && (
                  <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDuration(course.totalDurationSeconds)}</span>
                )}
                <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{course.totalViewsCount}</span>
              </div>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

/** Shared error card — honest failure + retry (never a fake empty state). */
function CatalogErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] px-8 py-14 text-center"
      data-testid="courses-error"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--c-danger-50)]">
        <AlertTriangle className="h-8 w-8 text-[var(--c-danger-500)]" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-bold text-[var(--c-text)]">تعذّر تحميل الكورسات</h3>
        <p className="text-sm text-[var(--c-text-muted)]">حدث خطأ في الاتصال. تحقّق من الشبكة ثم أعد المحاولة.</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="press inline-flex min-h-11 items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-bold text-white shadow-md"
        style={{ background: 'var(--c-primary-700)' }}
      >
        <RotateCcw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} س ${minutes} د`;
  return `${minutes} د`;
}
