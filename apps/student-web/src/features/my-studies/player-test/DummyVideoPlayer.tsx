import { useEffect, useState } from 'react';
import { LoaderCircle, MonitorPlay } from 'lucide-react';

/**
 * Push 10.1 — Dummy player chunk for the /my-studies/player-test sandbox.
 *
 * Exercised through LazyPlayerMount's React.lazy path, so the real
 * code-splitting pipeline (chunk request → Suspense fallback → mount) runs
 * end-to-end. Contains a short artificial settle phase so the premium
 * skeleton is observable in tests/screenshots.
 *
 * The <video> element has NO src on purpose — zero network media traffic.
 */
export default function DummyVideoPlayer({ title = 'مشغّل تجريبي' }: { title?: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const settle = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(settle);
  }, []);

  if (!ready) {
    return (
      <div
        data-testid="dummy-video-loading"
        className="flex aspect-video w-full items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03]"
      >
        <LoaderCircle className="h-10 w-10 animate-spin text-teal-300/80" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div
      data-testid="dummy-video-player"
      className="w-full overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-2xl"
    >
      <div className="relative aspect-video w-full">
        <video controls playsInline preload="metadata" aria-label={title} className="h-full w-full bg-black" />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          <MonitorPlay className="h-10 w-10 text-teal-300/70" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-white/80">مشغّل فيديو تجريبي — قشرة Push 10.1</p>
          <p className="text-xs text-white/50">عنصر video بدون مصدر — لا يوجد أي تحميل من الشبكة</p>
        </div>
      </div>
    </div>
  );
}
