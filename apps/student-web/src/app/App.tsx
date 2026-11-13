import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ThemeProvider } from './providers/ThemeProvider';
import { AuthProvider } from './providers/AuthProvider';
import { AppRoutes } from './router';
import { SubjectModalProvider } from '@/features/subjects/SubjectModalContext';
import { SubjectModal } from '@/features/subjects/SubjectModal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes
      gcTime: 30 * 60 * 1000,           // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <SubjectModalProvider>
              <AppRoutes />
              {/* Global subject-actions sheet (Wave 14.3 PR #1) — mounted as a
                  sibling of the routes, mirroring <Toaster>, so it overlays
                  every page. It consumes the router, hence inside BrowserRouter. */}
              <SubjectModal />
            </SubjectModalProvider>
            <Toaster
              position="top-center"
              dir="rtl"
              toastOptions={{
                style: {
                  fontFamily: 'var(--font-arabic)',
                  borderRadius: '12px',
                },
              }}
            />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
