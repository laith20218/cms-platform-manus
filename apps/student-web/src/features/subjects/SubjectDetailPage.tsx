import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookOpen, ChevronLeft, Clock, FileText, Loader2, BarChart3 } from 'lucide-react';
import { academicApi } from './services/academic-api';

export default function SubjectDetailPage() {
  const { subjectSlug } = useParams<{ subjectSlug: string }>();

  const { data: subject, isLoading: subjectLoading } = useQuery({
    queryKey: ['subject', subjectSlug],
    queryFn: () => academicApi.getSubjectBySlug(subjectSlug!),
    enabled: !!subjectSlug,
  });

  const { data: lectures, isLoading: lecturesLoading } = useQuery({
    queryKey: ['lectures', subject?.id],
    queryFn: () => academicApi.getLectures(subject!.id),
    enabled: !!subject?.id,
  });

  if (subjectLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  }

  if (!subject) {
    return <div className="text-center py-20 text-[var(--c-text-muted)]">المادة غير موجودة</div>;
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-[var(--c-text-muted)]">
        <Link to="/dashboard" className="hover:text-[var(--c-primary-700)]">الرئيسية</Link>
        <ChevronLeft className="w-3 h-3" />
        <Link to="/subjects" className="hover:text-[var(--c-primary-700)]">المواد</Link>
        <ChevronLeft className="w-3 h-3" />
        <span className="font-semibold text-[var(--c-text)]">{subject.nameAr}</span>
      </div>

      {/* Subject Header */}
      <motion.div
        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6 border backdrop-blur-xl relative overflow-hidden"
        style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)', boxShadow: 'var(--shadow-glass)' }}
      >
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: subject.color || 'var(--grad-primary)' }}>
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-[var(--c-text)] mb-1">{subject.nameAr}</h1>
            {subject.description && <p className="text-sm text-[var(--c-text-soft)] mb-3">{subject.description}</p>}
            <div className="flex flex-wrap gap-4 text-sm text-[var(--c-text-muted)]">
              <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> <strong className="text-[var(--c-text)]" lang="en">{subject.totalQuestions}</strong> سؤال</span>
              <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> <strong className="text-[var(--c-text)]" lang="en">{subject.totalLectures}</strong> محاضرة</span>
              <span className="flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> <strong className="text-[var(--c-text)]" lang="en">{subject.totalExams}</strong> دورة</span>
            </div>
          </div>
        </div>

        {subject.userProgress && (
          <div className="mt-4 pt-4 border-t border-[var(--c-border)]">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-[var(--c-text-muted)]">تقدّمك في المادة</span>
              <span className="font-bold text-[var(--c-primary-700)]" lang="en">{subject.userProgress.completedPercentage.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-[var(--c-bg)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${subject.userProgress.completedPercentage}%`, background: 'var(--grad-primary)' }} />
            </div>
          </div>
        )}
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--c-border)]">
        <button className="px-4 py-2 text-sm font-semibold text-[var(--c-primary-700)] border-b-2 border-[var(--c-primary-700)]">المحاضرات</button>
        <Link to={`/subjects/${subject.slug}/library`} className="px-4 py-2 text-sm font-medium text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]">المكتبة</Link>
        <button className="px-4 py-2 text-sm font-medium text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]">الدورات</button>
      </div>

      {/* Lectures */}
      {lecturesLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--c-primary-700)]" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(lectures || []).map((lec, i) => (
            <motion.div key={lec.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/subjects/${subject.slug}/lectures/${lec.id}`}
                className="block p-5 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white" style={{ background: 'var(--grad-primary)' }} lang="en">
                      {lec.lectureNumber}
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--c-text)]">{lec.titleAr}</div>
                      <div className="text-xs text-[var(--c-text-muted)] flex items-center gap-2">
                        <span lang="en">{lec.questionsCount} سؤال</span>
                        {lec.durationMinutes && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {lec.durationMinutes}د</span>}
                      </div>
                    </div>
                  </div>
                </div>
                {lec.isCompleted ? (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--c-success-50)] px-2.5 py-1 text-xs font-bold text-[var(--c-success-700)]"><BookOpen className="h-3.5 w-3.5" />مكتملة</div>
                ) : lec.userProgress !== undefined && lec.questionsCount > 0 && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[var(--c-text-muted)]">تقدّمك</span>
                      <span className="font-semibold text-[var(--c-primary-700)]" lang="en">{lec.userProgress.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-[var(--c-bg)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${lec.userProgress}%`, background: 'var(--grad-primary)' }} />
                    </div>
                  </div>
                )}
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {lectures && lectures.length === 0 && (
        <div className="text-center py-12 text-[var(--c-text-muted)]">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>لا توجد محاضرات في هذه المادة بعد</p>
        </div>
      )}
    </div>
  );
}
