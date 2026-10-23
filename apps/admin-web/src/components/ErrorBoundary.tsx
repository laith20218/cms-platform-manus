/**
 * ErrorBoundary — catches uncaught React render errors to prevent the
 * "white screen of death" where the entire admin app goes blank if a
 * single component throws during render.
 *
 * Prints the full error + component stack to the console for debugging,
 * and shows a bilingual fallback UI with a reload button.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Print full diagnostic to console for debugging
    console.error('[ErrorBoundary] Uncaught error:', error);
    console.error('[ErrorBoundary] Error name:', error.name);
    console.error('[ErrorBoundary] Error message:', error.message);
    console.error('[ErrorBoundary] Error stack:', error.stack);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isArabic = document.documentElement.lang === 'ar';
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--cms-bg, #f7f4ec)',
            padding: '2rem',
            fontFamily: 'inherit',
          }}
        >
          <div style={{ maxWidth: 460, textAlign: 'center' }}>
            <div
              style={{
                width: 56,
                height: 56,
                margin: '0 auto 1rem',
                borderRadius: 16,
                background: 'rgba(255,82,82,0.10)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--cms-danger, #ff5252)"
                strokeWidth={2}
                style={{ width: 28, height: 28 }}
              >
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--cms-text, #0b2940)',
                marginBottom: 8,
              }}
            >
              {isArabic ? 'حدث خطأ غير متوقع' : 'An unexpected error occurred'}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: 'var(--cms-text-muted, #6b7280)',
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              {isArabic
                ? 'يرجى تحديث الصفحة. إذا استمرت المشكلة، تواصل مع الدعم الفني.'
                : 'Please refresh the page. If the problem persists, contact support.'}
            </p>
            {this.state.error && (
              <details
                style={{
                  textAlign: 'left',
                  marginBottom: 20,
                  background: 'var(--cms-surface, #fff)',
                  border: '1px solid var(--cms-line, #e5e7eb)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 11,
                  color: 'var(--cms-text-muted, #6b7280)',
                  fontFamily: 'monospace',
                  maxHeight: 120,
                  overflow: 'auto',
                }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  {isArabic ? 'تفاصيل الخطأ' : 'Error details'}
                </summary>
                <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {this.state.error.name}: {this.state.error.message}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 24px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--cms-teal-600, #0d746b)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              }}
            >
              {isArabic ? 'تحديث الصفحة' : 'Reload page'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
