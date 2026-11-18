import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * W17.2 — the global path trail: one fixed, always-visible orientation bar
 * for EVERY authenticated page inside AppShell (same slot above the content,
 * every page — never jumps).
 *
 * Design (Owner decision, Windows-Explorer-like adapted to RTL):
 *  - An explicit, flat route→trail map below (no framework, no nesting
 *    engine — clarity over abstraction; one file to maintain).
 *  - Segments are the map: ancestors are links, the current segment is plain
 *    text (aria-current="page").
 *  - The Back control goes to the PARENT segment of the path model — never an
 *    indiscriminate history.back() — and hides on parent-less pages (the
 *    dashboard root); ChevronRight = "up/back" in RTL, matching the trail's
 *    reading direction (ancestors sit to the right).
 *  - Dynamic labels (subject/lecture) resolve from existing React Query
 *    caches (my-subjects / subject detail / lectures) with a prettified-param
 *    fallback — no extra fetches, no new endpoints (C3: none).
 *  - Mobile: the trail WRAPS (flex-wrap) instead of collapsing into an
 *    ellipsis — every ancestor stays reachable (E: the calmer strategy).
 *
 * The trail complements the Navbar/Sidebar (global destinations) and replaced
 * the per-page breadcrumbs it made redundant (SubjectDetail, LibraryHub).
 */

export interface TrailSegment {
  label: string;
  /** Route for clickable ancestors; absent on the current (leaf) segment. */
  to?: string;
}

interface BuildContext {
  params: Record<string, string | undefined>;
  searchParams: URLSearchParams;
  subjectName: (idOrSlug: string) => string;
  lectureTitle: (subjectId: string, lectureId: string) => string;
}

const STUDY_TAB_LABELS: Record<string, string> = {
  progress: 'تقدمي',
  content: 'المحتوى',
  library: 'المكتبة',
  bank: 'بنك الأسئلة',
  courses: 'الكورسات',
};

/** The explicit route→trail map. FIRST match wins — order longer/specific
 * patterns before their prefixes. Each rule returns the FULL segment list,
 * leaf last. Keep this list aligned with router.tsx. */
const TRAIL_RULES: ReadonlyArray<{
  pattern: string;
  build: (ctx: BuildContext) => TrailSegment[];
}> = [
  {
    pattern: '/dashboard',
    build: () => [{ label: 'الرئيسية' }],
  },
  {
    pattern: '/study',
    build: ({ searchParams, subjectName }) => {
      const segments: TrailSegment[] = [{ label: 'الرئيسية', to: '/dashboard' }];
      const tab = searchParams.get('tab');
      const courseId = searchParams.get('courseId');
      const subjectId = searchParams.get('subjectId');
      // The hub root is the parent of everything below it — link it as soon
      // as any tab/course/subject context deepens the trail.
      const hubIsParent = !!tab || !!courseId;
      segments.push(hubIsParent ? { label: 'دراستي', to: '/study' } : { label: 'دراستي' });
      if (tab && STUDY_TAB_LABELS[tab]) {
        segments.push(courseId
          ? { label: STUDY_TAB_LABELS[tab], to: `/study?tab=${tab}` }
          : { label: STUDY_TAB_LABELS[tab] });
      }
      if (courseId) {
        segments.push({ label: 'حزمة الأسئلة' });
      }
      if (subjectId && !courseId) {
        // A subject filter is context, not a page — surface it as the leaf
        // only when no deeper leaf (course bundle) exists.
        segments.push({ label: subjectName(subjectId) });
      }
      return segments;
    },
  },
  {
    pattern: '/subjects/:subjectSlug/library',
    build: ({ params, subjectName }) => [
      { label: 'الرئيسية', to: '/dashboard' },
      { label: 'المواد', to: '/subjects' },
      { label: subjectName(params.subjectSlug!), to: `/subjects/${params.subjectSlug}` },
      { label: 'المكتبة' },
    ],
  },
  {
    pattern: '/subjects/:subjectSlug/lectures/:lectureId/questions',
    build: ({ params, subjectName, lectureTitle }) => [
      { label: 'الرئيسية', to: '/dashboard' },
      { label: 'المواد', to: '/subjects' },
      { label: subjectName(params.subjectSlug!), to: `/subjects/${params.subjectSlug}` },
      { label: lectureTitle(params.subjectSlug!, params.lectureId!), to: `/subjects/${params.subjectSlug}/lectures/${params.lectureId}` },
      { label: 'الأسئلة' },
    ],
  },
  {
    pattern: '/subjects/:subjectSlug/lectures/:lectureId',
    build: ({ params, subjectName, lectureTitle }) => [
      { label: 'الرئيسية', to: '/dashboard' },
      { label: 'المواد', to: '/subjects' },
      { label: subjectName(params.subjectSlug!), to: `/subjects/${params.subjectSlug}` },
      { label: lectureTitle(params.subjectSlug!, params.lectureId!) },
    ],
  },
  {
    pattern: '/subjects/:subjectSlug/questions/:questionId',
    build: ({ params, subjectName }) => [
      { label: 'الرئيسية', to: '/dashboard' },
      { label: 'المواد', to: '/subjects' },
      { label: subjectName(params.subjectSlug!), to: `/subjects/${params.subjectSlug}` },
      { label: 'سؤال' },
    ],
  },
  {
    pattern: '/subjects/:subjectSlug',
    build: ({ params, subjectName }) => [
      { label: 'الرئيسية', to: '/dashboard' },
      { label: 'المواد', to: '/subjects' },
      { label: subjectName(params.subjectSlug!) },
    ],
  },
  {
    pattern: '/subjects',
    build: () => [
      { label: 'الرئيسية', to: '/dashboard' },
      { label: 'المواد' },
    ],
  },
  {
    pattern: '/my-studies/courses/:courseId',
    build: () => [
      { label: 'الرئيسية', to: '/dashboard' },
      { label: 'دراستي', to: '/study' },
      { label: 'الكورسات', to: '/study?tab=courses' },
      { label: 'كورس' },
    ],
  },
  {
    pattern: '/exams/:sessionId/review',
    build: () => [
      { label: 'الرئيسية', to: '/dashboard' },
      { label: 'الاختبارات', to: '/exams' },
      { label: 'مراجعة' },
    ],
  },
  {
    pattern: '/exams/:examId',
    build: () => [
      { label: 'الرئيسية', to: '/dashboard' },
      { label: 'الاختبارات', to: '/exams' },
      { label: 'اختبار' },
    ],
  },
  {
    pattern: '/exams',
    build: ({ searchParams }) => {
      const segments: TrailSegment[] = [
        { label: 'الرئيسية', to: '/dashboard' },
        searchParams.get('subtab') === 'practice'
          ? { label: 'الاختبارات', to: '/exams' }
          : { label: 'الاختبارات' },
      ];
      if (searchParams.get('subtab') === 'practice') segments.push({ label: 'التدريب' });
      return segments;
    },
  },
  {
    pattern: '/practice/exam/:examModelId',
    build: () => [
      { label: 'الرئيسية', to: '/dashboard' },
      { label: 'الاختبارات', to: '/exams' },
      { label: 'التدريب', to: '/exams?subtab=practice' },
      { label: 'جلسة تدريب' },
    ],
  },
  {
    pattern: '/practice/categorized/:subjectId',
    build: ({ params, subjectName }) => [
      { label: 'الرئيسية', to: '/dashboard' },
      { label: 'الاختبارات', to: '/exams' },
      { label: 'التدريب', to: '/exams?subtab=practice' },
      { label: subjectName(params.subjectId!) },
    ],
  },
  {
    pattern: '/favorites',
    build: () => [{ label: 'الرئيسية', to: '/dashboard' }, { label: 'المفضلة' }],
  },
  {
    pattern: '/search',
    build: () => [{ label: 'الرئيسية', to: '/dashboard' }, { label: 'البحث' }],
  },
  {
    pattern: '/profile',
    build: () => [{ label: 'الرئيسية', to: '/dashboard' }, { label: 'الملف الشخصي' }],
  },
  {
    pattern: '/notifications',
    build: () => [{ label: 'الرئيسية', to: '/dashboard' }, { label: 'الإشعارات' }],
  },
  {
    pattern: '/stats',
    build: () => [{ label: 'الرئيسية', to: '/dashboard' }, { label: 'إحصاءاتي' }],
  },
  {
    pattern: '/leaderboard',
    build: () => [{ label: 'الرئيسية', to: '/dashboard' }, { label: 'لوحة الصدارة' }],
  },
  {
    pattern: '/activate-code',
    build: () => [{ label: 'الرئيسية', to: '/dashboard' }, { label: 'تفعيل كود' }],
  },
  {
    pattern: '/settings',
    build: () => [{ label: 'الرئيسية', to: '/dashboard' }, { label: 'الإعدادات' }],
  },
];

/** Fallback for any authenticated route not yet in the map (e.g. a page
 * added in a hurry): still home > current, never a blank bar. */
function fallbackTrail(): TrailSegment[] {
  return [{ label: 'الرئيسية', to: '/dashboard' }, { label: 'الصفحة الحالية' }];
}

function prettifyParam(value: string): string {
  try {
    return decodeURIComponent(value).replaceAll('-', ' ');
  } catch {
    return value;
  }
}

/** Resolve a subject label from existing query caches (no fetch): the
 * entitled list first, then subject-detail caches (both the 3-element keys
 * the subject page writes and the 2-element key LibraryPage writes — GUID
 * deep links from favorites/activation resolve through them), then a
 * prettified param — good enough for orientation, never a network call. */
function makeSubjectNameResolver(queryClient: QueryClient): (idOrSlug: string) => string {
  return (idOrSlug: string) => {
    const entitled = queryClient.getQueryData<{ id: string; slug: string; nameAr: string }[]>(['my-subjects-entitled']);
    const byList = entitled?.find((s) => s.id === idOrSlug || s.slug === idOrSlug);
    if (byList) return byList.nameAr;
    const detail = queryClient.getQueryData<{ nameAr: string }>(['subject', idOrSlug, 'slug'])
      ?? queryClient.getQueryData<{ nameAr: string }>(['subject', idOrSlug, 'id'])
      ?? queryClient.getQueryData<{ nameAr: string }>(['subject', idOrSlug]);
    if (detail?.nameAr) return detail.nameAr;
    return prettifyParam(idOrSlug);
  };
}

function makeLectureTitleResolver(queryClient: QueryClient): (subjectKey: string, lectureId: string) => string {
  return (subjectKey: string, lectureId: string) => {
    // The route param is a slug; the lectures cache is keyed by subject ID —
    // resolve slug → id via the entitled-subjects cache, then try both keys.
    const entitled = queryClient.getQueryData<{ id: string; slug: string }[]>(['my-subjects-entitled']);
    const id = entitled?.find((s) => s.slug === subjectKey)?.id ?? subjectKey;
    const lectures = queryClient.getQueryData<{ id: string; titleAr: string }[]>(['lectures', id])
      ?? queryClient.getQueryData<{ id: string; titleAr: string }[]>(['lectures', subjectKey]);
    const hit = lectures?.find((l) => l.id === lectureId);
    if (hit) return hit.titleAr;
    return 'محاضرة';
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- W17.2 pins the route→trail map next to its single consumer; exporting buildTrail keeps the map unit-testable without rendering the shell (same one-file precedent as MySubjectsSection's shared scope mapping).
export function buildTrail(
  pathname: string,
  search: string,
  queryClient: QueryClient,
): TrailSegment[] {
  const searchParams = new URLSearchParams(search);
  const subjectName = makeSubjectNameResolver(queryClient);
  const lectureTitle = makeLectureTitleResolver(queryClient);
  for (const rule of TRAIL_RULES) {
    const match = matchPath({ path: rule.pattern, end: true }, pathname);
    if (match) {
      const segments = rule.build({
        params: (match.params ?? {}) as Record<string, string | undefined>,
        searchParams,
        subjectName,
        lectureTitle,
      });
      if (segments.length > 0) return segments;
    }
  }
  return fallbackTrail();
}

export function PathTrail() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const trail = buildTrail(location.pathname, location.search, queryClient);
  // The logical parent: the LAST clickable ancestor. The Back control goes
  // there — a deterministic place in the path model, not history.back().
  const parent = [...trail].reverse().find((segment) => segment.to) ?? null;

  return (
    <nav
      aria-label="مسار التنقل"
      data-testid="path-trail"
      className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--c-text-muted)]"
    >
      {parent && (
        <button
          type="button"
          onClick={() => navigate(parent.to!)}
          data-testid="path-trail-back"
          aria-label={`رجوع إلى ${parent.label}`}
          className="press inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 text-xs font-bold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-400)] hover:text-[var(--c-primary-700)]"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">رجوع</span>
        </button>
      )}
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
        {trail.map((segment, index) => {
          const isLeaf = index === trail.length - 1;
          const clickable = !!segment.to && !isLeaf;
          return (
            <li key={`${segment.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-[var(--c-text-faint)]" aria-hidden="true" />}
              {clickable ? (
                <Link
                  to={segment.to!}
                  data-testid={`path-trail-segment-${index}`}
                  className="inline-flex min-h-11 max-w-[10rem] items-center truncate hover:text-[var(--c-primary-700)] hover:underline sm:max-w-none"
                >
                  {segment.label}
                </Link>
              ) : (
                <span
                  aria-current={isLeaf ? 'page' : undefined}
                  data-testid={`path-trail-current-${index}`}
                  className="inline-flex min-h-11 max-w-[10rem] items-center truncate font-semibold text-[var(--c-text)] sm:max-w-none"
                >
                  {segment.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
