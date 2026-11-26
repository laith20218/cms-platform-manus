/** PR-2 — the real not-found (404) screen.
 *
 * Command Center P1 mapped every unknown path silently to the overview view
 * (single-shell, "no 404 page"). PR-2 closes that gap: unknown paths render
 * an honest 404 with the requested path echoed back and a single recovery
 * action (return to the command center). The path is the router's own
 * `location.pathname` — never raw user input injected as markup.
 */

import { FileQuestion } from 'lucide-react';
import { EmptyState } from '@cms/ui';

export interface NotFoundViewProps {
  /** The unmatched path, echoed back so the operator can correct the link. */
  requestedPath: string;
  isArabic: boolean;
  /** Navigate back to the overview view. */
  onReturnHome: () => void;
}

export function NotFoundView({ requestedPath, isArabic, onReturnHome }: NotFoundViewProps) {
  return (
    <section
      className="rounded-xl border"
      style={{ background: 'var(--cms-surface)', borderColor: 'var(--cms-line)' }}
      dir={isArabic ? 'rtl' : 'ltr'}
      aria-label={isArabic ? 'الصفحة غير موجودة' : 'Page not found'}
    >
      <EmptyState
        icon={FileQuestion}
        iconClassName="bg-[color:var(--cms-teal-50)] text-[color:var(--cms-teal-700)]"
        title={isArabic ? 'الصفحة غير موجودة' : 'Page not found'}
        description={
          isArabic
            ? `المسار المطلوب غير موجود في لوحة الإدارة: ${requestedPath}. تحقق من الرابط أو عد إلى لوحة القيادة.`
            : `The requested path does not exist in the administration console: ${requestedPath}. Check the link or return to the command center.`
        }
        action={
          <button
            type="button"
            onClick={onReturnHome}
            data-testid="not-found-return"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors hover:opacity-90"
            style={{ background: 'var(--cms-teal-700)' }}
          >
            {isArabic ? 'العودة إلى لوحة القيادة' : 'Return to command center'}
          </button>
        }
        testId="not-found"
      />
    </section>
  );
}
