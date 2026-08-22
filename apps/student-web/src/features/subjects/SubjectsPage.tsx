import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, ChevronLeft, BookOpen, Loader2, Clock3, FileText } from 'lucide-react';
import { academicApi } from './services/academic-api';

export default function SubjectsPage() {
  const [selectedUni, setSelectedUni] = useState<string | null>(null);
  const [selectedCollege, setSelectedCollege] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);

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

  const { data: subjects } = useQuery({
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-[var(--c-text-muted)]">
        <Link to="/dashboard" className="hover:text-[var(--c-primary-700)]">الرئيسية</Link>
        <ChevronLeft className="w-3 h-3" />
        <span className="font-semibold text-[var(--c-text)]">الجامعات</span>
      </div>

      <h1 className="text-2xl font-bold text-[var(--c-text)]">تصفّح الهيكل الأكاديمي</h1>

      {/* Universities */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--c-text)] mb-3">الجامعات</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(universities?.items || []).map((uni) => (
            <motion.button
              key={uni.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => { setSelectedUni(uni.id); setSelectedCollege(null); setSelectedYear(null); setSelectedSemester(null); }}
              className={`text-right p-5 rounded-2xl border transition-all ${selectedUni === uni.id ? 'border-[var(--c-primary-500)] bg-[var(--c-primary-50)]' : 'border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:shadow-md'}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'var(--grad-primary)' }}>
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-bold text-[var(--c-text)]">{uni.nameAr}</div>
                  <div className="text-xs text-[var(--c-text-muted)]" lang="en">{uni.collegesCount} كليات</div>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Colleges */}
      {colleges && colleges.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[var(--c-text)] mb-3">الكليات</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {colleges.map((c) => (
              <button key={c.id} onClick={() => { setSelectedCollege(c.id); setSelectedYear(null); setSelectedSemester(null); }}
                className={`text-right p-4 rounded-xl border transition-all ${selectedCollege === c.id ? 'border-[var(--c-primary-500)] bg-[var(--c-primary-50)]' : 'border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)]'}`}>
                <div className="font-semibold text-[var(--c-text)]">{c.nameAr}</div>
                <div className="text-xs text-[var(--c-text-muted)]" lang="en">{c.yearsCount} سنوات</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Years */}
      {years && years.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[var(--c-text)] mb-3">السنوات</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {years.map((y) => (
              <button key={y.id} onClick={() => { setSelectedYear(y.id); setSelectedSemester(null); }}
                className={`p-4 rounded-xl border text-center transition-all ${selectedYear === y.id ? 'border-[var(--c-primary-500)] bg-[var(--c-primary-50)]' : 'border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)]'}`}>
                <div className="font-bold text-[var(--c-text)]">{y.nameAr}</div>
                <div className="text-xs text-[var(--c-text-muted)]" lang="en">{y.semestersCount} فصول</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Semesters */}
      {semesters && semesters.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[var(--c-text)] mb-3">الفصول</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {semesters.map((s) => (
              <button key={s.id} onClick={() => setSelectedSemester(s.id)}
                className={`p-4 rounded-xl border text-center transition-all ${selectedSemester === s.id ? 'border-[var(--c-primary-500)] bg-[var(--c-primary-50)]' : 'border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)]'}`}>
                <div className="font-semibold text-[var(--c-text)]">{s.nameAr}</div>
                <div className="text-xs text-[var(--c-text-muted)]" lang="en">{s.subjectsCount} مواد</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Subjects */}
      {subjects && subjects.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[var(--c-text)] mb-3">المواد</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Link to={`/subjects/${s.slug}`} className="block p-5 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:shadow-lg hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: s.color || 'var(--grad-primary)' }}>
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-bold text-[var(--c-text)]">{s.nameAr}</div>
                      <div className="text-xs text-[var(--c-text-muted)]" lang="en">{s.totalQuestions} سؤال • {s.totalLectures} محاضرات</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--c-text-muted)]">
                    <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{s.totalFiles} ملفات</span>
                    {s.lastContentUpdatedAt && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />آخر تحديث {new Date(s.lastContentUpdatedAt).toLocaleDateString('ar-SY')}</span>}
                  </div>
                  {s.userProgress && (
                    <>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[var(--c-text-muted)]">التقدّم</span>
                        <span className="font-semibold text-[var(--c-primary-700)]" lang="en">{s.userProgress.completedPercentage.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-[var(--c-bg)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${s.userProgress.completedPercentage}%`, background: 'var(--grad-primary)' }} />
                      </div>
                    </>
                  )}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
