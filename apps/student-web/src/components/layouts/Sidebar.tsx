// CMS student sidebar (W15.1): 3 sections — القائمة الرئيسية / الموارد / المزيد.
// The Push-8 "hero" دراستي pill is dissolved into a regular primary item (the
// reference mockup groups it as a regular entry, not a hero).
// W15.1 (A.4): the "الدورات الامتحانية" entry was REMOVED — the storefront now
// lives at /exam-courses (standalone since 15.4.2), reachable from every device
// (the old sidebar link was desktop-only and added a redundant navigation path).
// The tablet rail keeps an 84px icon-only column (md), full labels on desktop (lg);
// all widths/heights consume the layout tokens from globals.css.
//
// 15.1.5: the four study hub links (دراستي + المكتبة + الكورسات + بنك الأسئلة)
// no longer use NavLink — it matches by pathname only, so all four stayed
// highlighted at once on any hub URL. They render as Links with
// explicit pathname + ?tab= detection (isStudyItemActive below) so exactly
// ONE item is active at a time.
// 15.4.4b: the hub links point at /study (was /my-studies — that URL now
// transparently redirects there). تقدمي and لوحة الصدارة join them from
// المزيد: /study?tab=progress / ?tab=leaderboard (tab-aware detection too).
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import {
  BarChart3, BookOpen, BookOpenCheck, ClipboardCheck, GraduationCap, LayoutGrid,
  MonitorPlay, Settings, Star, Ticket, Trophy, UserRound,
} from 'lucide-react';
import { cn } from '@/utils';

const navGroups = [
  {
    id: 'primary',
    label: 'القائمة الرئيسية',
    items: [
      { slug: 'dashboard', to: '/dashboard', icon: LayoutGrid, label: 'الرئيسية' },
      { slug: 'my-studies', to: '/study', icon: BookOpenCheck, label: 'دراستي' },
      { slug: 'subjects', to: '/subjects', icon: GraduationCap, label: 'المواد' },
      { slug: 'favorites', to: '/favorites', icon: Star, label: 'المفضلة' },
      { slug: 'profile', to: '/profile', icon: UserRound, label: 'حسابي' },
    ],
  },
  {
    id: 'resources',
    label: 'الموارد',
    items: [
      { slug: 'library', to: '/study?tab=library', icon: BookOpen, label: 'المكتبة' },
      { slug: 'courses', to: '/study?tab=courses', icon: MonitorPlay, label: 'الكورسات' },
      { slug: 'exams', to: '/study?tab=exams', icon: ClipboardCheck, label: 'بنك الأسئلة' },
    ],
  },
  // TEMPORARY (Wave 15.1): These 4 items will be relocated in
  // Wave 15.4 (Study reshape + Profile merge). Kept here so no
  // route becomes unreachable in the interim. See DEBT-ORPHAN-01.
  {
    id: 'more',
    label: 'المزيد',
    items: [
      { slug: 'stats', to: '/study?tab=progress', icon: BarChart3, label: 'تقدمي' },
      { slug: 'leaderboard', to: '/study?tab=leaderboard', icon: Trophy, label: 'لوحة الصدارة' },
      { slug: 'activate-code', to: '/activate-code', icon: Ticket, label: 'تفعيل كود' },
      { slug: 'settings', to: '/settings', icon: Settings, label: 'الإعدادات' },
    ],
  },
];

export function Sidebar() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // 15.1.5 — custom active detection for the /study hub links. NavLink
  // (end=false, pathname-only matching) marked ALL study items active on
  // any /study URL. Compare BOTH the pathname and the ?tab= param: the
  // tab-carrying items own their exact tab; دراستي owns the tab-less URL plus
  // the tabs with no dedicated sidebar item. 15.4.4b — the hub's default tab
  // is 'overview' (StudyPage falls back to it when ?tab= is absent or
  // invalid), and تقدمي / لوحة الصدارة joined from المزيد as
  // ?tab=progress / ?tab=leaderboard, so they take the tab-aware path too.
  function isStudyItemActive(to: string): boolean {
    const [path, query = ''] = to.split('?');
    if (location.pathname !== path) return false;
    const toTab = new URLSearchParams(query).get('tab');
    const currentTab = searchParams.get('tab');
    if (toTab) return currentTab === toTab;
    // دراستي is active when no tab is present (hub home), OR when
    // the active tab is one that has no dedicated sidebar item.
    // Dedicated items own: library, courses, exams (الموارد) +
    // progress, leaderboard (المزيد). Everything else (overview,
    // unknown values StudyPage falls back from) folds into دراستي.
    return (
      !currentTab ||
      !['library', 'courses', 'exams', 'progress', 'leaderboard'].includes(currentTab)
    );
  }

  const itemClasses = (active: boolean) =>
    cn(
      'press flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm border-s-2 border-transparent',
      active
        ? 'bg-[var(--c-primary-50)] text-[var(--c-primary-800)] font-semibold border-s-[var(--c-primary-600)]'
        : 'font-medium text-[var(--cms-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-800)]'
    );

  return (
    <aside
      data-testid="app-sidebar"
      aria-label="التنقل الجانبي"
      className="hidden md:flex flex-col w-[var(--cms-sidebar-rail-w)] lg:w-[var(--cms-sidebar-w)] shrink-0 sticky top-[var(--cms-topbar-h)] h-[calc(100vh-var(--cms-topbar-h))] overflow-y-auto no-scrollbar border-s bg-[var(--cms-surface)] transition-[width] duration-300 ease-out p-3 lg:p-4"
      style={{ borderColor: 'var(--cms-line)' }}
    >
      {navGroups.map((group) => (
        <div key={group.id} data-testid={`sidebar-group-${group.id}`} className="mb-5 last:mb-0">
          <div
            data-testid={`sidebar-group-label-${group.id}`}
            className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--cms-text-muted)]"
          >
            <span className="hidden lg:inline">{group.label}</span>
            <span className="lg:hidden" aria-hidden="true">•</span>
          </div>
          <nav className="space-y-1">
            {group.items.map((item) => {
              // 15.1.5 — the /study hub links take the custom ?tab= detection
              // (Link + explicit aria-current); everything else stays NavLink.
              const isStudyLink = item.to === '/study' || item.to.startsWith('/study?');
              if (isStudyLink) {
                const active = isStudyItemActive(item.to);
                return (
                  <Link
                    key={item.slug}
                    to={item.to}
                    title={item.label}
                    data-testid={`sidebar-item-${item.slug}`}
                    aria-current={active ? 'page' : undefined}
                    className={itemClasses(active)}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                );
              }
              return (
                <NavLink
                  key={item.slug}
                  to={item.to}
                  title={item.label}
                  data-testid={`sidebar-item-${item.slug}`}
                  className={({ isActive }) => itemClasses(isActive)}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="hidden lg:inline">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      ))}
    </aside>
  );
}
