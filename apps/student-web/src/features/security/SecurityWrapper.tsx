import { useAuth } from '@/app/providers/useAuth';
import { useContentProtection } from '@/features/security/useContentProtection';

/**
 * Security wrapper component - applies content protection to protected pages.
 * Usage: <SecurityWrapper><ProtectedContent /></SecurityWrapper>
 */
export function SecurityWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  useContentProtection({
    studentName: user?.fullName || '',
    studentPhone: user?.phone || '',
    antiCopy: true,
    devToolsDetection: true,
    watermark: true,
    screenshotDetection: false,
  });

  return <>{children}</>;
}
