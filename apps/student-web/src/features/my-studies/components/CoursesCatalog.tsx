import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Clock, Eye, GraduationCap, LoaderCircle, MonitorPlay, PlayCircle } from 'lucide-react';
import { coursesApi } from '../services/courses-api';
import { useMySubjects } from '../hooks/useMySubjects';
import { LockedEmptyState } from './LockedEmptyState';

/** Catalog of courses across every subject the student is entitled to (VideoAudio scope). */
export function CoursesCatalog() {
  const mySubjects = useMySubjects();
  const subjects = mySubjects.data ?? [];

  const { data: courses, isLoading } = useQuery({
    queryKey: ['courses-catalog', subjects.map((s) => s.id).join(',')],
    enabled: subjects.length > 0,
    queryFn: async () => {
      const all: Awaited<ReturnType<typeof coursesApi.getSubjectCourses>> = [];
      await Promise.all(
        subjects.map(async (subject) => {
          try {
            const items = await coursesApi.getSubjectCourses(subject.id);
            all.push(...items);
          } catch { /* silent — subject may hold no courses for this student */ }
        })
      );
      return all;
    },
  });

  if (mySubjects.isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="courses-loading">
        <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
      </div>
    );
  }

  // No active subscription code → locked state with the activation CTA.
  if (subjects.length === 0) {
    return <LockedEmptyState title="الكورسات مُقفلة" hint="كورسات الفيديو والصوت لموادك تُفتح بعد تفعيل كود اشتراك يشمل محتوى الفيديو." />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="courses-loading">
        <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
      </div>
    );
  }

  if (!courses || courses.length === 0) {
    return (
      <div className="text-center py-14 rounded-2xl border border-dashed border-[var(--c-border)]" data-testid="courses-empty">
        <MonitorPlay className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
        <p className="text-[var(--c-text-muted)]">لا توجد كورسات متاحة حالياً</p>
        <p className="text-xs text-[var(--c-text-faint)] mt-1">الكورسات الجديدة تظهر هنا بمجرد نشرها لموادك</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="courses-grid">
      {courses.map((course, index) => (
        <motion.div key={course.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }}>
          <Link
            to={`/my-studies/courses/${course.id}`}
            className="flex items-start gap-3 p-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:shadow-md hover:-translate-y-0.5 transition-all group"
          >
            {course.coverImageUrl ? (
              <img
                src={course.coverImageUrl}
                alt={course.title}
                className="w-12 h-12 rounded-xl object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
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

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} س ${minutes} د`;
  return `${minutes} د`;
}
