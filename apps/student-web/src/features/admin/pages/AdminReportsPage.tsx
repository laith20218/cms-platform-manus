import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileWarning, Loader2, XCircle } from 'lucide-react';
import { adminApi } from '../services/admin-api';

export default function AdminReportsPage() {
  const reports = useQuery({ queryKey: ['admin', 'reports-summary'], queryFn: adminApi.getReportsSummary });

  if (reports.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  if (reports.isError || !reports.data) {
    return <section className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"><h1 className="text-lg font-bold text-[var(--c-text)]">تعذر تحميل تقارير المحتوى</h1><button onClick={() => reports.refetch()} className="mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white">إعادة المحاولة</button></section>;
  }

  const summary = reports.data;
  const cards = [
    { label: 'إجمالي البلاغات', value: summary.totalReports, icon: FileWarning, color: 'var(--c-primary-700)' },
    { label: 'قيد المراجعة', value: summary.pendingReports, icon: AlertTriangle, color: 'var(--c-warning-500)' },
    { label: 'تم حلها', value: summary.resolvedReports, icon: CheckCircle2, color: 'var(--c-success-500)' },
    { label: 'مرفوضة', value: summary.rejectedReports, icon: XCircle, color: 'var(--c-danger-500)' },
  ];

  return <section className="space-y-6"><header><h1 className="text-2xl font-extrabold text-[var(--c-text)]">تقارير المحتوى</h1><p className="mt-1 text-sm text-[var(--c-text-muted)]">ملخص البلاغات الواردة من الطلاب.</p></header><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{cards.map(card => <article key={card.label} className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5"><card.icon className="h-5 w-5" style={{ color: card.color }} /><div className="mt-3 text-2xl font-extrabold text-[var(--c-text)]" lang="en">{card.value}</div><div className="mt-1 text-sm text-[var(--c-text-muted)]">{card.label}</div></article>)}</div><section className="overflow-hidden rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)]"><div className="border-b border-[var(--c-border)] p-5 font-bold text-[var(--c-text)]">أحدث الأسئلة المبلّغ عنها</div>{summary.recentReports.length === 0 ? <p className="p-6 text-sm text-[var(--c-text-muted)]">لا توجد بلاغات حديثة.</p> : <div className="divide-y divide-[var(--c-border)]">{summary.recentReports.map(report => <article key={report.questionId} className="p-5"><p className="font-semibold text-[var(--c-text)]">{report.questionText}</p><p className="mt-1 text-sm text-[var(--c-text-muted)]">السبب الأكثر شيوعاً: {report.mostCommonReason} · <span lang="en">{report.reportsCount}</span> بلاغ</p></article>)}</div>}</section></section>;
}
