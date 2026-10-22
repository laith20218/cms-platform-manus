import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Clock, ChevronLeft, LoaderCircle } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

interface ExamListItem {
  id: string;
  titleAr: string;
  examType: string;
  totalQuestions: number;
  durationMinutes: number;
  status: string;
  attemptsCount: number;
  completedCount: number;
  averageScore?: number | null;
}

interface SubjectWithExams {
  subjectId: string;
  subjectName: string;
  exams: ExamListItem[];
}

export function ExamsCatalogPage() {
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  const { data: subjects, isLoading } = useQuery({
    queryKey: ['exams-catalog'],
    queryFn: async () => {
      const config = await entitlementRequestConfig();
      // Fetch student's subscribed subjects
      const subjectsRes = await apiClient.get('/subjects/my-subjects', config);
      const subjectsList = subjectsRes.data?.items ?? subjectsRes.data ?? [];

      // Fetch exams for each subject in parallel
      const subjectsWithExams = await Promise.all(
        subjectsList.map(async (subject: { id: string; nameAr?: string; name?: string }) => {
          try {
            const examsRes = await apiClient.get(`/exams/by-subject/${subject.id}`, await entitlementRequestConfig());
            const exams = Array.isArray(examsRes.data) ? examsRes.data : (examsRes.data?.items ?? []);
            return {
              subjectId: subject.id,
              subjectName: subject.nameAr ?? subject.name ?? subject.id,
              exams: exams.filter((e: ExamListItem) => e.status === 'Published'),
            };
          } catch {
            return { subjectId: subject.id, subjectName: subject.nameAr ?? subject.name ?? subject.id, exams: [] };
          }
        })
      );
      return subjectsWithExams.filter((s: SubjectWithExams) => s.exams.length > 0);
    },
  });

  const examTypeBadge = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t === 'final') return 'bg-red-50 text-red-700 border-red-200';
    if (t === 'midterm') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (t === 'quiz') return 'bg-teal-50 text-teal-700 border-teal-200';
    return 'bg-sky-50 text-sky-700 border-sky-200';
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
          <ClipboardCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)]">الاختبارات</h1>
          <p className="text-sm text-[var(--c-text-muted)]">جميع الاختبارات المتاحة لك عبر المواد</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
        </div>
      ) : !subjects || subjects.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
          <p className="text-[var(--c-text-muted)]">لا توجد اختبارات متاحة حالياً</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subjects.map((subject: SubjectWithExams) => (
            <div key={subject.subjectId} className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] overflow-hidden">
              {/* Subject header */}
              <button
                onClick={() => setExpandedSubject(expandedSubject === subject.subjectId ? null : subject.subjectId)}
                className="w-full flex items-center justify-between p-4 hover:bg-[var(--c-bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold text-[var(--c-text)]">{subject.subjectName}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--c-primary-50)] text-[var(--c-primary-700)] font-medium">
                    {subject.exams.length} اختبار
                  </span>
                </div>
                <ChevronLeft className={`w-4 h-4 text-[var(--c-text-muted)] transition-transform ${expandedSubject === subject.subjectId ? '-rotate-90' : ''}`} />
              </button>

              {/* Exams list */}
              {expandedSubject === subject.subjectId && (
                <div className="border-t border-[var(--c-border)] divide-y divide-[var(--c-border)]">
                  {subject.exams.map((exam) => (
                    <Link
                      key={exam.id}
                      to={`/exams/${exam.id}`}
                      className="flex items-center justify-between p-4 hover:bg-[var(--c-bg-hover)] transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-[var(--c-text)] truncate">{exam.titleAr}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${examTypeBadge(exam.examType)}`}>
                            {exam.examType}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[var(--c-text-muted)]">
                          <span>{exam.totalQuestions} سؤال</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {exam.durationMinutes} دقيقة</span>
                          {exam.completedCount > 0 && <span>{exam.completedCount} مكتمل</span>}
                        </div>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-[var(--c-text-muted)] group-hover:text-[var(--c-primary-700)] transition-colors" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export { ExamsCatalogPage as default } from "./ExamsCatalogPage";
