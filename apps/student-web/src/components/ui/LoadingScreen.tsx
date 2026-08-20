export function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--c-bg)]">
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center animate-pulse"
          style={{ background: 'var(--grad-primary)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
            <path d="M12 2L3 7v6c0 5 3.5 9 9 11 5.5-2 9-6 9-11V7l-9-5z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>
        <div className="w-8 h-8 border-3 border-[var(--c-primary-200)] border-t-[var(--c-primary-700)] rounded-full animate-spin" />
        <p className="text-sm text-[var(--c-text-muted)] font-medium">جاري التحميل...</p>
      </div>
    </div>
  );
}
