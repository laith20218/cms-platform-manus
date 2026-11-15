import { useSearchParams, Navigate } from 'react-router-dom';

/**
 * W15.4.4a — /my-studies cutover. The legacy 5-tab hub page is no longer
 * mounted at /my-studies (the parallel /study hub from 15.4.1 takes over).
 * This transparent redirect keeps every legacy URL working:
 *
 *   /my-studies?tab=exam-courses      → /exam-courses (standalone page, 15.4.2)
 *   /my-studies?tab=practice          → /study?tab=exams&subtab=practice (15.4.3)
 *   /my-studies?tab=library|courses|exams → /study?tab=<same key>
 *   /my-studies (bare / unknown tab)  → /study (overview)
 *
 * ?subjectId= is preserved in every branch. /my-studies/courses/:courseId
 * is NOT handled here — it keeps rendering CoursePlayerPage from router.tsx.
 */
export function MyStudiesRedirect() {
  const [params] = useSearchParams();
  const tab = params.get('tab');
  const subjectId = params.get('subjectId');

  // exam-courses → /exam-courses
  if (tab === 'exam-courses') {
    const next = new URLSearchParams();
    if (subjectId) next.set('subjectId', subjectId);
    const qs = next.toString();
    return <Navigate to={'/exam-courses' + (qs ? '?' + qs : '')} replace />;
  }

  // practice → /study?tab=exams&subtab=practice
  if (tab === 'practice') {
    const next = new URLSearchParams();
    next.set('tab', 'exams');
    next.set('subtab', 'practice');
    if (subjectId) next.set('subjectId', subjectId);
    return <Navigate to={'/study?' + next.toString()} replace />;
  }

  // library / courses / exams → /study?tab=X
  if (tab === 'library' || tab === 'courses' || tab === 'exams') {
    const next = new URLSearchParams();
    next.set('tab', tab);
    if (subjectId) next.set('subjectId', subjectId);
    return <Navigate to={'/study?' + next.toString()} replace />;
  }

  // bare /my-studies or unknown tab → /study (overview)
  if (subjectId) {
    return <Navigate to={'/study?subjectId=' + subjectId} replace />;
  }
  return <Navigate to="/study" replace />;
}
