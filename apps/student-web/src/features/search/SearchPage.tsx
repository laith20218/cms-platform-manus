// CMS student search: scoped discovery of the student's academic subjects and lectures.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Loader2, Search, Stethoscope } from 'lucide-react';
import { apiClient } from '@/services/api-client';

type SearchResult = { kind: 'subject' | 'lecture'; id: string; title: string; subtitle?: string | null; subjectSlug: string; subjectName?: string | null; lectureNumber?: number | null };

async function searchAcademics(query: string): Promise<SearchResult[]> {
  const response = await apiClient.get('/search', { params: { q: query } });
  return response.data.items ?? [];
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  useEffect(() => setQuery(initialQuery), [initialQuery]);
  const results = useQuery({ queryKey: ['student-search', submitted], queryFn: () => searchAcademics(submitted), enabled: submitted.trim().length >= 2 });
  const submit = (event: React.FormEvent) => { event.preventDefault(); const normalized = query.trim(); setSubmitted(normalized); setParams(normalized ? { q: normalized } : {}); };

  return (
    <main className="mx-auto max-w-4xl space-y-6"><header><p className="text-sm font-bold text-[var(--c-primary-700)]">اكتشاف المحتوى</p><h1 className="mt-1 text-3xl font-extrabold text-[var(--c-text)]">ابحث في موادك ومحاضراتك</h1><p className="mt-2 text-sm text-[var(--c-text-muted)]">النتائج مقيدة بمسارك الأكاديمي المسجل في حسابك.</p></header><form onSubmit={submit} className="flex gap-2 rounded-2xl border border-[var(--c-border-strong)] bg-[var(--c-surface)] p-2 shadow-sm"><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثال: تشريح، قلب، محاضرة أولى" className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--c-text)] outline-none" /><button className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-white" style={{ background: 'var(--grad-primary)' }}><Search className="h-4 w-4" />بحث</button></form>{submitted.trim().length < 2 ? <div className="rounded-3xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] p-12 text-center text-sm text-[var(--c-text-muted)]">اكتب حرفين على الأقل لبدء البحث.</div> : results.isLoading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" /></div> : results.isError ? <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"><p className="font-bold text-[var(--c-text)]">تعذر إجراء البحث الآن.</p><button onClick={() => results.refetch()} className="mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white">إعادة المحاولة</button></div> : results.data?.length === 0 ? <div className="rounded-3xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] p-12 text-center text-sm text-[var(--c-text-muted)]">لا توجد نتائج مطابقة لـ «{submitted}» ضمن مسارك الأكاديمي.</div> : <section className="space-y-3">{results.data?.map((result) => { const target = result.kind === 'lecture' ? `/subjects/${result.subjectSlug}/lectures/${result.id}` : `/subjects/${result.subjectSlug}`; return <Link key={`${result.kind}-${result.id}`} to={target} className="flex items-center gap-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--c-primary-300)] hover:shadow-md"><div className="rounded-xl p-3 text-[var(--c-primary-700)]" style={{ background: 'var(--c-primary-50)' }}>{result.kind === 'lecture' ? <Stethoscope className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}</div><div className="min-w-0"><p className="font-extrabold text-[var(--c-text)]">{result.title}</p><p className="mt-1 text-sm text-[var(--c-text-muted)]">{result.kind === 'lecture' ? `محاضرة ${result.lectureNumber ?? ''} · ${result.subjectName ?? ''}` : 'مادة دراسية'}</p></div></Link>; })}</section>}</main>
  );
}
