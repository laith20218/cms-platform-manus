import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { hasNativeShell } from '@/utils/native-bridge';
import {
  isNativePackagesSurfaceActive,
  nativeDownloadOfflinePackage,
  nativePackageDownloadToast,
} from '@/utils/native-packages';
import {
  isNativeCoursesSurfaceActive,
  nativeEnsureCourseEpisodeLocal,
  nativeCourseDownloadToast,
} from '@/utils/native-courses';
import { readSession } from '@/services/session-store';

/**
 * Wave 1 (UX 1D) — the shared contextual «تحميل دون اتصال» CTA used by the
 * exam page, the subject page and the course player.
 *
 * Honesty contract:
 *  - INVISIBLE in a plain browser (no native shell → render nothing): zero
 *    noise outside the Android shell.
 *  - Inside an OLDER shell (bridge surface absent): an honest Arabic toast
 *    explaining the app needs an update — never a silent no-op.
 *  - Inside a shell WITH the surface: start the download through the wrapper
 *    and toast the result (started / already-saved / deny message). No
 *    polling loops in W1 — progress is checked via the offline panel refresh.
 */

export type OfflineDownloadCtaProps =
  | {
      /** Question-package download (Wave 2 surface). */
      kind: 'package';
      testId: string;
      /** Subject scope — present on the subject-page CTA. */
      subjectId?: string;
      /** Exam scope — the exam-page CTA only knows the exam id (the ExamSession
       *  DTO carries no subject identifier), so it passes examId alone. */
      examId?: string;
      title?: string;
      /** Visible label ('button' variant) / accessible name ('icon' variant). */
      label?: string;
      variant?: 'button' | 'icon';
    }
  | {
      /** Hosted course-episode download (Wave 5 surface). */
      kind: 'episode';
      testId: string;
      episodeId: string;
      courseId?: string;
      /** Subject scope of the course — REQUIRED by the native entitlement
       *  issuance for course episodes (CourseDetail.subjectId); the page
       *  threads it from the course it already loads. */
      subjectId?: string;
      title?: string;
      assetType?: string;
      label?: string;
      variant?: 'button' | 'icon';
    };

const DEFAULT_LABEL = 'تحميل دون اتصال';

export function OfflineDownloadCta(props: OfflineDownloadCtaProps) {
  // Zero chrome outside the Android shell (W1 honesty contract).
  if (!hasNativeShell()) return null;

  const label = props.label ?? DEFAULT_LABEL;
  const variant = props.variant ?? 'button';

  const handleClick = () => {
    if (props.kind === 'package') {
      if (!isNativePackagesSurfaceActive()) {
        toast.message('تحميل الحزم دون اتصال يتوفر بعد تحديث التطبيق.');
        return;
      }
      // The web session token rides the request so the native side can call
      // the package-build API once; readSession returns null when logged out
      // and the native side answers denied_native_session.
      const session = readSession();
      const code = nativeDownloadOfflinePackage({
        subjectId: props.subjectId,
        examId: props.examId,
        title: props.title,
        accessToken: session?.accessToken,
      });
      const copy = nativePackageDownloadToast(code);
      if (copy.kind === 'error') toast.error(copy.message);
      else toast.message(copy.message);
      return;
    }
    if (!isNativeCoursesSurfaceActive()) {
      toast.message('تحميل حلقات الكورس دون اتصال يتوفر بعد تحديث التطبيق.');
      return;
    }
    const code = nativeEnsureCourseEpisodeLocal({
      episodeId: props.episodeId,
      courseId: props.courseId,
      subjectId: props.subjectId,
      title: props.title,
      assetType: props.assetType,
    });
    const copy = nativeCourseDownloadToast(code);
    if (copy.kind === 'error') toast.error(copy.message);
    else toast.message(copy.message);
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        title={label}
        data-testid={props.testId}
        className="press self-center w-9 h-9 shrink-0 me-2 rounded-[10px] flex items-center justify-center text-[var(--c-text-faint)] hover:text-[var(--c-primary-700)] hover:bg-[var(--c-primary-50)] transition-colors"
      >
        <Download className="w-[18px] h-[18px]" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid={props.testId}
      className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--c-primary-200)] bg-[var(--c-primary-50)] px-3.5 text-xs font-bold text-[var(--c-primary-700)] transition-colors hover:bg-[var(--c-primary-100)]"
    >
      <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}
