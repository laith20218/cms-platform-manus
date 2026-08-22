// CMS student navigation: quiet clinical blue, fast utility actions, and profile-first account access.
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Search, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '@/app/providers/useTheme';
import { useAuth } from '@/app/providers/useAuth';

export function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const submitSearch = () => {
    const normalized = query.trim();
    navigate(normalized ? `/search?q=${encodeURIComponent(normalized)}` : '/search');
  };

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] h-16 flex items-center gap-5 px-4 md:px-6 border-b backdrop-blur-xl" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)' }}>
      <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0" aria-label="العودة إلى لوحة التحكم">
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--grad-primary)', boxShadow: '0 4px 12px rgba(25,118,210,0.25)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 2L3 7v6c0 5 3.5 9 9 11 5.5-2 9-6 9-11V7l-9-5z" /><path d="M9 12l2 2 4-4" /></svg>
        </div>
        <div className="hidden sm:flex flex-col leading-tight"><span className="font-extrabold text-[15px] text-[var(--c-primary-700)]">CMS</span><span className="text-[10px] text-[var(--c-text-muted)]" lang="en">College Medical</span></div>
      </Link>

      <div className="hidden md:block flex-1 max-w-[480px] mx-auto relative">
        <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="ابحث في الأسئلة، الملفات، المحاضرات..." className="w-full h-10 pe-10 ps-4 rounded-xl border-[1.5px] text-sm outline-none transition-all bg-[rgba(255,255,255,0.80)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-400)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-white" onKeyDown={(event) => event.key === 'Enter' && submitSearch()} />
        <button type="button" onClick={submitSearch} aria-label="تنفيذ البحث" className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--c-text-faint)] hover:text-[var(--c-primary-700)]"><Search className="w-[18px] h-[18px]" /></button>
      </div>

      <div className="flex items-center gap-2 ms-auto">
        <button onClick={toggleTheme} className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] transition-colors" aria-label="تبديل الوضع الليلي">{theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}</button>
        <Link to="/notifications" aria-label="الإشعارات" className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] transition-colors"><Bell className="w-5 h-5" /></Link>
        <Link to="/profile" aria-label="فتح الملف الشخصي" className="flex items-center gap-2.5 py-1 ps-3 pe-1 rounded-3xl border backdrop-blur-md transition-all hover:bg-[var(--c-glass-strong)]" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)' }}><div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[13px]" style={{ background: 'var(--grad-primary)' }}>{user?.fullName?.charAt(0) || 'ط'}</div><span className="hidden sm:block text-[13px] font-semibold text-[var(--c-text-soft)]">{user?.fullName?.split(' ')[0] || 'طالب'}</span></Link>
      </div>
    </header>
  );
}
