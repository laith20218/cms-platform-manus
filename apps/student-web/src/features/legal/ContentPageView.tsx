import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, ChevronRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
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
/**
 * D-15 (Wave 18.6) — minimal PUBLIC chrome for the legal pages: brand mark +
 * a way back home (guests land on /login via the protected-route bounce,
 * authed students on /dashboard). No content API changes.
 */
function LegalPageChrome() {
  return (
    <header className="mb-8 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-sm"
          style={{ background: 'var(--grad-primary)' }}
          aria-hidden="true"
        >
          <BookOpenCheck className="h-5 w-5" />
        </span>
        <span className="text-sm font-extrabold text-[var(--c-text)]">
          CMS <span className="font-semibold text-[var(--c-text-muted)]">— المنصة الطبية التعليمية</span>
        </span>
      </div>
      {/* Wave C — the official home of the authenticated app is /dashboard;
          linking / added a pointless redirect hop (and a second bounce to
          /login for guests). Direct target, same label. */}
      <Link
        to="/dashboard"
        data-testid="legal-back-home"
        className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-3.5 text-xs font-bold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-300)] hover:text-[var(--c-primary-700)]"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
        العودة للرئيسية
      </Link>
    </header>
  );
}

export function ContentPageView({ slug, fallbackTitle }: { slug: string; fallbackTitle: string }) {
  const page = useQuery({
    queryKey: ['content-page', slug],
    queryFn: () => getContentPage(slug),
    staleTime: 10 * 60_000,
    retry: 1,
  });

  if (page.isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8" data-testid={`content-page-${slug}-loading-wrap`}>
        <LegalPageChrome />
        <div className="flex justify-center py-20" data-testid={`content-page-${slug}-loading`}>
          <Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" />
        </div>
      </div>
    );
  }

  if (page.isError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <LegalPageChrome />
        <div
          role="alert"
          data-testid={`content-page-${slug}-error`}
          className="mx-auto max-w-2xl rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"
        >
        <h1 className="text-lg font-bold text-[var(--c-text)]">تعذّر تحميل الصفحة</h1>
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
      </div>
    );
  }

  const data = page.data;
  const updatedAtLabel = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <LegalPageChrome />
      <article data-testid={`content-page-${slug}`}>
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
    </div>
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
