// CMS student shell (Push 8): clean ivory canvas, sidebar + bottom nav.
// The main region reserves bottom padding on mobile so the fixed bottom nav
// never covers content (the old shell let the last rows hide beneath it).
// W15.1: dimensions consume the layout tokens in globals.css
// (--cms-content-max, --cms-bottom-pb) instead of magic numbers.
import { Outlet } from 'react-router-dom';
import { Navbar } from '@/components/layouts/Navbar';
import { Sidebar } from '@/components/layouts/Sidebar';
import { BottomNav } from '@/components/layouts/BottomNav';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export function AppShell() {
  return (
    <div data-testid="app-shell" className="min-h-screen bg-[var(--cms-ivory-100)]">
      <Navbar />
      <div className="flex">
        <Sidebar />
        <main
          id="main-content"
          data-testid="app-main"
          className="flex-1 min-w-0 w-full max-w-[var(--cms-content-max)] mx-auto p-4 sm:p-6 md:p-8 pt-6 md:pt-10 pb-[calc(var(--cms-bottom-pb)+env(safe-area-inset-bottom))] lg:pb-8"
        >
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
