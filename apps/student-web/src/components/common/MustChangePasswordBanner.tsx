// PR-6 — must-change-password banner (contract H): after an administrator
// resets a student's password, the login/profile payloads carry
// mustChangePassword=true. This persistent, dismissible-per-session banner
// shows in the app shell until the student changes the password.
//
// Behaviour:
//   • role="alert" (announced by screen readers), amber/warning, RTL-aware;
//   • links to the existing change-password screen (/settings);
//   • the dismiss (×) hides it for THIS browser session only — the flag comes
//     back on the next sign-in/session until the password is actually changed.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, X } from 'lucide-react';
import { useAuth } from '@/app/providers/useAuth';

const DISMISS_KEY = 'cms-student-must-change-password-dismissed';

export function MustChangePasswordBanner() {
  const { user } = useAuth();
  const required = user?.mustChangePassword === true;
  const [dismissed, setDismissed] = useState(false);

  // Read the per-session dismissal once on mount (sessionStorage = the banner
  // returns on the next sign-in/session, which is the honest behavior).
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* best-effort */ }
    setDismissed(true);
  };

  if (!required || dismissed) return null;

  return (
    <div
      dir="rtl"
      data-testid="must-change-password-banner"
      role="alert"
      className="flex items-center justify-center gap-2 flex-wrap px-4 py-2 text-[13px] font-bold text-amber-800 bg-amber-50 border-b border-amber-200"
    >
      <KeyRound className="w-4 h-4 shrink-0 text-amber-600" aria-hidden="true" />
      <span>
        لقد أُعيد تعيين كلمة مرورك من قبل الإدارة — يرجى تغييرها الآن
        <span className="mx-2 text-amber-400" aria-hidden="true">·</span>
        <span dir="ltr" className="font-semibold text-amber-700">
          Your password was reset by the administration — please change it now
        </span>
      </span>
      <Link
        to="/settings"
        data-testid="must-change-password-cta"
        className="ms-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-700"
      >
        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
        تغيير كلمة المرور
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="إخفاء التنبيه حتى الجلسة القادمة"
        data-testid="must-change-password-dismiss"
        className="ms-1 rounded-md p-1 text-amber-600 transition-colors hover:bg-amber-100"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
