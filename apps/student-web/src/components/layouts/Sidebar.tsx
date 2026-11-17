// CMS student sidebar (W15.1 → W16.1a): 2 sections — القائمة الرئيسية / الموارد.
// The Push-8 "hero" دراستي pill is dissolved into a regular primary item (the
// reference mockup groups it as a regular entry, not a hero).
// W15.1 (A.4): the "الدورات الامتحانية" entry was REMOVED — the storefront lives
// at /exam-courses (standalone since 15.4.2), reachable from every device
// (the old sidebar link was desktop-only and added a redundant navigation path).
// The tablet rail keeps an 84px icon-only column (md), full labels on desktop (lg);
// all widths/heights consume the layout tokens from globals.css.
//
// 15.1.5: the study hub links (دراستي + المكتبة + الكورسات + بنك الأسئلة)
// no longer use NavLink — it matches by pathname only, so all four stayed
// highlighted at once on any hub URL. They render as Links with
// explicit pathname + ?tab= detection (isStudyItemActive below) so exactly
// ONE item is active at a time.
//
// W16.1a: «المزيد» is dissolved —
//   - الاختبارات (/exams) and لوحة الصدارة (/leaderboard) are standalone
//     pages and join القائمة الرئيسية as regular NavLink items;
//   - تقدمي folds into دراستي (progress is the hub's default tab);
//   - بنك الأسئلة gets its own hub tab (/study?tab=bank — NEW href; the
//     content mount lands in Wave 16.1b);
//   - تفعيل كود and الإعدادات move into the Profile page (quick links
//     section there); the routes stay as deep links.
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import {
  BookOpen, BookOpenCheck, ClipboardCheck, ClipboardList, GraduationCap, LayoutGrid,
  MonitorPlay, Star, Trophy, UserRound,
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
      // W16.1a — standalone pages join the primary group.
      { slug: 'exams', to: '/exams', icon: ClipboardCheck, label: 'الاختبارات' },
      { slug: 'leaderboard', to: '/leaderboard', icon: Trophy, label: 'لوحة الصدارة' },
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
      // W16.1a — بنك الأسئلة gets its own hub tab (content mount: 16.1b).
      { slug: 'bank', to: '/study?tab=bank', icon: ClipboardList, label: 'بنك الأسئلة' },
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
  // the tabs with no dedicated sidebar item.
  // W16.1a — the dedicated hub items are library, courses, bank (الموارد).
  // Everything else (progress — the hub's DEFAULT tab since 16.1a — and
  // unknown values StudyPage falls back from) folds into دراستي.
  function isStudyItemActive(to: string): boolean {
    const [path, query = ''] = to.split('?');
    if (location.pathname !== path) return false;
    const toTab = new URLSearchParams(query).get('tab');
    const currentTab = searchParams.get('tab');
    if (toTab) return currentTab === toTab;
    // دراستي is active when no tab is present (hub home — default tab is
    // progress), OR when the active tab has no dedicated sidebar item.
    return (
      !currentTab ||
      !['library', 'courses', 'bank'].includes(currentTab)
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
              // (Link + explicit aria-current); everything else stays NavLink
              // (الاختبارات / لوحة الصدارة included — pathname matching covers
              // their deep links: /exams/:id, /leaderboard…).
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
