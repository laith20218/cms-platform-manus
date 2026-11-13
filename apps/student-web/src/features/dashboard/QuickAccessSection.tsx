import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ClipboardCheck, MonitorPlay } from 'lucide-react';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { cn } from '@/utils';

/**
 * QuickAccessSection — Wave 15.2 (D2): «وصول سريع».
 *
 * Three tiles (library / courses / exams — the «المواد» tile was dropped as
 * redundant with the sidebar) deep-linking into the My Studies hub tabs,
 * plus one filter chip per entitled subject — the same ['my-subjects-entitled']
 * cache «موادي» reads. Selecting a chip scopes every tile to that subject via
 * the hub's shared ?subjectId= filter param; «الكل» clears it. The whole
 * section hides when the student has no entitled subjects.
 */
const TILES = [
  { key: 'library', label: 'المكتبة', tab: 'library', icon: BookOpen },
  { key: 'courses', label: 'الكورسات', tab: 'courses', icon: MonitorPlay },
  { key: 'exams', label: 'بنك الأسئلة', tab: 'exams', icon: ClipboardCheck },
] as const;

/** Active/inactive chip states — 'chip-active' is a marker class for consumers. */
const activeCls = 'chip-active bg-[var(--c-primary-700)] text-white';
const inactiveCls =
  'bg-[var(--c-bg-hover)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)]';

export function QuickAccessSection() {
  const mySubjects = useMySubjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tileHref = (tab: string) =>
    selectedId ? `/my-studies?subjectId=${selectedId}&tab=${tab}` : `/my-studies?tab=${tab}`;

  if (mySubjects.isLoading) {
    return (
      <section>
        <div className="mb-3 h-6 w-24 rounded-lg animate-pulse bg-[var(--c-bg-hover)]" />
        <div className="mb-3 flex gap-1.5">
          <div className="h-7 w-14 rounded-full animate-pulse bg-[var(--c-bg-hover)]" />
          <div className="h-7 w-14 rounded-full animate-pulse bg-[var(--c-bg-hover)]" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="h-24 rounded-2xl animate-pulse bg-[var(--c-bg-hover)]" />
          <div className="h-24 rounded-2xl animate-pulse bg-[var(--c-bg-hover)]" />
          <div className="h-24 rounded-2xl animate-pulse bg-[var(--c-bg-hover)]" />
        </div>
      </section>
    );
  }

  if (!mySubjects.data || mySubjects.data.length === 0) return null;

  return (
    <section data-testid="quick-access-section">
      <h2 className="text-lg font-bold text-[var(--c-text)] mb-3">وصول سريع</h2>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          type="button"
          data-testid="quick-access-chip-all"
          onClick={() => setSelectedId(null)}
          className={cn(
            'press rounded-full px-3 py-1 text-xs font-medium transition-colors',
            selectedId === null ? activeCls : inactiveCls,
          )}
        >الكل</button>
        {mySubjects.data.map((s) => (
          <button
            key={s.id}
            type="button"
            data-testid={`quick-access-chip-${s.id}`}
            onClick={() => setSelectedId(s.id)}
            className={cn(
              'press rounded-full px-3 py-1 text-xs font-medium transition-colors',
              selectedId === s.id ? activeCls : inactiveCls,
            )}
          >{s.nameAr}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {TILES.map((t) => (
          <Link
            key={t.key}
            to={tileHref(t.tab)}
            data-testid={`quick-access-tile-${t.key}`}
            className="press flex flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 text-center transition-colors hover:border-[var(--c-primary-400)] hover:bg-[var(--c-bg-hover)]"
          >
            <t.icon className="h-6 w-6 text-[var(--c-primary-700)]" />
            <span className="text-sm font-semibold text-[var(--c-text)]">{t.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
