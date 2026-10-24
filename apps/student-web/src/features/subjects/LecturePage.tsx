// CMS lecture detail: a scope-protected reading hub with explicit completion and separate question practice.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BookOpen, CheckCircle2, ChevronLeft, Clock, FileText, Loader2, PlayCircle } from 'lucide-react';
import { academicApi } from './services/academic-api';
import { DocumentViewer } from '@/features/library/DocumentViewer';
import { libraryApi, type LibraryFile } from '@/features/library/services/library-api';

export default function LecturePage() {
  const { subjectSlug, lectureId } = useParams<{ subjectSlug: string; lectureId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<LibraryFile | null>(null);
  const lectureQuery = useQuery({ queryKey: ['lecture', lectureId], queryFn: () => academicApi.getLecture(lectureId!), enabled: Boolean(lectureId) });
  const filesQuery = useQuery({ queryKey: ['lecture-text-files', lectureId], queryFn: () => libraryApi.getLectureTextFiles(lectureId!), enabled: Boolean(lectureId) });
  const completeMutation = useMutation({
    mutationFn: () => academicApi.completeLecture(lectureId!),
    onSuccess: async () => {
      toast.success('سُجل إتمام المحاضرة. أحسنت.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lecture', lectureId] }),
        queryClient.invalidateQueries({ queryKey: ['lectures'] }),
        queryClient.invalidateQueries({ queryKey: ['my-stats'] }),
      ]);
    },
    onError: () => toast.error('تعذر تسجيل إتمام المحاضرة الآن.'),
  });

  if (lectureQuery.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  if (lectureQuery.isError || !lectureQuery.data) return <div className="py-20 text-center text-[var(--c-text-muted)]">تعذر العثور على المحاضرة أو لا تملك صلاحية الوصول إليها.</div>;

  const lecture = lectureQuery.data;
  const files = filesQuery.data?.items ?? [];
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2 text-xs text-[var(--c-text-muted)]"><Link to="/dashboard" className="hover:text-[var(--c-primary-700)]">الرئيسية</Link><ChevronLeft className="h-3 w-3" /><Link to={`/subjects/${subjectSlug}`} className="hover:text-[var(--c-primary-700)]">المادة</Link><ChevronLeft className="h-3 w-3" /><span className="font-semibold text-[var(--c-text)]">المحاضرة {lecture.lectureNumber}</span></div>
      <section className="rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 shadow-sm">
        <div className="flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: 'var(--grad-primary)' }}><BookOpen className="h-7 w-7" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-[var(--c-primary-700)]">المحاضرة {lecture.lectureNumber}</p>{lecture.isCompleted && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--c-success-50)] px-2.5 py-1 text-xs font-bold text-[var(--c-success-700)]"><CheckCircle2 className="h-3.5 w-3.5" />مكتملة</span>}</div><h1 className="mt-1 text-2xl font-extrabold text-[var(--c-text)]">{lecture.titleAr}</h1>{lecture.description && <p className="mt-3 text-sm leading-6 text-[var(--c-text-soft)]">{lecture.description}</p>}<div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--c-text-muted)]">{lecture.durationMinutes && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{lecture.durationMinutes} دقيقة</span>}{lecture.instructorName && <span>المحاضر: {lecture.instructorName}</span>}{lecture.sourceReference && <span>المرجع: {lecture.sourceReference}</span>}</div></div></div>
        <div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--c-border)] pt-5">{lecture.isCompleted ? <button type="button" disabled className="inline-flex items-center gap-2 rounded-xl bg-[var(--c-success-50)] px-4 py-2.5 text-sm font-bold text-[var(--c-success-700)]"><CheckCircle2 className="h-4 w-4" />تم إتمام المحاضرة</button> : <button type="button" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: 'var(--grad-success)' }}>{completeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}إتمام المحاضرة</button>}{lecture.questionsCount > 0 ? <Link to={`/subjects/${subjectSlug}/lectures/${lecture.id}/questions`} className="inline-flex items-center gap-2 rounded-xl border border-[var(--c-primary-200)] bg-[var(--c-primary-50)] px-4 py-2.5 text-sm font-bold text-[var(--c-primary-700)]"><PlayCircle className="h-4 w-4" />بدء الأسئلة ({lecture.questionsCount})</Link> : <span className="inline-flex items-center rounded-xl border border-dashed border-[var(--c-border)] px-4 py-2.5 text-sm text-[var(--c-text-muted)]">لا توجد أسئلة مرتبطة بعد</span>}<button type="button" onClick={() => navigate(-1)} className="px-4 py-2.5 text-sm font-semibold text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]">عودة</button></div>
      </section>
      <section className="rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6"><div className="mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-[var(--c-primary-700)]" /><h2 className="font-extrabold text-[var(--c-text)]">ملفات المحاضرة النصية</h2></div>{filesQuery.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[var(--c-primary-700)]" /></div> : files.length === 0 ? <p className="py-5 text-sm text-[var(--c-text-muted)]">لا توجد ملفات نصية منشورة مرتبطة بهذه المحاضرة بعد.</p> : <div className="space-y-3">{files.map((file) => <button type="button" key={file.id} onClick={() => setSelectedFile(file)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--c-border)] p-4 text-right transition-colors hover:border-[var(--c-primary-300)] hover:bg-[var(--c-primary-50)]"><div className="rounded-xl bg-[var(--c-primary-50)] p-2.5 text-[var(--c-primary-700)]"><FileText className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate font-bold text-[var(--c-text)]">{file.title}</p>{file.description && <p className="mt-1 line-clamp-1 text-xs text-[var(--c-text-muted)]">{file.description}</p>}</div><span className="text-xs font-semibold text-[var(--c-primary-700)]">فتح</span></button>)}</div>}</section>
      {selectedFile && <DocumentViewer file={selectedFile} onClose={() => setSelectedFile(null)} />}
    </main>
  );
}
