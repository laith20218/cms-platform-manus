import { useState } from 'react';
import { FlaskConical, MonitorPlay, ShieldCheck } from 'lucide-react';
import { PlayerShell } from '@/features/media-player/PlayerShell';
import { LazyPlayerMount } from '@/features/media-player/LazyPlayerMount';

/** Real VideoPlayer chunk (Push 10.2) — stable module-level loader for React.lazy. */
const loadVideoPlayer = () => import('@/features/media-player/video/VideoPlayer');

/** Sandbox episode id — the e2e suite mocks the media API for this asset. */
const TEST_EPISODE_ID = '11111111-2222-3333-4444-555555555555';

/**
 * Push 10.1/10.2 — sandbox page for the player stack
 * (/my-studies/player-test). Since 10.2 this hosts the REAL VideoPlayer
 * (API-backed playback-url + progress + bookmarks) pointed at the sandbox
 * episode id above. Remove this route once the production players land
 * (later pushes wire VideoPlayer into the course player / library pages).
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
            <p className="text-sm text-[var(--c-text-muted)]">Push 10.2 — مشغّل الفيديو الحقيقي (مسار مؤقت)</p>
          </div>
        </div>

        <p className="mt-5 text-sm leading-7 text-[var(--c-text-soft)]">
          هذه الصفحة تستضيف مشغّل الفيديو الحقيقي مع واجهة التحكم الكاملة: التجديد الصامت لرابط
          التشغيل قبل انتهاء صلاحيته، استئناف المشاهدة من آخر موضع، حفظ المقاطع المرجعية،
          والنقر المزدوج للتقديم والتأخير — كل ذلك داخل قشرة ملء الشاشة المحمية.
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
        subtitle="مشغّل الفيديو الحقيقي — Push 10.2"
        kind="video"
        testId="player-shell"
      >
        <LazyPlayerMount
          active={open}
          loader={loadVideoPlayer}
          playerProps={{
            assetType: 'course-episode' as const,
            assetId: TEST_EPISODE_ID,
            title: 'محاضرة تجريبية — القلب والأوعية',
            testId: 'sandbox-video-player',
          }}
          testId="lazy-player-mount"
        />
      </PlayerShell>
    </div>
  );
}

export default PlayerTestPage;
