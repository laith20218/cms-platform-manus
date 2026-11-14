import { Layers } from 'lucide-react';
import { ExamCoursesCatalog } from '../components/ExamCoursesCatalog';

/**
 * Standalone /exam-courses page (Wave 15.4.2 — parallel build). The route was
 * a redirect into the My Studies hub since W15.1 (A.3); it now renders the
 * storefront directly. ExamCoursesCatalog is unchanged — it owns its URL
 * params (?examTab=, cascade levels, subjectId) and localStorage bootstrap,
 * so it mounts identically in any route context.
 *
 * The page provides the h1-level header the hub used to own; the catalog's
 * own CatalogHeader stays h2-level below it. Reachable via direct URL only
 * until the 15.4.4 cutover (the 3 internal links keep pointing at
 * /my-studies?tab=exam-courses until then).
 *
 * Legacy /exam-courses?tab=years|categorized URLs render the default lens —
 * the catalog reads ?examTab= only (DEBT-EXAMCOURSES-LEGACY).
 */
export function ExamCoursesPage() {
  return (
    <div
      data-testid="exam-courses-page"
      className="max-w-4xl mx-auto space-y-6"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-md"
          style={{ background: 'var(--c-primary-700)' }}
        >
          <Layers className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)]">
            الدورات الامتحانية
          </h1>
          <p className="text-sm text-[var(--c-text-muted)]">
            تصفّح الدورات الامتحانية حسب المادة والتصنيف
          </p>
        </div>
      </div>
      <ExamCoursesCatalog />
    </div>
  );
}
