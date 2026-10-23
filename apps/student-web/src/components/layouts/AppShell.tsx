// CMS student shell — clean ivory canvas + generous content gutter, sidebar + bottom nav preserved.
import { Outlet } from 'react-router-dom';
import { Navbar } from '@/components/layouts/Navbar';
import { Sidebar } from '@/components/layouts/Sidebar';
import { BottomNav } from '@/components/layouts/BottomNav';

export function AppShell() {
  return (
    <div className="min-h-screen bg-[var(--cms-ivory-100)]">
      <Navbar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0 w-full max-w-[1280px] mx-auto p-6 md:p-8 pt-8 md:pt-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
