import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BookOpen, Clock, Eye, PlayCircle, LoaderCircle, MonitorPlay } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';
import { coursesApi } from '../services/courses-api';

/** Catalog of courses across every subject the student is entitled to (VideoAudio scope). */
export function CoursesCatalog() {
  const { data: courses, isLoading } = useQuery({
    queryKey: ['courses-catalog'],
    queryFn: async () => {
      const config = await entitlementRequestConfig();
      const subjectsRes = await apiClient.get('/subjects/my-subjects', config);
      const subjectsList = subjectsRes.data?.items ?? subjectsRes.data ?? [];

      const all: Awaited<ReturnType<typeof coursesApi.getSubjectCourses>> = [];
      await Promise.all(
        subjectsList.map(async (subject: { id: string }) => {
          try {
            const items = await coursesApi.getSubjectCourses(subject.id);
            all.push(...items);
          } catch { /* silent — subject may hold no courses for this student */ }
        })
      );
      return all;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="courses-loading">
        <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
      </div>
    );
  }

  if (!courses || courses.length === 0) {
    return (
      <div className="text-center py-16" data-testid="courses-empty">
        <MonitorPlay className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
        <p className="text-[var(--c-text-muted)]">لا توجد كورسات متاحة حالياً</p>
        <p className="text-xs text-[var(--c-text-faint)] mt-1">الكورسات المتاحة تظهر هنا بعد تفعيل اشتراكك</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="courses-grid">
      {courses.map((course) => (
        <Link
          key={course.id}
          to={`/my-studies/courses/${course.id}`}
          className="flex items-start gap-3 p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] hover:shadow-md transition-all group"
        >
          {course.coverImageUrl ? (
            <img
              src={course.coverImageUrl}
              alt={course.title}
              className="w-12 h-12 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
              <BookOpen className="w-6 h-6" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-[var(--c-text)] truncate group-hover:text-[var(--c-primary-700)] transition-colors">
              {course.title}
            </span>
            <p className="text-xs text-[var(--c-text-muted)] line-clamp-2 mt-0.5">{course.description || course.subjectNameAr}</p>
            <div className="flex items-center gap-3 text-xs text-[var(--c-text-muted)] mt-1.5">
              <span className="px-1.5 py-0.5 rounded bg-[var(--c-bg-hover)] font-medium">{course.subjectNameAr}</span>
              <span className="inline-flex items-center gap-1"><PlayCircle className="w-3.5 h-3.5" />{course.episodesCount} حلقة</span>
              {course.totalDurationSeconds > 0 && (
                <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDuration(course.totalDurationSeconds)}</span>
              )}
              <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{course.totalViewsCount}</span>
            </div>
          </div>
        </Link>
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
