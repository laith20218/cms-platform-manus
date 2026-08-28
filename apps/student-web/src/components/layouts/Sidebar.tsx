import { NavLink } from 'react-router-dom';
import { Bell, BarChart3, LayoutGrid, GraduationCap, Star, Search, Trophy } from 'lucide-react';
import { cn } from '@/utils';

const navItems = [
  { to: '/dashboard', icon: LayoutGrid, label: 'لوحة التحكم' },
  { to: '/subjects', icon: GraduationCap, label: 'المواد' },
  { to: '/favorites', icon: Star, label: 'المفضلة' },
  { to: '/search', icon: Search, label: 'البحث' },
  { to: '/stats', icon: BarChart3, label: 'تقدمي' },
  { to: '/notifications', icon: Bell, label: 'الإشعارات' },
  { to: '/leaderboard', icon: Trophy, label: 'لوحة الصدارة' },
];

export function Sidebar() {
  return (
    <aside
      className="hidden lg:flex flex-col w-[280px] shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-4 border-s backdrop-blur-xl"
      style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)' }}
    >
      <div>
        <div className="text-[11px] font-bold text-[var(--c-text-faint)] uppercase tracking-wider px-3 pb-2">التنقّل</div>
        <nav className="space-y-1" aria-label="التنقّل الرئيسي">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all border border-transparent',
                isActive
                  ? 'bg-[var(--c-primary-50)] text-[var(--c-primary-700)] font-semibold border-[rgba(25,118,210,0.15)]'
                  : 'text-[var(--c-text-soft)] hover:bg-[rgba(25,118,210,0.06)] hover:text-[var(--c-primary-700)]'
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
