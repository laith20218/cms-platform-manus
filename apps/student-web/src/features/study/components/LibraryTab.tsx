import { LibraryHub } from '@/features/my-studies/components/LibraryHub';

/**
 * /study → «المكتبة» tab (Wave 15.4.1 parallel build): thin wrapper over the
 * existing LibraryHub so /study and /my-studies stay behaviorally identical
 * until the 15.4.4 cutover.
 */
export function LibraryTab({ subjectId }: { subjectId: string | null }) {
  return (
    <div data-testid="study-library-tab">
      <LibraryHub subjectId={subjectId} />
    </div>
  );
}
