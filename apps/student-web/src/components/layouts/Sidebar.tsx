// CMS student sidebar (Push 8): icon-rail on tablet (md), full labels on desktop (lg).
// "دراستي" is the hero destination — it renders as a filled gradient pill at the top.
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Bell, BarChart3, BookOpenCheck, GraduationCap, LayoutGrid, Search, Settings,
  Star, Ticket, Trophy, UserRound,
} from 'lucide-react';
import { cn } from '@/utils';

/** Hero item — rendered separately above the groups with a distinct filled style. */
const heroItem = { to: '/my-studies', icon: BookOpenCheck, label: 'دراستي' };

const navGroups = [
  {
    label: 'الرئيسية',
    items: [
      { to: '/dashboard', icon: LayoutGrid, label: 'لوحة التحكم' },
      { to: '/subjects', icon: GraduationCap, label: 'المواد' },
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
      aria-label="التنقل الجانبي"
      className="hidden md:flex flex-col w-[84px] lg:w-[280px] shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto no-scrollbar border-s bg-[var(--cms-surface)] transition-[width] duration-300 ease-out p-3 lg:p-4"
      style={{ borderColor: 'var(--cms-line)' }}
    >
      {/* Hero — دراستي hub: the single most important student destination. */}
      <NavLink
        to={heroItem.to}
        title={heroItem.label}
        className={({ isActive }) =>
          cn(
            'press group relative mb-4 flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold',
            isActive
              ? 'text-white shadow-md'
              : 'text-white/95 hover:shadow-md'
          )
        }
        style={{ background: 'var(--cms-teal-600)' }}
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <motion.span
                layoutId="sidebar-hero-glow"
                className="absolute inset-0 rounded-2xl"
                style={{ background: 'var(--cms-teal-700)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <heroItem.icon className="relative z-[1] h-5 w-5 shrink-0" />
            <span className="relative z-[1] hidden lg:inline">دراستي</span>
          </>
        )}
      </NavLink>

      {navGroups.map((group) => (
        <div key={group.label} className="mb-5 last:mb-0">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--cms-text-muted)]">
            <span className="hidden lg:inline">{group.label}</span>
            <span className="lg:hidden" aria-hidden="true">•</span>
          </div>
          <nav className="space-y-1">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                className={({ isActive }) =>
                  cn(
                    'press flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm border-s-2 border-transparent',
                    isActive
                      ? 'bg-[var(--cms-teal-50)] text-[var(--cms-teal-700)] font-semibold border-s-[var(--cms-teal-600)]'
                      : 'font-medium text-[var(--cms-text-soft)] hover:bg-[var(--cms-teal-50)] hover:text-[var(--cms-teal-700)]'
                  )
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}
