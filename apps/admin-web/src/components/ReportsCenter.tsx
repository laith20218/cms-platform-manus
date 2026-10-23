/**
 * ReportsCenter — thin wrapper that delegates the 8-tab analytics UI to
 * ReportsTabs, and renders ReportsModeration below it.
 *
 * Previously this was a monolithic 570-line component with inline charts.
 * Wave 3's ReportsTabs.tsx already implements the full 8-tab analytics view
 * (overview, students, academic, exams, questions, content, codes, operations)
 * with a real date-range dropdown, per-tab loading/empty states, and CSV export.
 * This wrapper activates it.
 */
import { ReportsTabs } from './ReportsTabs';
import { ReportsModeration } from './ReportsModeration';

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice?: (message: string) => void;
};

export function ReportsCenter({ token, isArabic, onError }: Props) {
  return (
    <div className="space-y-6">
      {/* 8-tab analytics center — fetches /api/v1/admin/analytics/* endpoints */}
      <ReportsTabs token={token} isArabic={isArabic} onError={onError} />

      {/* Reports moderation panel — fetches /api/v1/admin/reports */}
      <ReportsModeration token={token} isArabic={isArabic} onError={onError} onNotice={() => {}} />
    </div>
  );
}
