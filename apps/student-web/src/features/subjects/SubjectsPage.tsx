import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, BookOpenCheck, ChevronLeft, ClipboardCheck, Clock3,
  GraduationCap, Layers, LibraryBig, Loader2, Sparkles,
} from 'lucide-react';
import { academicApi, type SubjectSummary } from './services/academic-api';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { cn } from '@/utils';

/**
 * Subjects browser (Push 5 overhaul): the academic cascade reworked into a
 * compact stepper — universities → colleges → YEAR horizontal tabs → semester
 * chips → subject cards carrying entitlement-aware quick actions
 * (المحتوى / الاختبارات / المكتبة / الكورسات), surfaced from the student's
 * active content scopes. An "my subjects" strip on top gives one-tap access
 * to everything the student is entitled to.
 */
export default function SubjectsPage() {
  const [selectedUni, setSelectedUni] = useState<string | null>(null);
  const [selectedCollege, setSelectedCollege] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);

  const mySubjects = useMySubjects();

  const { data: universities, isLoading: uniLoading } = useQuery({
    queryKey: ['universities'],
    queryFn: () => academicApi.getUniversities(),
  });

  const { data: colleges } = useQuery({
    queryKey: ['colleges', selectedUni],
    queryFn: () => academicApi.getColleges(selectedUni!),
    enabled: !!selectedUni,
  });

  const { data: years } = useQuery({
    queryKey: ['years', selectedCollege],
    queryFn: () => academicApi.getYears(selectedCollege!),
    enabled: !!selectedCollege,
  });

  const { data: semesters } = useQuery({
    queryKey: ['semesters', selectedYear],
    queryFn: () => academicApi.getSemesters(selectedYear!),
    enabled: !!selectedYear,
  });

  const { data: subjects, isFetching: subjectsLoading } = useQuery({
    queryKey: ['subjects', selectedSemester],
    queryFn: () => academicApi.getSubjects(selectedSemester!),
    enabled: !!selectedSemester,
  });

  if (uniLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" />
      </div>
    );
  }

  const mySubjectsList = mySubjects.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-[var(--c-text-muted)]">
        <Link to="/dashboard" className="hover:text-[var(--c-primary-700)]">الرئيسية</Link>
        <ChevronLeft className="w-3 h-3" />
        <span className="font-semibold text-[var(--c-text)]">المواد</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--grad-primary)' }}>
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)]">المواد والخطط الدراسية</h1>
          <p className="text-sm text-[var(--c-text-muted)]">تصفّح الهيكل الأكاديمي وابدأ الدراسة</p>
        </div>
      </div>

      {/* My entitled subjects — one-tap access strip */}
      {mySubjectsList.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border p-4 relative overflow-hidden"
          style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)' }}
          data-testid="my-subjects-strip"
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[var(--c-primary-700)]" />
            <h2 className="text-sm font-bold text-[var(--c-text)]">موادي المفعّلة</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--c-primary-50)] text-[var(--c-primary-700)] font-medium" lang="en">{mySubjectsList.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {mySubjectsList.map((subject) => (
              <Link
                key={subject.id}
                to={`/subjects/${subject.slug}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border border-[var(--c-primary-200)] bg-[var(--c-primary-50)] text-[var(--c-primary-700)] hover:shadow-sm hover:-translate-y-0.5 transition-all"
              >
                <BookOpen className="w-3.5 h-3.5" />
                {subject.nameAr}
              </Link>
            ))}
          </div>
        </motion.section>
      )}

      {/* ===== Step 1: Universities ===== */}
      <section>
        <StepLabel step={1} label="اختر الجامعة" active={!selectedUni} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(universities?.items || []).map((uni) => {
            const active = selectedUni === uni.id;
            return (
              <motion.button
                key={uni.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => { setSelectedUni(uni.id); setSelectedCollege(null); setSelectedYear(null); setSelectedSemester(null); }}
                className={cn(
                  'text-right p-4 rounded-2xl border transition-all flex items-center gap-3',
                  active
                    ? 'border-[var(--c-primary-500)] bg-[var(--c-primary-50)] shadow-sm'
                    : 'border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:shadow-md'
                )}
                data-testid="uni-card"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: active ? 'var(--grad-primary)' : 'var(--c-primary-50)' }}>
                  <GraduationCap className={cn('w-5 h-5', active ? 'text-white' : 'text-[var(--c-primary-700)]')} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[var(--c-text)] truncate">{uni.nameAr}</div>
                  <div className="text-xs text-[var(--c-text-muted)]" lang="en">{uni.collegesCount} كليات</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ===== Step 2: Colleges ===== */}
      {colleges && colleges.length > 0 && (
        <section>
          <StepLabel step={2} label="اختر الكلية" active={!selectedCollege} />
          <div className="flex flex-wrap gap-2">
            {colleges.map((c) => {
              const active = selectedCollege === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCollege(c.id); setSelectedYear(null); setSelectedSemester(null); }}
                  className={cn(
                    'px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all',
                    active
                      ? 'border-transparent text-white shadow-sm'
                      : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-soft)] hover:border-[var(--c-primary-200)]'
                  )}
                  style={active ? { background: 'var(--grad-primary)' } : undefined}
                  data-testid="college-chip"
                >
                  {c.nameAr}
                  <span className={cn('text-[11px] ms-2', active ? 'text-white/80' : 'text-[var(--c-text-faint)]')} lang="en">{c.yearsCount}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== Step 3: Years — horizontal tabs ===== */}
      {years && years.length > 0 && (
        <section>
          <StepLabel step={3} label="السنة الدراسية" active={!selectedYear} />
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] w-full sm:w-fit overflow-x-auto" role="tablist" aria-label="السنوات الدراسية">
            {years.map((y) => {
              const active = selectedYear === y.id;
              return (
                <button
                  key={y.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => { setSelectedYear(y.id); setSelectedSemester(null); }}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all',
                    active
                      ? 'text-white shadow-sm'
                      : 'text-[var(--c-text-muted)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]'
                  )}
                  style={active ? { background: 'var(--grad-primary)' } : undefined}
                  data-testid="year-tab"
                >
                  {y.nameAr}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== Step 4: Semesters — chips ===== */}
      {semesters && semesters.length > 0 && (
        <section>
          <StepLabel step={4} label="الفصل" active={!selectedSemester} />
          <div className="flex flex-wrap gap-2">
            {semesters.map((s) => {
              const active = selectedSemester === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSemester(s.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-all',
                    active
                      ? 'border-[var(--c-primary-500)] bg-[var(--c-primary-50)] text-[var(--c-primary-700)] shadow-sm'
                      : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-soft)] hover:border-[var(--c-primary-200)]'
                  )}
                  data-testid="semester-chip"
                >
                  <Layers className="w-3.5 h-3.5" />
                  {s.nameAr}
                  <span className="text-[11px] text-[var(--c-text-faint)]" lang="en">{s.subjectsCount}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== Step 5: Subjects grid ===== */}
      {selectedSemester && (
        <section>
          <StepLabel step={5} label="المواد" active />
          {subjectsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--c-primary-700)]" />
            </div>
          ) : subjects && subjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects.map((s, i) => (
                <SubjectCard key={s.id} subject={s} index={i} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)]" data-testid="subjects-empty">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
              <p className="text-[var(--c-text-muted)] mb-1">لا توجد مواد متاحة لك في هذا الفصل</p>
              <p className="text-xs text-[var(--c-text-faint)] mb-4">
                {mySubjectsList.length === 0
                  ? 'قد تحتاج إلى تفعيل كود اشتراك لفتح مواد هذا الفصل'
                  : 'مواد هذا الفصل غير مشمولة باشتراكك الحالي'}
              </p>
              {mySubjectsList.length === 0 && (
                <Link
                  to="/activate-code"
                  data-testid="activate-code-cta"
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.03]"
                  style={{ background: 'var(--grad-primary)' }}
                >
                  <Sparkles className="w-4 h-4" /> تفعيل كود
                </Link>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function StepLabel({ step, label, active }: { step: number; label: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span
        className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
          active ? 'text-white' : 'text-[var(--c-text-muted)] bg-[var(--c-bg-hover)]'
        )}
        style={active ? { background: 'var(--grad-primary)' } : undefined}
        lang="en"
      >
        {step}
      </span>
      <h2 className="text-base font-bold text-[var(--c-text)]">{label}</h2>
    </div>
  );
}

/** A subject card with entitlement-aware quick actions (Push 5 Task 4). */
function SubjectCard({ subject, index }: { subject: SubjectSummary; index: number }) {
  const scopes = subject.contentScopes ?? [];
  const canQuestions = scopes.includes('QuestionsExams');
  const canLectures = scopes.includes('LecturesText');
  const canVideoAudio = scopes.includes('VideoAudio');
  const hasLibrary = canLectures || canVideoAudio;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.05, 0.4) }}>
      <div className="h-full p-5 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col" data-testid="subject-card">
        <Link to={`/subjects/${subject.slug}`} className="block group">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: subject.color || 'var(--grad-primary)' }}>
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[var(--c-text)] truncate group-hover:text-[var(--c-primary-700)] transition-colors">{subject.nameAr}</div>
              <div className="text-xs text-[var(--c-text-muted)]" lang="en">{subject.totalQuestions} سؤال • {subject.totalLectures} محاضرة</div>
            </div>
          </div>
        </Link>

        {subject.userProgress && (
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[var(--c-text-muted)]">التقدّم</span>
              <span className="font-semibold text-[var(--c-primary-700)]" lang="en">{subject.userProgress.completedPercentage.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-[var(--c-bg)] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${subject.userProgress.completedPercentage}%`, background: 'var(--grad-primary)' }} />
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--c-border)]" data-testid="subject-quick-actions">
          <Link
            to={`/subjects/${subject.slug}`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--c-primary-50)] text-[var(--c-primary-700)] hover:bg-[var(--c-primary-100)] transition-colors"
          >
            <BookOpenCheck className="w-3.5 h-3.5" /> المحتوى
          </Link>
          {canQuestions && (
            <Link
              to="/my-studies?tab=exams"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--c-bg-hover)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" /> الاختبارات
            </Link>
          )}
          {hasLibrary && (
            <Link
              to={`/subjects/${subject.slug}/library`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--c-bg-hover)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] transition-colors"
            >
              <LibraryBig className="w-3.5 h-3.5" /> المكتبة
            </Link>
          )}
          {canVideoAudio && (
            <Link
              to="/my-studies?tab=courses"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[var(--c-bg-hover)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] transition-colors"
            >
              <GraduationCap className="w-3.5 h-3.5" /> الكورسات
            </Link>
          )}
        </div>

        {subject.lastContentUpdatedAt && (
          <div className="mt-2.5 flex items-center gap-1 text-[11px] text-[var(--c-text-faint)]">
            <Clock3 className="w-3 h-3" /> آخر تحديث {new Date(subject.lastContentUpdatedAt).toLocaleDateString('ar-SY')}
          </div>
        )}
      </div>
    </motion.div>
  );
}
