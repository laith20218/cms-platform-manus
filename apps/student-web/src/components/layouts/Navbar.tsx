// CMS student navigation: quiet clinical blue, fast utility actions, and profile-first account access.
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CloudOff, Search, Moon, Sun } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTheme } from '@/app/providers/useTheme';
import { useAuth } from '@/app/providers/useAuth';
// Night Task 3 — «وضع بدون إنترنت»: the control beside the notifications bell
// opens the offline panel (cached-content review) even while online.
import { OfflinePanel } from '@/features/offline/OfflinePanel';
import { useOfflineStatus } from '@/features/offline/useOfflineStatus';
// Night Task 4 — the bell opens a top-start quarter DROPDOWN (not a full page);
// «عرض الكل» inside it links to the full notifications page.
import { NotificationsDropdown } from '@/features/notifications/NotificationsDropdown';
import { notificationApi } from '@/features/notifications/services/notification-api';

export function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const offline = useOfflineStatus();
  const bellRef = useRef<HTMLButtonElement>(null);

  // Shared cache with the notifications surfaces (the page polls every 30 s and
  // keeps this count fresh; the bell badge is a passive reader of the same key).
  const { data: unreadCount } = useQuery({
    queryKey: ['unread-count'],
    queryFn: notificationApi.getUnreadCount,
    staleTime: 30_000,
  });

  const submitSearch = () => {
    const normalized = query.trim();
    navigate(normalized ? `/search?q=${encodeURIComponent(normalized)}` : '/search');
  };

  return (
    <header data-testid="app-navbar" className="sticky top-0 z-[var(--z-sticky)] h-[var(--cms-topbar-h)] flex items-center gap-5 px-4 md:px-6 border-b backdrop-blur-xl" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)' }}>
      <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0" aria-label="العودة إلى لوحة التحكم">
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--grad-primary)', boxShadow: '0 4px 12px rgba(25,118,210,0.25)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 2L3 7v6c0 5 3.5 9 9 11 5.5-2 9-6 9-11V7l-9-5z" /><path d="M9 12l2 2 4-4" /></svg>
        </div>
        <div className="hidden sm:flex flex-col leading-tight"><span className="font-extrabold text-[15px] text-[var(--c-primary-700)]">CMS</span><span className="text-[10px] text-[var(--c-text-muted)]" lang="en">College Medical</span></div>
      </Link>

      <div className="hidden md:block flex-1 max-w-[480px] mx-auto relative">
        <input data-testid="navbar-search" value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="ابحث في الأسئلة، الملفات، المحاضرات..." className="w-full h-10 pe-10 ps-4 rounded-xl border-[1.5px] text-sm outline-none transition-all bg-[var(--cms-surface-2)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-400)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-[var(--cms-surface)]" onKeyDown={(event) => event.key === 'Enter' && submitSearch()} />
        <button type="button" onClick={submitSearch} data-testid="navbar-search-submit" aria-label="تنفيذ البحث" className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--c-text-faint)] hover:text-[var(--c-primary-700)]"><Search className="w-[18px] h-[18px]" /></button>
      </div>

      <div className="flex items-center gap-2 ms-auto">
        {/* W19.3 (D-34): mobile search entry — the desktop input is md+ only;
            below md this icon routes to /search, whose input auto-focuses.
            D-35: the control carries a full Arabic aria-label. */}
        <Link
          to="/search"
          data-testid="navbar-search-mobile"
          aria-label="البحث في المحتوى"
          className="md:hidden w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] transition-colors"
        >
          <Search className="w-5 h-5" />
        </Link>
        <button onClick={toggleTheme} data-testid="navbar-theme-toggle" className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] transition-colors" aria-label="تبديل الوضع الليلي">{theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}</button>
        {/* Night Task 3 — «وضع بدون إنترنت» beside the bell: opens the offline
            panel (native cached-content review) even while online; pulses when
            the browser reports no connection so the student knows where to go. */}
        <button
          type="button"
          onClick={() => setOfflineOpen(true)}
          data-testid="navbar-offline-mode"
          aria-label="وضع بدون إنترنت — المحتوى المحفوظ"
          aria-pressed={offlineOpen}
          className={`w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors ${offline ? 'text-[var(--c-danger-500)] bg-[rgba(255,82,82,0.08)] animate-pulse' : 'text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)]'}`}
        >
          <CloudOff className="w-5 h-5" />
        </button>
        {/* Night Task 4 — the bell is a dropdown TRIGGER now (aria-haspopup /
            aria-expanded); the full page stays one hop away via «عرض الكل». */}
        <button
          ref={bellRef}
          type="button"
          onClick={() => setNotificationsOpen((openState) => !openState)}
          data-testid="navbar-bell"
          aria-label="الإشعارات"
          aria-haspopup="dialog"
          aria-expanded={notificationsOpen}
          className="relative w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] transition-colors"
        >
          <Bell className="w-5 h-5" />
          {(unreadCount ?? 0) > 0 && (
            <span
              data-testid="navbar-bell-unread-badge"
              lang="en"
              className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--c-danger-500)] text-white text-[10px] font-bold tabular-nums flex items-center justify-center shadow-sm"
            >
              {(unreadCount ?? 0) > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        <Link to="/profile" data-testid="navbar-avatar" aria-label="فتح الملف الشخصي" className="flex items-center gap-2.5 py-1 ps-3 pe-1 rounded-3xl border backdrop-blur-md transition-all hover:bg-[var(--c-glass-strong)]" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)' }}><div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[13px]" style={{ background: 'var(--grad-primary)' }}>{user?.fullName?.charAt(0) || 'ط'}</div><span className="hidden sm:block text-[13px] font-semibold text-[var(--c-text-soft)]">{user?.fullName?.split(' ')[0] || 'طالب'}</span></Link>
      </div>

      <OfflinePanel open={offlineOpen} onClose={() => setOfflineOpen(false)} />
      <NotificationsDropdown
        open={notificationsOpen}
        onClose={() => {
          setNotificationsOpen(false);
          bellRef.current?.focus();
        }}
      />
    </header>
  );
}
