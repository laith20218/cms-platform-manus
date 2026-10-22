import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';
import { Ticket, Loader2, CheckCircle2, AlertCircle, ChevronLeft } from 'lucide-react';
import { apiClient } from '@/services/api-client';

export default function ActivateCodePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [codeParts, setCodeParts] = useState(['', '', '', '']);

  const handleCodeChange = (value: string, index: number) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const newParts = [...codeParts];
    newParts[index] = cleaned;
    setCodeParts(newParts);
    setCode(newParts.join('-'));
    if (cleaned.length === 4 && index < 3) {
      const next = document.getElementById(`code-part-${index + 1}`);
      next?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (pasted.length >= 4) {
      const parts = [pasted.slice(0,4), pasted.slice(4,8), pasted.slice(8,12), pasted.slice(12,16)];
      setCodeParts(parts);
      setCode(parts.join('-'));
    }
  };

  const redeemMutation = useMutation({
    mutationFn: async (codeStr: string) => {
      const res = await apiClient.post('/subscriptions/redeem', { code: codeStr });
      return res.data;
    },
    onSuccess: () => {
      toast.success('تم تفعيل الكود بنجاح!');
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setTimeout(() => navigate('/dashboard'), 1500);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.detail || 'فشل تفعيل الكود';
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 16) return;
    redeemMutation.mutate(code);
  };

  const inputBorder = (filled: boolean) => filled ? 'var(--cms-teal-500)' : 'var(--cms-line)';

  return (
    <div className="max-w-md mx-auto py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
          <Ticket className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--cms-text)]">تفعيل كود الاشتراك</h1>
          <p className="text-sm text-[var(--cms-text-muted)]">أدخل كود الاشتراك لفتح المحتوى</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6">
          <label className="block text-sm font-semibold mb-4 text-[var(--cms-text)]">كود الاشتراك</label>
          <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {codeParts.map((part, i) => (
              <input
                key={i}
                id={`code-part-${i}`}
                type="text"
                value={part}
                onChange={(e) => handleCodeChange(e.target.value, i)}
                className="w-16 h-16 text-center text-xl font-bold rounded-xl border-2 bg-white focus:outline-none transition-colors"
                style={{ borderColor: inputBorder(part.length === 4), color: 'var(--cms-text)' }}
                placeholder="●●●●"
                maxLength={4}
                disabled={redeemMutation.isPending}
              />
            ))}
          </div>
          <p className="text-xs text-center mt-3 text-[var(--cms-text-muted)]">الصيغة: XXXX-XXXX-XXXX-XXXX</p>
        </div>
        <button
          type="submit"
          disabled={code.length < 16 || redeemMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white transition-colors disabled:opacity-50"
          style={{ background: 'var(--cms-teal-700)' }}
        >
          {redeemMutation.isPending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> جارٍ التفعيل...</>
          ) : redeemMutation.isSuccess ? (
            <><CheckCircle2 className="w-5 h-5" /> تم التفعيل!</>
          ) : (
            <><Ticket className="w-5 h-5" /> تفعيل</>
          )}
        </button>
        {redeemMutation.isError && (
          <div className="flex items-start gap-2 p-4 rounded-xl border" style={{ background: 'var(--cms-danger-50)', borderColor: 'var(--cms-danger)' }}>
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--cms-danger)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--cms-danger)' }}>فشل التفعيل</p>
              <p className="text-xs mt-1 text-[var(--cms-text-muted)]">تأكد من أن الكود صحيح وغير منتهي وغير مستخدم.</p>
            </div>
          </div>
        )}
      </form>
      <Link to="/dashboard" className="flex items-center gap-1 mt-6 text-sm text-[var(--cms-text-muted)] hover:text-[var(--cms-teal-700)] transition-colors">
        <ChevronLeft className="w-4 h-4" /> العودة للوحة التحكم
      </Link>
    </div>
  );
}
