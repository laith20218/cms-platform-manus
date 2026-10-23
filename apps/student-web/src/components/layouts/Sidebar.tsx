// CMS student sidebar — clean white surface, calm-blue active accent, generous breathing room.
import { NavLink } from 'react-router-dom';
import { Bell, BarChart3, LayoutGrid, GraduationCap, Star, Search, Trophy, ClipboardCheck, FileText, Ticket, Settings, UserRound } from 'lucide-react';
import { cn } from '@/utils';

const navGroups = [
  {
    label: 'الرئيسية',
    items: [
      { to: '/dashboard', icon: LayoutGrid, label: 'لوحة التحكم' },
      { to: '/subjects', icon: GraduationCap, label: 'المواد' },
      { to: '/exams', icon: ClipboardCheck, label: 'الاختبارات' },
      { to: '/library', icon: FileText, label: 'المكتبة' },
    ],
  },
  {
    label: 'الأدوات',
    items: [
      { to: '/favorites', icon: Star, label: 'المفضلة' },
      { to: '/search', icon: Search, label: 'البحث' },
      { to: '/stats', icon: BarChart3, label: 'تقدمي' },
      { to: '/notifications', icon: Bell, label: 'الإشعارات' },
      { to: '/leaderboard', icon: Trophy, label: 'لوحة الصدارة' },
    ],
  },
  {
    label: 'الحساب',
    items: [
      { to: '/profile', icon: UserRound, label: 'الملف الشخصي' },
      { to: '/activate-code', icon: Ticket, label: 'تفعيل كود' },
      { to: '/settings', icon: Settings, label: 'الإعدادات' },
    ],
  },
];

export function Sidebar() {
  return (
    <aside
      className="hidden lg:flex flex-col w-[280px] shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-4 border-s bg-[var(--cms-surface)]"
      style={{ borderColor: 'var(--cms-line)' }}
    >
      {navGroups.map((group) => (
        <div key={group.label} className="mb-6 last:mb-0">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--cms-text-muted)]">
            {group.label}
          </div>
          <nav className="space-y-1">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ease-out border-s-2 border-transparent',
                    isActive
                      ? 'bg-[var(--cms-teal-50)] text-[var(--cms-teal-700)] font-semibold border-s-[var(--cms-teal-600)]'
                      : 'font-medium text-[var(--cms-text-soft)] hover:bg-[var(--cms-teal-50)] hover:text-[var(--cms-teal-700)]'
                  )
                }
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}
