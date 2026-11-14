import { CoursesCatalog } from '@/features/my-studies/components/CoursesCatalog';

/**
 * /study → «الكورسات» tab (Wave 15.4.1 parallel build): thin wrapper over the
 * existing CoursesCatalog so the study hub and the legacy my-studies hub
 * stay behaviorally identical until the 15.4.4 cutover.
 */
export function CoursesTab({ subjectId }: { subjectId: string | null }) {
  return (
    <div data-testid="study-courses-tab">
      <CoursesCatalog subjectId={subjectId} />
    </div>
  );
}
