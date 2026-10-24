import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpenCheck, GraduationCap, Home, Star, User } from 'lucide-react';
import { cn } from '@/utils';

/**
 * Mobile bottom navigation (Push 8 redesign).
 *
 * - Exactly the five primary destinations: الرئيسية · المواد · دراستي · المفضلة · حسابي
 *   ("دراستي" was previously missing from mobile — the hub was only reachable
 *   through desktop's sidebar.)
 * - Glassmorphism: translucent surface + backdrop blur + hairline top border.
 * - Active item: a spring-animated pill (framer-motion layoutId) behind the
 *   icon + filled icon color — unmistakable at a glance.
 * - Every target is ≥44px tall (min-h-11), the bar respects the iOS safe area,
 *   and each tap has a press micro-interaction (scale).
 */
const items = [
  { to: '/dashboard', icon: Home, label: 'الرئيسية' },
  { to: '/subjects', icon: GraduationCap, label: 'المواد' },
  { to: '/my-studies', icon: BookOpenCheck, label: 'دراستي' },
  { to: '/favorites', icon: Star, label: 'المفضلة' },
  { to: '/profile', icon: User, label: 'حسابي' },
];

export function BottomNav() {
  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="lg:hidden fixed bottom-0 inset-x-0 z-[var(--z-sticky)] border-t backdrop-blur-2xl"
      style={{
        background: 'var(--c-glass)',
        borderColor: 'var(--c-border-glass)',
        // iOS notch/safe area: the bar grows above the home indicator.
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -8px 32px rgba(15, 23, 42, 0.08)',
      }}
    >
      <ul className="flex items-stretch justify-around h-[68px]">
        {items.map((item) => (
          <li key={item.to} className="flex-1 min-w-0">
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'press relative flex h-full min-h-11 w-full flex-col items-center justify-center gap-1 rounded-2xl',
                  isActive ? 'text-[var(--c-primary-700)]' : 'text-[var(--c-text-muted)]'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="bottom-nav-pill"
                      className="tab-pill absolute inset-x-2.5 top-2 bottom-2"
                      transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                    />
                  )}
                  <item.icon
                    className={cn(
                      'relative z-[1] h-[22px] w-[22px] transition-transform duration-200',
                      isActive ? 'scale-110' : 'scale-100'
                    )}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                  <span
                    className={cn(
                      'relative z-[1] text-[10.5px] leading-none transition-all duration-200',
                      isActive ? 'font-bold' : 'font-medium'
                    )}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
