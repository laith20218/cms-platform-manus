/** Style reminder — غرفة القيادة السريرية: hierarchy is revealed progressively, with ivory surfaces, navy labels, and teal action signals. Archive controls stay compact, legible, and visibly secondary to navigation. */
import { FormEvent, useEffect, useState } from 'react';
import { Archive, Building2, CalendarDays, ChevronLeft, ChevronRight, EyeOff, GraduationCap, LoaderCircle, Plus, Presentation, RotateCcw, School, Send, Stethoscope } from 'lucide-react';
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

  return <section className="academic-center">
    <div className="directory-heading"><div><p className="eyebrow">{isArabic ? 'البنية الأكاديمية' : 'ACADEMIC DIRECTORY'}</p><h2>{isArabic ? 'من الجامعة إلى المحاضرة' : 'University to lecture'}</h2></div><button type="button" className={`archive-filter ${showArchived ? 'is-active' : ''}`} onClick={() => void toggleArchived()}><EyeOff size={16} />{showArchived ? (isArabic ? 'إخفاء المؤرشف' : 'Hide archived') : (isArabic ? 'إظهار المؤرشف' : 'Show archived')}</button></div>
    <div className="hierarchy-board">{stages.map((stage, index) => <div className="hierarchy-stage" key={stage.key}><div className="hierarchy-stage-head"><span><stage.icon size={17} />{stage.title}</span>{stage.add && <button type="button" title={isArabic ? 'إضافة' : 'Add'} onClick={() => setForm({ ...form, kind: stage.key, name: '', nameEn: '', code: '', duration: '', number: '1' })}><Plus size={16} /></button>}</div><div className="hierarchy-items">{stage.items.length === 0 ? <p>{isArabic ? 'لا توجد عناصر بعد' : 'No items yet'}</p> : stage.items.map((item: University | College | AcademicYear | Semester | Subject) => <div className={`hierarchy-item ${item.isArchived ? 'is-archived' : ''}`} key={item.id}><button type="button" className={`hierarchy-select ${stage.selected === item.id ? 'selected' : ''}`} onClick={() => void stage.choose(item.id)}><strong>{label(isArabic, item)}</strong><small>{item.slug}</small>{item.isArchived && <em>{isArabic ? 'مؤرشف' : 'Archived'}</em>}</button><button type="button" className="lifecycle-action" disabled={busy} title={item.isArchived ? (isArabic ? 'استعادة' : 'Restore') : (isArabic ? 'أرشفة' : 'Archive')} onClick={() => void setArchiveState(stage.key, item.id, item.isArchived)}>{item.isArchived ? <RotateCcw size={14} /> : <Archive size={14} />}</button></div>)}</div>{index < stages.length - 1 && <span className="hierarchy-arrow">{isArabic ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}</span>}</div>)}</div>
    <div className="lecture-strip"><div><p className="eyebrow">{isArabic ? 'محاضرات المادة' : 'SUBJECT LECTURES'}</p><h3>{subjectId ? (isArabic ? 'محاضرات مرتبطة بالمادة المحددة' : 'Lectures for selected subject') : (isArabic ? 'اختر مادة لعرض محاضراتها' : 'Select a subject to view lectures')}</h3></div><Presentation size={25} />{subjectId && <button type="button" className="primary-action compact" onClick={() => setForm({ ...form, kind: 'lecture', name: '', nameEn: '', code: '', duration: '', description: '', instructor: '', source: '', number: String(lectures.length + 1) })}><Plus size={16} />{isArabic ? 'إضافة محاضرة' : 'Add lecture'}</button>}<div className="lecture-list">{lectures.map((lecture) => <article className={lecture.isArchived ? 'is-archived' : ''} key={lecture.id}><b>#{lecture.lectureNumber}</b><span><strong>{label(isArabic, lecture)}</strong><small>{lecture.durationMinutes ? `${lecture.durationMinutes} min` : '—'}</small>{lecture.instructorName && <small>{isArabic ? `المحاضر: ${lecture.instructorName}` : `Instructor: ${lecture.instructorName}`}</small>}{lecture.sourceReference && <small>{isArabic ? `المصدر: ${lecture.sourceReference}` : `Source: ${lecture.sourceReference}`}</small>}{lecture.isArchived && <em>{isArabic ? 'مؤرشف' : 'Archived'}</em>}{lecture.status === 'draft' && <em className="draft-state">{isArabic ? 'مسودة' : 'Draft'}</em>}</span>{lecture.status === 'draft' && !lecture.isArchived && <button type="button" className="publish-action" disabled={busy} title={isArabic ? 'نشر المحاضرة' : 'Publish lecture'} onClick={() => void publishLecture(lecture.id)}><Send size={14} /></button>}<button type="button" className="lifecycle-action" disabled={busy} title={lecture.isArchived ? (isArabic ? 'استعادة' : 'Restore') : (isArabic ? 'أرشفة' : 'Archive')} onClick={() => void setArchiveState('lecture', lecture.id, lecture.isArchived)}>{lecture.isArchived ? <RotateCcw size={14} /> : <Archive size={14} />}</button></article>)}</div></div>
    <form className="academic-form" onSubmit={submit}><div><p className="eyebrow">{isArabic ? 'إجراء إنشاء' : 'CREATE ACTION'}</p><h3>{isArabic ? 'إضافة عنصر إلى الهيكل' : 'Add hierarchy item'}</h3></div><label>{isArabic ? 'النوع' : 'Type'}<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as typeof form.kind })}><option value="university">{isArabic ? 'جامعة' : 'University'}</option><option value="college">{isArabic ? 'كلية' : 'College'}</option><option value="year">{isArabic ? 'سنة' : 'Academic year'}</option><option value="semester">{isArabic ? 'فصل' : 'Semester'}</option><option value="subject">{isArabic ? 'مادة' : 'Subject'}</option><option value="lecture">{isArabic ? 'محاضرة' : 'Lecture'}</option></select></label><label>{isArabic ? 'الاسم العربي' : 'Arabic name'}<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>{isArabic ? 'الاسم الإنجليزي' : 'English name'}<input value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></label>{['year', 'semester', 'lecture'].includes(form.kind) && <label>{isArabic ? 'الترتيب أو الرقم' : 'Order / number'}<input type="number" min="1" value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} /></label>}{form.kind === 'subject' && <label>{isArabic ? 'رمز المادة' : 'Subject code'}<input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>}{form.kind === 'lecture' && <><label>{isArabic ? 'المدة بالدقائق' : 'Duration (minutes)'}<input type="number" min="1" value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} /></label><label>{isArabic ? 'اسم المحاضر' : 'Instructor name'}<input value={form.instructor} onChange={(event) => setForm({ ...form, instructor: event.target.value })} /></label><label>{isArabic ? 'المصدر أو المرجع' : 'Source / reference'}<input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label><label>{isArabic ? 'وصف المحاضرة' : 'Lecture description'}<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label></>}<button className="primary-action" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}<Plus size={16} />{isArabic ? 'حفظ' : 'Save'}</button></form>
  </section>;
}
