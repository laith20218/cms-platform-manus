import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ClipboardCheck, GraduationCap } from 'lucide-react';
import { ExamsCatalogPage } from '@/features/exams/pages/ExamsCatalogPage';
import { PracticeCatalog } from '@/features/my-studies/components/PracticeCatalog';

/**
 * /study → «الاختبارات» tab (Wave 15.4.3, Q3=A): hosts two sub-tabs —
 * «الاختبارات» (default, the existing ExamsCatalogPage) and «التدريب»
 * (the existing PracticeCatalog, reused as-is). The ?subtab= param lives
 * here, not in StudyPage: ?tab=exams stays a single top-level tab.
 */
type SubTab = 'exams' | 'practice';

const SUB_TABS = [
  { key: 'exams' as const, label: 'الاختبارات', icon: ClipboardCheck },
  { key: 'practice' as const, label: 'التدريب', icon: GraduationCap },
];

export function ExamsTab({ subjectId }: { subjectId: string | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSub = searchParams.get('subtab');
  const subtab: SubTab = rawSub === 'practice' ? 'practice' : 'exams';

  const switchSubtab = (next: SubTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'exams') {
      params.delete('subtab');
    } else {
      params.set('subtab', next);
    }
    setSearchParams(params, { replace: true });
  };

  return (
    <section data-testid="study-exams-tab" className="space-y-4">
      <div
        role="tablist"
        aria-label="أقسام الاختبارات"
        className="inline-flex gap-1 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1"
      >
        {SUB_TABS.map((t) => {
          const active = subtab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={active}
              data-testid={`study-exams-subtab-${t.key}`}
              onClick={() => switchSubtab(t.key)}
              className="relative px-4 py-2 text-sm font-medium whitespace-nowrap text-[var(--c-text-soft)] transition-colors"
            >
              {active && (
                <motion.span
                  layoutId="study-exams-subtab-pill"
                  className="absolute inset-0 rounded-xl bg-[var(--c-primary-700)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className={`relative z-[1] inline-flex items-center gap-1.5 ${active ? 'text-white' : ''}`}>
                <t.icon className="h-4 w-4" />
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" data-testid={`study-exams-panel-${subtab}`}>
        {subtab === 'exams' ? (
          <ExamsCatalogPage subjectId={subjectId} />
        ) : (
          <PracticeCatalog subjectId={subjectId} />
        )}
      </div>
    </section>
  );
}
