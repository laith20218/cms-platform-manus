import { useSearchParams } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { ExamsTab } from '@/features/study/components/ExamsTab';

/**
 * W16.1a — «الاختبارات» is a STANDALONE page at /exams (was: the /study hub's
 * exams tab hosting two sub-tabs since 15.4.3). /study?tab=exams now redirects
 * here (R1) with ?subjectId=/?subtab= forwarded, so legacy deep links
 * (subject sheet, subject page tabs, post-activation navigation) keep landing
 * on the same catalog. The sub-tab structure (الاختبارات/التدريب) and its
 * param contract live inside ExamsTab — the same component renders here, so
 * every pinned testid keeps working. The page owns its h1 now (the hub used
 * to own it when this surface rendered as a tab).
 */
export function ExamsPage() {
  const [searchParams] = useSearchParams();
  const subjectId = searchParams.get('subjectId');

  return (
    <div data-testid="exams-page" className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
          <ClipboardCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)]">الاختبارات</h1>
          <p className="text-sm text-[var(--c-text-muted)]">اختباراتك وجلسات التدريب في مكان واحد</p>
        </div>
      </div>

      {/* Sub-tabs + panels — same contract as the old hub tab (?subtab= lives in ExamsTab). */}
      <ExamsTab subjectId={subjectId} />
    </div>
  );
}
