/** Push 11.3 — 6 placeholder cards shown while the list query is loading (aria-busy). */

export function FavoritesSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="جاري تحميل المفضلة"
      data-testid="favorites-skeleton"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex animate-pulse gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 sm:gap-4 sm:p-4"
        >
          <div className="h-24 w-24 shrink-0 rounded-xl bg-[var(--c-bg-hover)] sm:h-28 sm:w-28" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-5 w-16 rounded-full bg-[var(--c-bg-hover)]" />
            <div className="h-4 w-full rounded-md bg-[var(--c-bg-hover)]" />
            <div className="h-4 w-3/4 rounded-md bg-[var(--c-bg-hover)]" />
            <div className="mt-auto h-9 w-28 rounded-xl bg-[var(--c-bg-hover)]" />
          </div>
        </div>
      ))}
      <span className="sr-only">جاري تحميل المفضلة…</span>
    </div>
  );
}
