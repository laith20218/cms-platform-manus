import { Link } from 'react-router-dom';
import { AlertTriangle, KeyRound, LogIn, RotateCcw, ShieldAlert } from 'lucide-react';
import type { DenialVariant } from '../services/courses-api';

/**
 * Wave 12.5.A (Group 1) — the R69 CoursesCatalog error cards, extracted so the
 * four per-subject catalogs (library / practice / library-hub / exams) render the
 * SAME truthful taxonomy instead of a silent empty state:
 *   • CatalogEntitlementErrorCard — variant-aware (device vs no-grants), exactly
 *     the CoursesCatalog card (login button ONLY on device variants).
 *   • CatalogErrorCard — honest generic failure + retry, never a fake empty state.
 * WCAG 2.2 AA: role="alert", ≥44px actions, visible focus (same classes as the
 * CoursesCatalog originals).
 */

export function CatalogEntitlementErrorCard({ variant, onRetry, testId }: {
  variant: DenialVariant;
  onRetry: () => void;
  testId: string;
}) {
  const copy =
    variant === 'no-grants'
      ? {
          title: 'لا يوجد اشتراك فعّال يتيح هذا المحتوى',
          body: 'هذا المحتوى لموادك يُفتح بعد تفعيل كود اشتراك يشمله.',
          showLogin: false,
        }
      : {
          title: 'انتهت صلاحية الجلسة أو الجهاز غير مصرح له',
          body: 'يرجى إعادة تسجيل الدخول للوصول إلى محتواك.',
          showLogin: true,
        };
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] px-8 py-14 text-center"
      data-testid={testId}
      data-variant={variant}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--c-danger-50)]">
        {variant === 'no-grants'
          ? <KeyRound className="h-8 w-8 text-[var(--c-danger-500)]" aria-hidden="true" />
          : <ShieldAlert className="h-8 w-8 text-[var(--c-danger-500)]" aria-hidden="true" />}
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-bold text-[var(--c-text)]">{copy.title}</h3>
        <p className="text-sm text-[var(--c-text-muted)]">{copy.body}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {copy.showLogin && (
          <Link
            to="/login"
            className="btn-primary press"
            data-testid="entitlement-login-link"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" /> تسجيل الدخول
          </Link>
        )}
        {variant === 'no-grants' && (
          <Link
            to="/activate-code"
            className="btn-primary press"
            data-testid="entitlement-activate-link"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" /> تفعيل كود
          </Link>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="btn-secondary press"
          data-testid="entitlement-retry-button"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> إعادة المحاولة
        </button>
      </div>
    </div>
  );
}

export function CatalogErrorCard({ onRetry, testId, title, body }: {
  onRetry: () => void;
  testId: string;
  title: string;
  body: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] px-8 py-14 text-center"
      data-testid={testId}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--c-danger-50)]">
        <AlertTriangle className="h-8 w-8 text-[var(--c-danger-500)]" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-bold text-[var(--c-text)]">{title}</h3>
        <p className="text-sm text-[var(--c-text-muted)]">{body}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="btn-primary press"
      >
        <RotateCcw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  );
}
