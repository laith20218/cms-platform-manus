import { CoursesCatalog } from '@/features/my-studies/components/CoursesCatalog';

/**
 * /study → «الكورسات» tab (Wave 15.4.1 parallel build): thin wrapper over the
 * existing CoursesCatalog so /study and /my-studies stay behaviorally
 * identical until the 15.4.4 cutover.
 */
export function CoursesTab({ subjectId }: { subjectId: string | null }) {
  return (
    <div data-testid="study-courses-tab">
      <CoursesCatalog subjectId={subjectId} />
    </div>
  );
}
