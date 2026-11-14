import { ExamsCatalogPage } from '@/features/exams/pages/ExamsCatalogPage';

/**
 * /study → «الاختبارات» tab (Wave 15.4.1 parallel build): thin wrapper over
 * the existing ExamsCatalogPage. 15.4.3 will add the practice sub-tab
 * (Q3=A) inside this surface — until then it is just the exams catalog.
 */
export function ExamsTab({ subjectId }: { subjectId: string | null }) {
  return (
    <div data-testid="study-exams-tab">
      <ExamsCatalogPage subjectId={subjectId} />
    </div>
  );
}
