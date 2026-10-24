import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  /** What went wrong — shown to the user above the generic message. */
  title?: string;
  /** Optional retry label (defaults to إعادة المحاولة). */
  retryLabel?: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  /** Incremented on retry → remounts children (a fresh attempt). */
  attempt: number;
}

/**
 * Route/panel error boundary (Push 8): one failing surface (an API blow-up,
 * a render crash inside a tab panel) must never blank the whole app. Renders
 * a calm Arabic error card with a Retry button that remounts the subtree.
 *
 * Deliberately NOT using window.alert — an inline card with a real button.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in the console for developers; the user sees the calm card.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private retry = () => {
    this.setState((prev) => ({ hasError: false, attempt: prev.attempt + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          data-testid="error-boundary"
          className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] px-8 py-14 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--c-danger-50)]">
            <AlertTriangle className="h-8 w-8 text-[var(--c-danger-500)]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[var(--c-text)]">
              {this.props.title ?? 'حدث خطأ غير متوقع'}
            </h3>
            <p className="text-sm text-[var(--c-text-muted)]">
              لم نتمكن من تحميل هذا القسم. تحقّق من اتصالك ثم أعد المحاولة.
            </p>
          </div>
          <button
            type="button"
            onClick={this.retry}
            data-testid="error-boundary-retry"
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.97]"
            style={{ background: 'var(--c-primary-700)' }}
          >
            <RotateCcw className="h-4 w-4" />
            {this.props.retryLabel ?? 'إعادة المحاولة'}
          </button>
        </div>
      );
    }

    return <div className="contents" key={this.state.attempt}>{this.props.children}</div>;
  }
}
