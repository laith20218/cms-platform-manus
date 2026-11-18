import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { getContentPage } from './content-api';
import { ApiErrorDetail } from '@/components/common/ApiErrorDetail';

/**
 * Wave 16.5 — the shared admin-managed content page view (Terms / Privacy /
 * Contact). Replaces the hardcoded components: content comes from
 * GET /content/{slug} (anonymous), rendered with a markdown-lite convention —
 * blank-line separated paragraphs, «## » prefix = section heading.
 *
 * Error hardening (W16.5): a failed load shows an Arabic card with the
 * backend's `detail` when present (ApiErrorDetail) and a retry button — never
 * raw axios/status text.
 */
export function ContentPageView({ slug, fallbackTitle }: { slug: string; fallbackTitle: string }) {
  const page = useQuery({
    queryKey: ['content-page', slug],
    queryFn: () => getContentPage(slug),
    staleTime: 10 * 60_000,
    retry: 1,
  });

  if (page.isLoading) {
    return (
      <div className="flex justify-center py-20" data-testid={`content-page-${slug}-loading`}>
        <Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" />
      </div>
    );
  }

  if (page.isError) {
    return (
      <div
        role="alert"
        data-testid={`content-page-${slug}-error`}
        className="mx-auto max-w-2xl rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"
      >
        <h1 className="text-lg font-bold text-[var(--c-text)]">تعذر تحميل الصفحة</h1>
        <p className="mt-1 text-sm text-[var(--c-text-muted)]">
          تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.
        </p>
        <ApiErrorDetail error={page.error} />
        <button
          type="button"
          onClick={() => page.refetch()}
          className="press mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const data = page.data;
  const updatedAtLabel = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <article className="max-w-3xl mx-auto py-8" data-testid={`content-page-${slug}`}>
      <h1 className="text-2xl font-bold text-[var(--c-text)] mb-2">
        {data?.titleAr || fallbackTitle}
      </h1>
      {updatedAtLabel && (
        <p className="text-xs text-[var(--c-text-faint)] mb-6">آخر تحديث: {updatedAtLabel}</p>
      )}
      <div className="prose prose-sm max-w-none text-[var(--c-text-soft)] space-y-4">
        {renderBody(data?.bodyAr ?? '')}
      </div>
    </article>
  );
}

/**
 * Markdown-lite renderer. Blocks are separated by blank lines. A block whose
 * FIRST line starts with «## » renders that line as a section heading; the
 * remaining lines of the block (if any) render as its paragraph — so both
 * «## عنوان» alone and the natural «## عنوان\nالنص…» shape work.
 */
function renderBody(body: string) {
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return <p className="text-[var(--c-text-muted)]">لا يوجد محتوى بعد لهذه الصفحة.</p>;
  }

  return blocks.map((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines[0]?.startsWith('## ')) {
      const heading = lines[0].slice(3).trim();
      const paragraph = lines.slice(1).join(' ');
      return (
        <section key={index} className="space-y-2">
          <h2 className="text-lg font-semibold text-[var(--c-text)]">{heading}</h2>
          {paragraph && <p>{paragraph}</p>}
        </section>
      );
    }
    return <p key={index}>{block}</p>;
  });
}
