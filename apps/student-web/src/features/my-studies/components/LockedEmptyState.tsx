import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound, Lock } from 'lucide-react';

/**
 * Shared locked/empty state (Push 5 Task 5): shown wherever a study surface
 * needs an ACTIVE subscription code the student doesn't hold. Points the
 * student at the code-activation page.
 */
export function LockedEmptyState({ title, hint }: { title?: string; hint?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] px-6 py-12 text-center"
      data-testid="locked-empty-state"
    >
      <div
        className="absolute -top-10 -end-10 w-36 h-36 rounded-full opacity-[0.06] pointer-events-none"
        style={{ background: 'var(--grad-primary)' }}
        aria-hidden="true"
      />
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
        <Lock className="w-7 h-7" />
      </div>
      <h3 className="text-base font-bold text-[var(--c-text)] mb-1.5">{title ?? 'هذا القسم مُقفل'}</h3>
      <p className="text-sm text-[var(--c-text-muted)] max-w-sm mx-auto mb-5 leading-relaxed">
        {hint ?? 'تفعيل كود الاشتراك يفتح لك المحتوى — الكورسات والاختبارات والملفات الخاصة بموادك.'}
      </p>
      <Link
        to="/activate-code"
        className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.03] active:scale-95"
        style={{ background: 'var(--grad-primary)' }}
        data-testid="activate-code-cta"
      >
        <KeyRound className="w-4 h-4" />
        تفعيل كود
      </Link>
    </motion.div>
  );
}
