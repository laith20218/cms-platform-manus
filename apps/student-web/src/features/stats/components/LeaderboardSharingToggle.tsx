import { useLeaderboardSharing } from '../hooks/useLeaderboardSharing';
import { ApiErrorDetail } from '@/components/common/ApiErrorDetail';

/**
 * W15.4.4.0b — the mutual-sharing consent card, shared between the
 * leaderboard opt-in prompt and Settings → «الخصوصية».
 *
 * The app has no shared Switch component (SettingsPage builds inline
 * button-toggles), so this carries an accessible switch — a
 * button[role=switch][aria-checked] styled to match those toggles —
 * instead of pulling in a new dependency.
 */
export default function LeaderboardSharingToggle() {
  const { isEnabled, isLoading, isError, refetch, toggle, isToggling, toggleError } = useLeaderboardSharing();

  return (
    <div
      data-testid="leaderboard-sharing-toggle"
      className="flex flex-col gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--c-text)]">المشاركة في لوحة الصدارة</p>
          <p className="mt-1 text-xs text-[var(--c-text-muted)]">
            عند التفعيل، تظهر بياناتك (الاسم، الصورة، عدد الأسئلة، الدقة) للطلاب المشاركين الآخرين، وترى بياناتهم في المقابل.
          </p>
        </div>

        {isLoading ? (
          <span className="h-6 w-12 shrink-0 animate-pulse rounded-full bg-[var(--c-bg-hover)]" aria-hidden="true" />
        ) : isError ? (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="text-xs font-medium text-[var(--c-danger-500)]">تعذر تحميل حالة المشاركة</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="press rounded-lg border border-[var(--c-border)] px-3 py-1.5 text-xs font-semibold text-[var(--c-text)]"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            aria-label="المشاركة في لوحة الصدارة"
            disabled={isToggling}
            onClick={() => toggle(!isEnabled)}
            className="relative h-6 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60"
            style={{ background: isEnabled ? 'var(--c-primary-700)' : 'var(--c-border-strong)' }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[inset-inline-start] duration-200"
              style={{ insetInlineStart: isEnabled ? '26px' : '2px' }}
            />
          </button>
        )}
      </div>
      {/* W16.3 — the PUT used to fail silently (the switch just reverted);
          now the failure is explained, with the backend's Arabic detail when present. */}
      {toggleError && (
        <div
          role="alert"
          data-testid="leaderboard-sharing-toggle-error"
          className="flex flex-col gap-1 rounded-xl border border-[var(--c-danger-500)] bg-[var(--c-danger-50)] px-3 py-2"
        >
          <p className="text-xs font-semibold text-[var(--c-danger-500)]">
            تعذّر حفظ إعدادات المشاركة. حاول مجدداً.
          </p>
          <ApiErrorDetail error={toggleError} />
        </div>
      )}
    </div>
  );
}
