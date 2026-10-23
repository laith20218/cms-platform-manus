import { Link } from 'react-router-dom';
import { Home, AlertCircle } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
        <AlertCircle className="w-10 h-10" />
      </div>
      <h1 className="text-6xl font-bold text-[var(--cms-text)] mb-2">404</h1>
      <p className="text-lg font-semibold text-[var(--cms-text-soft)] mb-2">الصفحة غير موجودة</p>
      <p className="text-sm text-[var(--cms-text-muted)] mb-8 max-w-sm">
        الصفحة التي تبحث عنها قد تكون محذوفة أو غير متوفرة.
      </p>
      <Link to="/dashboard" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white transition-colors" style={{ background: 'var(--cms-teal-700)' }}>
        <Home className="w-5 h-5" /> العودة للوحة التحكم
      </Link>
    </div>
  );
}
