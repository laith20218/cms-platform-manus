import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookMarked, Loader2, Sparkles, Tag } from 'lucide-react';
import { cn } from '@/utils';
import { CenteredDialog } from '@/components/ui/Overlays';
import { practiceApi } from '@/features/practice/services/practice-api';
import { questionApi } from '@/features/questions/services/question-api';
import { isEntitlementDenied } from '@/features/my-studies/services/courses-api';
import { getApiErrorMessage } from '@/utils/api-error';

/**
 * W16.2b Phase 2 — "بناء اختبار تدريبي": the random-draw training builder.
 *
 * Inputs: N (1–100, number input + quick chips), an optional multi-select of the
 * subject's lectures (the categorized tree's Lecture nodes — reusing its cached
 * query), and an optional paragraph-tag chip (tree's tags — blank = all). Submit
 * draws N questions from GET /api/v1/questions/random (16.2a C3-1) and starts the
 * session by navigating to the practice player with the EXACT-ID lens
 * (?questionIds=…): the player's idempotent categorized start (16.2b C3
 * exception) pins the session to exactly the drawn set — verified server-side
 * (the lens is echoed and re-verified on every answer/progress call).
 *
 * URL (not state) carries the draw so a refresh deep-links straight back into
 * the same session — the player's existing contract.
 */

const COUNT_MIN = 1;
const COUNT_MAX = 100;
const QUICK_COUNTS = [5, 10, 20, 50];

interface TrainingBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  subjectName: string | null;
}

export function TrainingBuilderModal({ open, onOpenChange, subjectId, subjectName }: TrainingBuilderModalProps) {
  const navigate = useNavigate();
  const [count, setCount] = useState(10);
  const [selectedLectureIds, setSelectedLectureIds] = useState<string[]>([]);
  const [tag, setTag] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');

  // The categorized tree powers BOTH the lecture multi-select and the tag chips —
  // same query key the catalog's lens uses, so an already-browsed subject is cached.
  const treeQuery = useQuery({
    queryKey: ['practice-categorized-tree', subjectId],
    queryFn: () => practiceApi.getCategorizedTree(subjectId!),
    enabled: open && !!subjectId,
  });

  const lectures = useMemo(
    () => (treeQuery.data?.lectures ?? []).filter((lecture) => !!lecture.lectureId),
    [treeQuery.data]
  );
  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const lecture of treeQuery.data?.lectures ?? []) {
      for (const group of lecture.groups) {
        if (group.paragraphTag) set.add(group.paragraphTag);
      }
    }
    return Array.from(set);
  }, [treeQuery.data]);

  const toggleLecture = (id: string) => {
    setSelectedLectureIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    );
  };
  const allLecturesSelected = lectures.length > 0 && selectedLectureIds.length === lectures.length;
  const toggleAllLectures = () => {
    setSelectedLectureIds(allLecturesSelected ? [] : lectures.map((lecture) => lecture.lectureId!));
  };

  const clampCount = (value: number) => Math.min(COUNT_MAX, Math.max(COUNT_MIN, Number.isFinite(value) ? value : COUNT_MIN));

  const build = async () => {
    if (building) return;
    setError('');
    const safeCount = clampCount(count);
    if (safeCount < COUNT_MIN) {
      setError('أدخل عدد الأسئلة (1 على الأقل).');
      return;
    }
    setBuilding(true);
    try {
      // C3-1 draw — entitlement-scoped (X-Entitlement), narrowings optional.
      const drawn = await questionApi.getRandom({
        subjectId,
        count: safeCount,
        lectureIds: selectedLectureIds.length > 0 ? selectedLectureIds : undefined,
        paragraphTags: tag ? [tag] : undefined,
      });
      if (drawn.length === 0) {
        setError('لا توجد أسئلة مطابقة للفلاتر المحددة — جرّب توسيع الاختيار.');
        return;
      }
      // Start the session with EXACTLY the drawn set: the player's categorized
      // start accepts the C3 questionIds lens (16.2b) — the URL carries the draw
      // so the deep link re-opens the same session.
      const questionIds = drawn.map((question) => question.id).join(',');
      navigate(`/practice/categorized/${subjectId}?questionIds=${questionIds}`);
    } catch (err) {
      // W16.6 — prefer the backend's Arabic ProblemDetails `detail`; the raw
      // JS/axios message never reaches the student anymore.
      setError(
        isEntitlementDenied(err)
          ? 'اشتراكك لا يغطي بنك أسئلة هذه المادة — فعّل كوداً يشملها ثم أعد المحاولة.'
          : getApiErrorMessage(err, 'تعذّر بناء الاختبار التدريبي. تحقق من اتصالك وأعد المحاولة.')
      );
    } finally {
      setBuilding(false);
    }
  };

  return (
    <CenteredDialog
      open={open}
      onOpenChange={(next) => {
        if (!building) onOpenChange(next);
      }}
      title="بناء اختبار تدريبي"
      description={subjectName ? `اسحب أسئلة عشوائية من بنك مادة ${subjectName} وابدأ جلسة تدريب فورية` : 'اسحب أسئلة عشوائية من بنك المادة وابدأ جلسة تدريب فورية'}
      widthClass="max-w-lg"
      testId="training-builder-modal"
    >
      <div className="flex flex-col gap-5">
        {/* N — number input + quick chips */}
        <section aria-label="عدد الأسئلة">
          <label htmlFor="training-count-input" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--c-text)]">
            <Sparkles className="h-4 w-4 text-[var(--c-primary-700)]" aria-hidden="true" />
            عدد الأسئلة
            <span className="text-xs font-medium text-[var(--c-text-muted)]" lang="en">({COUNT_MIN}–{COUNT_MAX})</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="training-count-input"
              type="number"
              inputMode="numeric"
              min={COUNT_MIN}
              max={COUNT_MAX}
              value={count}
              disabled={building}
              onChange={(event) => setCount(clampCount(Number(event.target.value)))}
              data-testid="training-count-input"
              className="press inline-flex min-h-11 w-24 items-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-3 text-sm font-bold text-[var(--c-text)] outline-none transition-colors focus-visible:border-[var(--c-primary-600)]"
            />
            {QUICK_COUNTS.map((quick) => (
              <button
                key={quick}
                type="button"
                aria-pressed={count === quick}
                disabled={building}
                onClick={() => setCount(quick)}
                data-testid={`training-count-chip-${quick}`}
                className={cn(
                  'press inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold transition-colors',
                  count === quick
                    ? 'border-[var(--c-primary-600)] bg-[var(--c-primary-50)] text-[var(--c-primary-800)]'
                    : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-soft)] hover:border-[var(--c-primary-500)]'
                )}
              >
                <span lang="en">{quick}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Lectures multi-select */}
        <section aria-label="المحاضرات">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--c-text)]">
              <BookMarked className="h-4 w-4 text-[var(--c-primary-700)]" aria-hidden="true" />
              المحاضرات
              <span className="text-xs font-medium text-[var(--c-text-muted)]">— اتركها فارغة لتشمل كل أسئلة المادة</span>
            </span>
            {lectures.length > 0 && (
              <button
                type="button"
                onClick={toggleAllLectures}
                disabled={building}
                aria-pressed={allLecturesSelected}
                data-testid="training-lectures-all"
                className="press inline-flex min-h-9 items-center rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 text-xs font-semibold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-500)]"
              >
                {allLecturesSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
              </button>
            )}
          </div>
          {treeQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 text-sm text-[var(--c-text-muted)]" data-testid="training-lectures-loading">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              جارٍ تحميل محاضرات المادة…
            </div>
          ) : lectures.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] px-4 py-3 text-sm text-[var(--c-text-muted)]" data-testid="training-lectures-empty">
              لا توجد محاضرات مصنّفة بعد — سيشمل الاختبار كل أسئلة المادة القابلة للتدريب.
            </p>
          ) : (
            <ul className="max-h-44 overflow-y-auto rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)]" data-testid="training-lectures-list">
              {lectures.map((lecture) => {
                const checked = selectedLectureIds.includes(lecture.lectureId!);
                return (
                  <li key={lecture.lectureId} className="border-b border-[var(--c-border)] last:border-b-0">
                    <label className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-[var(--c-bg-hover)]">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={building}
                          onChange={() => toggleLecture(lecture.lectureId!)}
                          data-testid={`training-lecture-${lecture.lectureId}`}
                          className="h-4.5 w-4.5 shrink-0 accent-[var(--c-primary-700)]"
                        />
                        <span className="truncate font-semibold text-[var(--c-text)]">{lecture.lectureTitle}</span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--c-text-muted)]" lang="en">{lecture.questionsCount} سؤالاً</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Paragraph tag — optional chip row (blank = all) */}
        {tags.length > 0 && (
          <section aria-label="وسم الفقرة">
            <span className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--c-text)]">
              <Tag className="h-4 w-4 text-[var(--c-primary-700)]" aria-hidden="true" />
              وسم الفقرة
              <span className="text-xs font-medium text-[var(--c-text-muted)]">— اتركه على «الكل» لتشمل كل الأوسمة</span>
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={tag === null}
                disabled={building}
                onClick={() => setTag(null)}
                data-testid="training-tag-all"
                className={cn(
                  'press inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold transition-colors',
                  tag === null
                    ? 'border-[var(--c-primary-600)] bg-[var(--c-primary-50)] text-[var(--c-primary-800)]'
                    : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-soft)] hover:border-[var(--c-primary-500)]'
                )}
              >
                الكل
              </button>
              {tags.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={tag === item}
                  disabled={building}
                  onClick={() => setTag(item)}
                  data-testid={`training-tag-${item}`}
                  className={cn(
                    'press inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold transition-colors',
                    tag === item
                      ? 'border-[var(--c-primary-600)] bg-[var(--c-primary-50)] text-[var(--c-primary-800)]'
                      : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-soft)] hover:border-[var(--c-primary-500)]'
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        )}

        {error && (
          <p
            role="alert"
            data-testid="training-error"
            className="rounded-2xl border border-[var(--c-danger-200,rgba(220,38,38,0.25))] bg-[var(--c-danger-50,rgba(254,226,226,0.6))] px-4 py-3 text-sm font-semibold text-[var(--c-danger-700,#b91c1c)]"
          >
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={building}
            data-testid="training-cancel"
            className="press inline-flex min-h-11 items-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 text-sm font-semibold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-500)] disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void build()}
            disabled={building || !subjectId}
            data-testid="training-submit"
            className="btn-primary press inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {building ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                جارٍ السحب…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                ابدأ التدريب
              </>
            )}
          </button>
        </div>
      </div>
    </CenteredDialog>
  );
}
