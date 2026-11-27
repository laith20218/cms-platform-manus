// CMS student shell (Push 8): clean ivory canvas, sidebar + bottom nav.
// The main region reserves bottom padding on mobile so the fixed bottom nav
// never covers content (the old shell let the last rows hide beneath it).
// W15.1: dimensions consume the layout tokens in globals.css
// (--cms-content-max, --cms-bottom-pb) instead of magic numbers.
import { Outlet } from 'react-router-dom';
import { Navbar } from '@/components/layouts/Navbar';
import { Sidebar } from '@/components/layouts/Sidebar';
import { BottomNav } from '@/components/layouts/BottomNav';
import { PathTrail } from '@/components/layouts/PathTrail';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
// W16.4 — reconcile the account's font-size preference (server) with the
// per-device localStorage mirror on every authenticated page load.
import { useFontSizeSync } from '@/features/settings/useFontSize';
// Night Task 3 — honest offline banner: when the browser reports no
// connection, one calm strip under the Navbar tells the student where the
// offline content lives (the CloudOff control beside the bell).
import { useOfflineStatus } from '@/features/offline/useOfflineStatus';
// PR-6 — must-change-password banner (login/profile payload flag): a
// persistent, dismissible-per-session amber strip linking to the existing
// change-password screen in /settings.
import { MustChangePasswordBanner } from '@/components/common/MustChangePasswordBanner';
import { CloudOff } from 'lucide-react';

function OfflineBanner() {
  const offline = useOfflineStatus();
  if (!offline) return null;
  return (
    <div
      dir="rtl"
      data-testid="offline-banner"
      role="status"
      className="flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-bold text-[var(--c-danger-500)] bg-[rgba(255,82,82,0.07)] border-b border-[rgba(255,82,82,0.18)]"
    >
      <CloudOff className="w-4 h-4 shrink-0" />
      يبدو أنك دون اتصال — المحتوى المحفوظ متاح من زر «وضع بدون إنترنت» بجانب الإشعارات
    </div>
  );
}

export function AppShell() {
  useFontSizeSync();

  return (
    <div data-testid="app-shell" className="min-h-screen bg-[var(--cms-ivory-100)]">
      <Navbar />
      <OfflineBanner />
      <MustChangePasswordBanner />
      <div className="flex">
        <Sidebar />
        <main
          id="main-content"
          data-testid="app-main"
          className="flex-1 min-w-0 w-full max-w-[var(--cms-content-max)] mx-auto p-4 sm:p-6 md:p-8 pt-6 md:pt-10 pb-[calc(var(--cms-bottom-pb)+env(safe-area-inset-bottom))] lg:pb-8"
        >
          {/* W17.2 — the global path trail: same slot, every authenticated
              page. The student always knows WHERE they are and HOW to go up
              (logical Back → parent segment), complementing — not fighting —
              the Navbar/Sidebar. */}
          <PathTrail />
          {/* A crash in one route must never blank the whole app. */}
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
