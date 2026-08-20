import { NavLink } from 'react-router-dom';
import { Home, GraduationCap, Star, Search, User } from 'lucide-react';
import { cn } from '@/utils';

const items = [
  { to: '/dashboard', icon: Home, label: 'الرئيسية' },
  { to: '/subjects', icon: GraduationCap, label: 'الجامعات' },
  { to: '/favorites', icon: Star, label: 'المفضلة' },
  { to: '/search', icon: Search, label: 'البحث' },
  { to: '/profile', icon: User, label: 'حسابي' },
];

export function BottomNav() {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-[var(--z-sticky)] flex items-center justify-around h-14 border-t backdrop-blur-xl"
      style={{
        background: 'var(--c-glass)',
        borderColor: 'var(--c-border-glass)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
              isActive ? 'text-[var(--c-primary-700)]' : 'text-[var(--c-text-muted)]'
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive && (
                <span className="absolute top-0 w-8 h-0.5 rounded-full" style={{ background: 'var(--c-primary-700)' }} />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
