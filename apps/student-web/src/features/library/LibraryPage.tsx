import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { academicApi } from '@/features/subjects/services/academic-api';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import NotFoundPage from '@/pages/NotFoundPage';
import { LibraryHub } from '@/features/my-studies/components/LibraryHub';

/**
 * Wave 15.5.1a — the library surface is now UNIFIED: this route-level page is
 * a thin slug resolver that delegates to LibraryHub (the same component behind
 * /study?tab=library). Filters, breadcrumb, h1, cards, the DocumentViewer and
 * the favorites toggle all live in the hub.
 */
export default function LibraryPage() {
  const { subjectSlug } = useParams<{ subjectSlug: string }>();
  const { data: subject, isLoading } = useQuery({
    queryKey: ['subject', subjectSlug],
    queryFn: () => academicApi.getSubjectBySlug(subjectSlug!),
    enabled: !!subjectSlug,
  });
  if (isLoading) return <LoadingScreen />;
  if (!subject) return <NotFoundPage />;
  return (
    <LibraryHub
      subjectId={subject.id}
      subjectSlug={subjectSlug}
      subjectName={subject.nameAr}
    />
  );
}
