/**
 * PR-4 — the UNIVERSAL preview dialog.
 *
 * One accessible container (@cms/ui Dialog: focus trap, Escape, scroll lock,
 * focus restore) wrapping the shared student-view renderer
 * (`QuestionPreviewBody`) plus the badge rail (Preview mode · publication
 * status · type · difficulty · tags) and the honest no-mutation footer.
 * Replaces the hand-rolled preview overlays in QuestionsCenter/ExamsCenter.
 */
import { Dialog } from '@cms/ui';
import { Eye } from 'lucide-react';
import { t, localeOf } from '../../lib/dictionary';
import { questionDifficultyLabel, questionTypeLabel } from '../../lib/questionLabels';
import { QuestionPreviewBody } from './QuestionPreviewBody';
import type { PreviewQuestion } from './previewTypes';

export interface UniversalPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: PreviewQuestion | null;
  isArabic: boolean;
  /** Custom title (e.g. the exam name in the exam preview). */
  title?: string;
  testId?: string;
}

function statusBadgeClass(status: string) {
  const value = status.toLowerCase();
  if (value === 'published') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (value === 'archived') return 'text-amber-700 bg-amber-50 border-amber-200';
  if (value === 'review') return 'text-sky-700 bg-sky-50 border-sky-200';
  if (value === 'unpublished') return 'text-slate-600 bg-slate-100 border-slate-300';
  return 'text-slate-600 bg-slate-50 border-slate-200';
}

function typeBadgeClass(type: string) {
  switch (type) {
    case 'Mcq': return 'text-teal-700 bg-teal-50 border-teal-200';
    case 'TrueFalse': return 'text-sky-700 bg-sky-50 border-sky-200';
    case 'MultipleSelect': return 'text-violet-700 bg-violet-50 border-violet-200';
    case 'Essay': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Matching': return 'text-rose-700 bg-rose-50 border-rose-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
}

function difficultyBadgeClass(difficulty: string) {
  switch (difficulty) {
    case 'Easy': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'Medium': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Hard': return 'text-red-700 bg-red-50 border-red-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
}

/** The publication-status label (Draft/Review/Published/Archived + unknown → Draft). */
function publicationLabel(status: string, isArabic: boolean) {
  const value = status.toLowerCase();
  if (value === 'published') return isArabic ? 'منشور' : 'Published';
  if (value === 'archived') return isArabic ? 'مؤرشف' : 'Archived';
  if (value === 'review') return isArabic ? 'مراجعة' : 'Review';
  if (value === 'unpublished') return isArabic ? 'غير منشور' : 'Unpublished';
  return isArabic ? 'مسودة' : 'Draft';
}

export function UniversalPreviewDialog({
  open,
  onOpenChange,
  question,
  isArabic,
  title,
  testId = 'universal-preview-dialog',
}: UniversalPreviewDialogProps) {
  const locale = localeOf(isArabic);
  if (!question) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? t(locale, 'questions.preview.title')}
      dir={isArabic ? 'rtl' : 'ltr'}
      size="lg"
      dismissGuard={false}
      testId={testId}
    >
      <div className="space-y-4" data-testid={`${testId}-content`}>
        {/* Badge rail: preview mode + status + type + difficulty + tags. */}
        <div className="flex items-center gap-2 flex-wrap" data-testid={`${testId}-badges`}>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border border-dashed" style={{ borderColor: 'var(--cms-teal-700)', color: 'var(--cms-teal-700)', background: 'var(--cms-teal-50)' }}>
            <Eye className="w-3 h-3" aria-hidden="true" />
            {t(locale, 'questions.preview.previewBadge')}
          </span>
          {question.status && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${statusBadgeClass(question.status)}`} data-testid={`${testId}-status`}>
              {publicationLabel(question.status, isArabic)}
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${typeBadgeClass(question.type)}`}>
            {questionTypeLabel(question.type, isArabic)}
          </span>
          {question.difficulty && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${difficultyBadgeClass(question.difficulty)}`}>
              {questionDifficultyLabel(question.difficulty, isArabic)}
            </span>
          )}
          {(question.tags ?? []).map(tag => (
            <span key={tag} className="inline-block px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--cms-ivory-200)', color: 'var(--cms-text-muted)' }}>
              #{tag}
            </span>
          ))}
        </div>

        {/* The student-view simulation — zero API interaction. */}
        <QuestionPreviewBody question={question} isArabic={isArabic} testIdPrefix={`${testId}-q`} />

        {/* Honest no-mutation footer. */}
        <p className="text-xs pt-2 border-t" style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-muted)' }} data-testid={`${testId}-notice`}>
          {t(locale, 'questions.preview.previewNotice')}
        </p>
      </div>
    </Dialog>
  );
}
