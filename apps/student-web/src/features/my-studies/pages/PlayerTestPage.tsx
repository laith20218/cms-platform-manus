import { useState } from 'react';
import { FlaskConical, MonitorPlay, ShieldCheck } from 'lucide-react';
import { PlayerShell } from '@/features/media-player/PlayerShell';
import { LazyPlayerMount } from '@/features/media-player/LazyPlayerMount';

/** Dummy player chunk — must be a stable module-level function for React.lazy. */
const loadDummyVideoPlayer = () => import('../player-test/DummyVideoPlayer');

/**
 * Push 10.1 — TEMPORARY sandbox page for the player shell stack
 * (/my-studies/player-test). Lets the shell, fullscreen, protection and lazy
 * mount be exercised in a real browser BEFORE any real player exists.
 * Remove this route once the production players land (later pushes).
 */
export function PlayerTestPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--c-primary-100)] text-[var(--c-primary-700)]">
            <FlaskConical className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--c-text)]">صفحة اختبار المشغّل</h1>
            <p className="text-sm text-[var(--c-text-muted)]">Push 10.1 — هيكل المشغّل وملء الشاشة (مسار مؤقت)</p>
          </div>
        </div>

        <p className="mt-5 text-sm leading-7 text-[var(--c-text-soft)]">
          هذه الصفحة تختبر قشرة المشغّل قبل دمج المشغّلات الحقيقية: فتح النافذة، ملء الشاشة
          على القشرة كاملة (وليس على عنصر الفيديو)، حماية النسخ داخل منطقة المشغّل فقط،
          والتحميل الكسول لحزمة المشغّل عند الفتح.
        </p>

        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="open-player-test"
          className="press mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--c-primary-600)] px-6 py-3.5 text-base font-bold text-[var(--c-text-on-primary)] transition-colors hover:bg-[var(--c-primary-700)] sm:w-auto"
        >
          <MonitorPlay className="h-5 w-5" strokeWidth={1.75} />
          فتح مشغّل الفيديو
        </button>

        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] px-4 py-3 text-xs text-[var(--c-text-muted)]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--c-text-brand)]" strokeWidth={1.75} />
          الحماية مفعّلة داخل نافذة المشغّل فقط — بقية الصفحة تعمل بشكل طبيعي
        </div>
      </div>

      <PlayerShell
        open={open}
        onOpenChange={setOpen}
        title="محاضرة تجريبية — القلب والأوعية"
        subtitle="اختبار قشرة المشغّل — Push 10.1"
        kind="video"
        testId="player-shell"
      >
        <LazyPlayerMount
          active={open}
          loader={loadDummyVideoPlayer}
          playerProps={{ title: 'مشغّل فيديو تجريبي' }}
          testId="lazy-player-mount"
        />
      </PlayerShell>
    </div>
  );
}

export default PlayerTestPage;
