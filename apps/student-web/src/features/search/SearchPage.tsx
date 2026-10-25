// CMS unified student search: discovery is server-authorized; every destination repeats its own entitlement check.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AudioLines, BookOpen, FileText, Film, HelpCircle, Loader2, Search, Stethoscope, Tag } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { DocumentViewer } from '@/features/library/DocumentViewer';
import type { LibraryFile } from '@/features/library/services/library-api';

type SearchKind = 'subject' | 'lecture' | 'question' | 'file' | 'video' | 'audio' | 'summary';
type SearchResult = { kind: SearchKind; id: string; title: string; subtitle?: string | null; subjectSlug: string; academicContext: string; subjectName?: string | null; lectureId?: string | null; subjectId?: string | null; lectureNumber?: number | null; fileType?: string | null };

const kindMeta: Record<SearchKind, { label: string; icon: typeof BookOpen }> = {
  subject: { label: 'مادة', icon: BookOpen }, lecture: { label: 'محاضرة', icon: Stethoscope }, question: { label: 'سؤال', icon: HelpCircle }, file: { label: 'ملف', icon: FileText }, video: { label: 'فيديو', icon: Film }, audio: { label: 'تسجيل صوتي', icon: AudioLines }, summary: { label: 'ملخص', icon: Tag },
};

async function searchAcademics(query: string): Promise<SearchResult[]> {
  const response = await apiClient.get('/search', { params: { q: query } });
  return response.data.items ?? [];
}

function viewerFile(result: SearchResult): LibraryFile {
  return { id: result.id, type: result.fileType?.toLowerCase() || 'pdf', title: result.title, description: result.subtitle || undefined, fileSize: 0, viewsCount: 0, isFavorite: false };
}

function targetFor(result: SearchResult): string {
  if (result.kind === 'lecture') return `/subjects/${result.subjectSlug}/lectures/${result.id}`;
  if (result.kind === 'question') return result.lectureId ? `/subjects/${result.subjectSlug}/lectures/${result.lectureId}/questions?focus=${result.id}` : `/subjects/${result.subjectSlug}/questions/${result.id}`;
  return `/subjects/${result.subjectSlug}`;
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  const [selectedFile, setSelectedFile] = useState<LibraryFile | null>(null);
  useEffect(() => setQuery(initialQuery), [initialQuery]);
  const results = useQuery({ queryKey: ['student-search', submitted], queryFn: () => searchAcademics(submitted), enabled: submitted.trim().length >= 2 });
  const submit = (event: React.FormEvent) => { event.preventDefault(); const normalized = query.trim(); setSubmitted(normalized); setParams(normalized ? { q: normalized } : {}); };

  return <main className="mx-auto max-w-4xl space-y-6"><header><p className="text-sm font-bold text-[var(--c-primary-700)]">اكتشاف المحتوى</p><h1 className="mt-1 text-3xl font-extrabold text-[var(--c-text)]">ابحث في محتواك الأكاديمي</h1><p className="mt-2 text-sm text-[var(--c-text-muted)]">تظهر النتائج من المحتوى المتاح لك فقط، ويعاد التحقق من الصلاحية عند فتح أي عنصر.</p></header><form onSubmit={submit} className="flex gap-2 rounded-2xl border border-[var(--c-border-strong)] bg-[var(--c-surface)] p-2 shadow-sm"><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثال: تشريح، قلب، Acute appendicitis" className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--c-text)] outline-none" /><button className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-white" style={{ background: 'var(--grad-primary)' }}><Search className="h-4 w-4" />بحث</button></form>{submitted.trim().length < 2 ? <div className="rounded-3xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] p-12 text-center text-sm text-[var(--c-text-muted)]">اكتب حرفين على الأقل لبدء البحث.</div> : results.isLoading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" /></div> : results.isError ? <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"><p className="font-bold text-[var(--c-text)]">تعذر إجراء البحث الآن.</p><button onClick={() => results.refetch()} className="mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white">إعادة المحاولة</button></div> : results.data?.length === 0 ? <div className="rounded-3xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] p-12 text-center text-sm text-[var(--c-text-muted)]">لا توجد نتائج مطابقة لـ «{submitted}» ضمن استحقاقاتك النشطة.</div> : <section className="space-y-3">{results.data?.map(result => { const meta = kindMeta[result.kind]; const Icon = meta.icon; const card = <><div className="rounded-xl p-3 text-[var(--c-primary-700)]" style={{ background: 'var(--c-primary-50)' }}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold text-[var(--c-text)]">{result.title}</p><span className="rounded-full bg-[var(--c-primary-50)] px-2 py-0.5 text-xs font-bold text-[var(--c-primary-700)]">{meta.label}</span></div>{result.subtitle && <p className="mt-1 line-clamp-1 text-sm text-[var(--c-text-muted)]">{result.subtitle}</p>}<p className="mt-1 text-xs text-[var(--c-text-faint)]">{result.academicContext}{result.lectureNumber ? ` · محاضرة ${result.lectureNumber}` : ''}</p></div></>; return result.kind === 'file' || result.kind === 'video' || result.kind === 'audio' || result.kind === 'summary' ? <button type="button" key={`${result.kind}-${result.id}`} onClick={() => setSelectedFile(viewerFile(result))} className="flex w-full items-center gap-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 text-right transition-all hover:-translate-y-0.5 hover:border-[var(--c-primary-300)] hover:shadow-md">{card}</button> : <Link key={`${result.kind}-${result.id}`} to={targetFor(result)} className="flex items-center gap-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--c-primary-300)] hover:shadow-md">{card}</Link>; })}</section>}{selectedFile && <DocumentViewer file={selectedFile} onClose={() => setSelectedFile(null)} />}</main>;
}
