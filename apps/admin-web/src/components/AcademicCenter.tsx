/** AcademicCenter — premium Tailwind redesign. Hierarchy stages render as responsive cards with teal signals. */
import { FormEvent, useEffect, useState } from 'react';
import { Archive, Building2, CalendarDays, ChevronLeft, ChevronRight, EyeOff, GraduationCap, LoaderCircle, Plus, Presentation, RotateCcw, School, Send, Stethoscope, Layers } from 'lucide-react';
import { apiRequest, type PagedResult } from '../lib/api';

type University = { id: string; nameAr: string; nameEn?: string | null; slug: string; collegesCount: number; isArchived: boolean };
type College = { id: string; universityId: string; nameAr: string; nameEn?: string | null; slug: string; yearsCount: number; isArchived: boolean };
type AcademicYear = { id: string; collegeId: string; nameAr: string; nameEn?: string | null; slug: string; yearNumber: number; semestersCount: number; isArchived: boolean };
type Semester = { id: string; academicYearId: string; nameAr: string; nameEn?: string | null; slug: string; semesterNumber: number; subjectsCount: number; isArchived: boolean };
type Subject = { id: string; semesterId: string; nameAr: string; nameEn?: string | null; slug: string; code?: string | null; totalLectures: number; isArchived: boolean };
type Lecture = { id: string; subjectId: string; titleAr: string; titleEn?: string | null; slug: string; lectureNumber: number; durationMinutes?: number | null; description?: string | null; instructorName?: string | null; sourceReference?: string | null; status: string; isArchived: boolean };
type AcademicKind = 'university' | 'college' | 'year' | 'semester' | 'subject' | 'lecture';

type Props = { token: string; isSuperAdmin: boolean; isArabic: boolean; onError: (message: string) => void; onNotice: (message: string) => void };

const label = (arabic: boolean, item: { nameAr?: string; nameEn?: string | null; titleAr?: string; titleEn?: string | null }) => arabic ? (item.nameAr ?? item.titleAr ?? '') : (item.nameEn ?? item.titleEn ?? item.nameAr ?? item.titleAr ?? '');
const slugify = (value: string) => value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || `cms-${Date.now()}`;

export function AcademicCenter({ token, isSuperAdmin, isArabic, onError, onNotice }: Props) {
  const [universities, setUniversities] = useState<University[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [universityId, setUniversityId] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [yearId, setYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<{ kind: 'university' | 'college' | 'year' | 'semester' | 'subject' | 'lecture'; name: string; nameEn: string; number: string; code: string; duration: string; description: string; instructor: string; source: string }>({ kind: 'university', name: '', nameEn: '', number: '1', code: '', duration: '', description: '', instructor: '', source: '' });

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);
  const resetBelow = (level: 'university' | 'college' | 'year' | 'semester' | 'subject') => {
    if (level === 'university') { setCollegeId(''); setYears([]); setColleges([]); }
    if (level === 'university' || level === 'college') { setYearId(''); setSemesters([]); }
    if (level === 'university' || level === 'college' || level === 'year') { setSemesterId(''); setSubjects([]); }
    if (level !== 'subject') { setSubjectId(''); setLectures([]); }
  };
  const archiveSuffix = (includeArchived = showArchived) => includeArchived ? '&includeArchived=true' : '';
  const loadUniversities = async (includeArchived = showArchived) => {
    const data = await request<PagedResult<University>>(`/api/v1/universities?Page=1&PageSize=100${archiveSuffix(includeArchived)}`);
    setUniversities(data.items);
  };
  const loadColleges = async (id: string, includeArchived = showArchived) => { const data = await request<College[]>(`/api/v1/universities/${id}/colleges?includeArchived=${includeArchived}`); setColleges(data); };
  const loadYears = async (id: string, includeArchived = showArchived) => { const data = await request<AcademicYear[]>(`/api/v1/colleges/${id}/years?includeArchived=${includeArchived}`); setYears(data); };
  const loadSemesters = async (id: string, includeArchived = showArchived) => { const data = await request<Semester[]>(`/api/v1/years/${id}/semesters?includeArchived=${includeArchived}`); setSemesters(data); };
  const loadSubjects = async (id: string, includeArchived = showArchived) => { const data = await request<Subject[]>(`/api/v1/semesters/${id}/subjects?includeArchived=${includeArchived}`); setSubjects(data); };
  const loadLectures = async (id: string, includeArchived = showArchived) => { const data = await request<Lecture[]>(`/api/v1/admin/content/academic/subjects/${id}/lectures?includeArchived=${includeArchived}`); setLectures(data); };

  // The initial load must run once; parent callbacks are stable state setters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadUniversities().catch((error) => onError(error.message)); }, []);

  async function chooseUniversity(id: string) { setUniversityId(id); resetBelow('university'); if (id) await loadColleges(id).catch((error) => onError(error.message)); }
  async function chooseCollege(id: string) { setCollegeId(id); resetBelow('college'); if (id) await loadYears(id).catch((error) => onError(error.message)); }
  async function chooseYear(id: string) { setYearId(id); resetBelow('year'); if (id) await loadSemesters(id).catch((error) => onError(error.message)); }
  async function chooseSemester(id: string) { setSemesterId(id); resetBelow('semester'); if (id) await loadSubjects(id).catch((error) => onError(error.message)); }
  async function chooseSubject(id: string) { setSubjectId(id); resetBelow('subject'); if (id) await loadLectures(id).catch((error) => onError(error.message)); }

  async function toggleArchived() {
    const next = !showArchived;
    setShowArchived(next);
    setUniversityId(''); setCollegeId(''); setYearId(''); setSemesterId(''); setSubjectId('');
    setColleges([]); setYears([]); setSemesters([]); setSubjects([]); setLectures([]);
    await loadUniversities(next).catch((error) => onError(error.message));
  }

  async function refreshAfterLifecycle(kind: AcademicKind) {
    if (kind === 'university') return loadUniversities();
    if (kind === 'college' && universityId) return loadColleges(universityId);
    if (kind === 'year' && collegeId) return loadYears(collegeId);
    if (kind === 'semester' && yearId) return loadSemesters(yearId);
    if (kind === 'subject' && semesterId) return loadSubjects(semesterId);
    if (kind === 'lecture' && subjectId) return loadLectures(subjectId);
  }

  async function setArchiveState(kind: AcademicKind, id: string, restore: boolean) {
    setBusy(true);
    try {
      await request(`/api/v1/academic/${kind}/${id}/${restore ? 'restore' : 'archive'}`, { method: 'POST' });
      await refreshAfterLifecycle(kind);
      onNotice(restore ? (isArabic ? 'تمت استعادة العنصر الأكاديمي.' : 'Academic item restored.') : (isArabic ? 'تمت أرشفة العنصر الأكاديمي وإخفاؤه عن الطلاب.' : 'Academic item archived and hidden from students.'));
    } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); } finally { setBusy(false); }
  }

  async function publishLecture(id: string) {
    setBusy(true);
    try {
      await request(`/api/v1/lectures/${id}/publish`, { method: 'POST' });
      await refreshAfterLifecycle('lecture');
      onNotice(isArabic ? 'تم نشر المحاضرة وأصبحت متاحة للطلاب المخوّلين.' : 'Lecture published for entitled students.');
    } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const slug = slugify(form.name);
      if (form.kind === 'university') {
        await request('/api/v1/universities', { method: 'POST', body: JSON.stringify({ nameAr: form.name, nameEn: form.nameEn || null, slug, description: null, logoUrl: null }) });
        await loadUniversities();
      } else if (form.kind === 'college' && universityId) {
        await request('/api/v1/colleges', { method: 'POST', body: JSON.stringify({ universityId, nameAr: form.name, nameEn: form.nameEn || null, slug }) });
        await loadColleges(universityId);
      } else if (form.kind === 'year' && collegeId) {
        await request('/api/v1/years', { method: 'POST', body: JSON.stringify({ collegeId, nameAr: form.name, nameEn: form.nameEn || null, slug, yearNumber: Number(form.number) }) });
        await loadYears(collegeId);
      } else if (form.kind === 'semester' && yearId) {
        await request('/api/v1/semesters', { method: 'POST', body: JSON.stringify({ academicYearId: yearId, nameAr: form.name, nameEn: form.nameEn || null, slug, semesterNumber: Number(form.number) }) });
        await loadSemesters(yearId);
      } else if (form.kind === 'subject' && semesterId) {
        await request('/api/v1/subjects', { method: 'POST', body: JSON.stringify({ semesterId, nameAr: form.name, nameEn: form.nameEn || null, slug, code: form.code || null, description: null, color: '#0f766e' }) });
        await loadSubjects(semesterId);
      } else if (form.kind === 'lecture' && subjectId) {
        await request('/api/v1/lectures', { method: 'POST', body: JSON.stringify({ subjectId, titleAr: form.name, titleEn: form.nameEn || null, slug, lectureNumber: Number(form.number), durationMinutes: form.duration ? Number(form.duration) : null, description: form.description || null, instructorName: form.instructor || null, sourceReference: form.source || null }) });
        await loadLectures(subjectId);
      } else {
        throw new Error(isArabic ? 'اختر العنصر الأب أولًا.' : 'Select the parent item first.');
      }
      setForm({ ...form, name: '', nameEn: '', code: '', duration: '', description: '', instructor: '', source: '' });
      onNotice(isArabic ? 'تم حفظ العنصر الأكاديمي.' : 'Academic item saved.');
    } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); } finally { setBusy(false); }
  }

  const stages = [
    { key: 'university', icon: Building2, items: universities, selected: universityId, choose: chooseUniversity, title: isArabic ? 'الجامعات' : 'Universities', add: isSuperAdmin },
    { key: 'college', icon: School, items: colleges, selected: collegeId, choose: chooseCollege, title: isArabic ? 'الكليات' : 'Colleges', add: Boolean(universityId) },
    { key: 'year', icon: GraduationCap, items: years, selected: yearId, choose: chooseYear, title: isArabic ? 'السنوات' : 'Academic years', add: Boolean(collegeId) },
    { key: 'semester', icon: CalendarDays, items: semesters, selected: semesterId, choose: chooseSemester, title: isArabic ? 'الفصول' : 'Semesters', add: Boolean(yearId) },
    { key: 'subject', icon: Stethoscope, items: subjects, selected: subjectId, choose: chooseSubject, title: isArabic ? 'المواد' : 'Subjects', add: Boolean(semesterId) },
  ] as const;

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'البنية الأكاديمية' : 'Academic directory'}</p>
            <h2 className="text-2xl font-bold text-slate-900">{isArabic ? 'من الجامعة إلى المحاضرة' : 'University to lecture'}</h2>
          </div>
        </div>
        <button type="button" onClick={() => void toggleArchived()} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${showArchived ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
          <EyeOff className="w-4 h-4" />{showArchived ? (isArabic ? 'إخفاء المؤرشف' : 'Hide archived') : (isArabic ? 'إظهار المؤرشف' : 'Show archived')}
        </button>
      </header>

      {/* Hierarchy board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stages.map((stage, index) => (
          <div key={stage.key} className="relative rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2 text-slate-700">
                <stage.icon className="w-4 h-4 text-teal-600" />
                <span className="text-sm font-semibold">{stage.title}</span>
              </div>
              {stage.add && (
                <button type="button" title={isArabic ? 'إضافة' : 'Add'} onClick={() => setForm({ ...form, kind: stage.key, name: '', nameEn: '', code: '', duration: '', number: '1' })} className="p-1 rounded-md text-slate-500 hover:bg-teal-50 hover:text-teal-600 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex-1 max-h-72 overflow-y-auto p-2 space-y-1">
              {stage.items.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6">{isArabic ? 'لا توجد عناصر بعد' : 'No items yet'}</p>
              ) : stage.items.map((item: University | College | AcademicYear | Semester | Subject) => {
                const selected = stage.selected === item.id;
                return (
                  <div key={item.id} className={`flex items-stretch gap-1 rounded-lg border transition-colors ${item.isArchived ? 'border-amber-200 bg-amber-50/40' : 'border-transparent'} ${selected ? 'ring-2 ring-teal-500 ring-offset-1' : ''}`}>
                    <button type="button" onClick={() => void stage.choose(item.id)} className={`flex-1 min-w-0 text-right px-2.5 py-2 rounded-lg text-sm transition-colors ${selected ? 'bg-teal-50 text-teal-700' : 'hover:bg-slate-50 text-slate-700'}`}>
                      <strong className="block truncate font-medium text-slate-900 text-sm">{label(isArabic, item)}</strong>
                      <small className="block text-[10px] text-slate-400 truncate font-mono">{item.slug}</small>
                      {item.isArchived && <em className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100">{isArabic ? 'مؤرشف' : 'Archived'}</em>}
                    </button>
                    <button type="button" disabled={busy} title={item.isArchived ? (isArabic ? 'استعادة' : 'Restore') : (isArabic ? 'أرشفة' : 'Archive')} onClick={() => void setArchiveState(stage.key, item.id, item.isArchived)} className="w-8 my-1 ml-1 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50">
                      {item.isArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
            {index < stages.length - 1 && (
              <span className="hidden xl:flex absolute top-1/2 -left-3 -translate-y-1/2 z-10 w-6 h-6 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 shadow-sm">
                {isArabic ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Lecture strip */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
              <Presentation className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'محاضرات المادة' : 'Subject lectures'}</p>
              <h3 className="text-base font-bold text-slate-900">{subjectId ? (isArabic ? 'محاضرات مرتبطة بالمادة المحددة' : 'Lectures for selected subject') : (isArabic ? 'اختر مادة لعرض محاضراتها' : 'Select a subject to view lectures')}</h3>
            </div>
          </div>
          {subjectId && (
            <button type="button" onClick={() => setForm({ ...form, kind: 'lecture', name: '', nameEn: '', code: '', duration: '', description: '', instructor: '', source: '', number: String(lectures.length + 1) })} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors">
              <Plus className="w-4 h-4" />{isArabic ? 'إضافة محاضرة' : 'Add lecture'}
            </button>
          )}
        </div>
        <div className="p-5">
          {lectures.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 text-slate-500">
              <Presentation className="w-6 h-6 text-slate-300" />
              <p className="mt-2 text-sm">{isArabic ? 'لا توجد محاضرات بعد.' : 'No lectures yet.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {lectures.map((lecture) => (
                <article key={lecture.id} className={`rounded-lg border p-4 flex gap-3 transition-colors ${lecture.isArchived ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white hover:border-teal-300 hover:shadow-sm'}`}>
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center text-sm font-bold">#{lecture.lectureNumber}</div>
                  <div className="min-w-0 flex-1">
                    <strong className="block text-sm font-semibold text-slate-900 truncate">{label(isArabic, lecture)}</strong>
                    <div className="mt-0.5 space-y-0.5">
                      <small className="block text-xs text-slate-500">{lecture.durationMinutes ? `${lecture.durationMinutes} ${isArabic ? 'د' : 'min'}` : '—'}</small>
                      {lecture.instructorName && <small className="block text-xs text-slate-500">{isArabic ? `المحاضر: ${lecture.instructorName}` : `Instructor: ${lecture.instructorName}`}</small>}
                      {lecture.sourceReference && <small className="block text-xs text-slate-500">{isArabic ? `المصدر: ${lecture.sourceReference}` : `Source: ${lecture.sourceReference}`}</small>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {lecture.isArchived && <em className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100">{isArabic ? 'مؤرشف' : 'Archived'}</em>}
                      {lecture.status === 'draft' && <em className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide text-sky-700 bg-sky-100">{isArabic ? 'مسودة' : 'Draft'}</em>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {lecture.status === 'draft' && !lecture.isArchived && (
                      <button type="button" disabled={busy} title={isArabic ? 'نشر المحاضرة' : 'Publish lecture'} onClick={() => void publishLecture(lecture.id)} className="p-1.5 rounded-md text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button type="button" disabled={busy} title={lecture.isArchived ? (isArabic ? 'استعادة' : 'Restore') : (isArabic ? 'أرشفة' : 'Archive')} onClick={() => void setArchiveState('lecture', lecture.id, lecture.isArchived)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50">
                      {lecture.isArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create form */}
      <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'إجراء إنشاء' : 'Create action'}</p>
          <h3 className="text-base font-bold text-slate-900">{isArabic ? 'إضافة عنصر إلى الهيكل' : 'Add hierarchy item'}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'النوع' : 'Type'}</span>
            <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as typeof form.kind })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
              <option value="university">{isArabic ? 'جامعة' : 'University'}</option>
              <option value="college">{isArabic ? 'كلية' : 'College'}</option>
              <option value="year">{isArabic ? 'سنة' : 'Academic year'}</option>
              <option value="semester">{isArabic ? 'فصل' : 'Semester'}</option>
              <option value="subject">{isArabic ? 'مادة' : 'Subject'}</option>
              <option value="lecture">{isArabic ? 'محاضرة' : 'Lecture'}</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الاسم العربي' : 'Arabic name'}</span>
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الاسم الإنجليزي' : 'English name'}</span>
            <input value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
          </label>
          {['year', 'semester', 'lecture'].includes(form.kind) && (
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الترتيب أو الرقم' : 'Order / number'}</span>
              <input type="number" min="1" value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
            </label>
          )}
          {form.kind === 'subject' && (
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'رمز المادة' : 'Subject code'}</span>
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
            </label>
          )}
          {form.kind === 'lecture' && (
            <>
              <label className="block">
                <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'المدة بالدقائق' : 'Duration (minutes)'}</span>
                <input type="number" min="1" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'اسم المحاضر' : 'Instructor name'}</span>
                <input value={form.instructor} onChange={(event) => setForm({ ...form, instructor: event.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'المصدر أو المرجع' : 'Source / reference'}</span>
                <input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </label>
              <label className="block md:col-span-2 lg:col-span-3">
                <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'وصف المحاضرة' : 'Lecture description'}</span>
                <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </label>
            </>
          )}
        </div>
        <div className="flex justify-end">
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50" disabled={busy}>
            {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{isArabic ? 'حفظ' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
}
