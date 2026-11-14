import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, BookOpen, ChevronLeft, Clock3,
} from 'lucide-react';
import type { SubjectSummary } from './services/academic-api';
import { useSubjectModal } from './SubjectModalContext';

/**
 * A subject card: entitled cards route into the subject-filtered My Studies
 * hub; unentitled cards open the activation dialog in place — never a dead
 * "locked" page.
 *
 * W15.3.1b — extracted verbatim from SubjectsPage.tsx (was the inline
 * SubjectCard at lines 661-801) so the 15.3.2 cascade rework can compose it
 * below CascadeFilters.
 *
 * W15.3.4 — the two secondary action surfaces (mobile "…" trigger + desktop
 * quick-actions row) are consolidated into ONE prominent «فتح» button
 * (subject-card-action, entitled only) opening the shared scope-gated
 * SubjectModal — the same sheet MuwadiCard opens. The primary header click
 * (subject-card-open → /my-studies or the activation dialog) is unchanged.
 */
export interface SubjectCardProps {
  subject: SubjectSummary;
  index: number;
  entitled: boolean;
  onLocked: (subject: { id: string; nameAr: string }) => void;
}

export function SubjectCard({ subject, index, entitled, onLocked }: SubjectCardProps) {
  const navigate = useNavigate();
  const { openSubjectModal } = useSubjectModal();
  const scopes = subject.contentScopes ?? [];
  const canQuestions = scopes.includes('QuestionsExams');
  const canLectures = scopes.includes('LecturesText');
  const canVideoAudio = scopes.includes('VideoAudio');
  const hasLibrary = canLectures || canVideoAudio;

  // Entitled cards land on the tab their grant actually covers.
  const preferredTab = canQuestions ? 'exams' : canVideoAudio ? 'courses' : 'exams';

  const openSubject = () => {
    if (entitled) {
      navigate(`/my-studies?subjectId=${subject.id}&tab=${preferredTab}`);
    } else {
      onLocked({ id: subject.id, nameAr: subject.nameAr });
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.05, 0.4) }}>
      <div
        className="flex h-full flex-col rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 transition-all hover:border-[var(--c-primary-300)] hover:shadow-lg"
        data-testid="subject-card"
      >
        <div className="mb-3 flex items-start gap-1">
          <button type="button" onClick={openSubject} className="group block min-w-0 flex-1 text-right" data-testid="subject-card-open" aria-label={`فتح مادة ${subject.nameAr}`}>
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
                style={{ background: subject.color || 'var(--c-primary-700)' }}
              >
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-bold text-[var(--c-text)] transition-colors group-hover:text-[var(--c-primary-700)]">{subject.nameAr}</span>
                  {!entitled && (
                    <span className="shrink-0 rounded-full bg-[var(--c-bg-hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--c-text-faint)]" data-testid="subject-card-locked-badge">
                      مقفلة
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-[var(--c-text-muted)]" lang="en">{subject.totalQuestions} سؤال • {subject.totalLectures} محاضرة</div>
              </div>
              <ArrowLeft className="h-4 w-4 shrink-0 text-[var(--c-text-faint)] transition-all group-hover:-translate-x-0.5 group-hover:text-[var(--c-primary-700)]" />
            </div>
          </button>
        </div>

        {subject.userProgress && (
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-[var(--c-text-muted)]">التقدّم</span>
              <span className="font-semibold text-[var(--c-primary-700)]" lang="en">{subject.userProgress.completedPercentage.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--c-bg)]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'var(--c-primary-600)' }}
                initial={{ width: 0 }}
                animate={{ width: `${subject.userProgress.completedPercentage}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* W15.3.4 — the consolidated action surface: entitled-only «فتح»
            opening the shared scope-gated SubjectModal. */}
        {entitled && (
          <button
            type="button"
            data-testid="subject-card-action"
            onClick={(e) => {
              e.stopPropagation();
              openSubjectModal({
                id: subject.id,
                slug: subject.slug,
                nameAr: subject.nameAr,
                scope: {
                  content: true,
                  exams: canQuestions,
                  library: hasLibrary,
                  courses: canVideoAudio,
                },
              });
            }}
            aria-label={`فتح مادة ${subject.nameAr}`}
            className="press mt-4 inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--c-primary-700)] px-4 text-sm font-bold text-white transition-colors hover:bg-[var(--c-primary-800)]"
          >
            فتح
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {subject.lastContentUpdatedAt && (
          <div className="mt-2.5 flex items-center gap-1 text-[11px] text-[var(--c-text-faint)]">
            <Clock3 className="h-3 w-3" /> آخر تحديث {new Date(subject.lastContentUpdatedAt).toLocaleDateString('ar-SY')}
          </div>
        )}
      </div>
    </motion.div>
  );
}
