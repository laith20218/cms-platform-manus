/**
 * ScopePicker — cascading academic scope selector (University → College → Year → Subject).
 *
 * Used in the create-admin / edit-admin dialogs to assign an admin's scope.
 * - Parent must be selected before child (cascade).
 * - Empty selection at a level means "all of that level" (broader scope).
 * - When a parent changes, all children reset.
 * - Displays the currently-selected scope names from the admin being edited (if any).
 *
 * Data source (existing endpoints — no new ones needed):
 *   GET /api/v1/universities?Page=1&PageSize=100
 *   GET /api/v1/universities/{id}/colleges
 *   GET /api/v1/colleges/{id}/years
 *   GET /api/v1/years/{id}/semesters
 *   GET /api/v1/semesters/{id}/subjects
 *
 * Note: Year and Subject are selected directly (skipping Semester) because Admin.SetScope
 * only accepts University, College, Year, Subject. The cascade loads the full hierarchy
 * but the picker exposes only the levels the backend stores.
 */
import { useEffect, useState } from 'react';
import { Building2, School, GraduationCap, Stethoscope, LoaderCircle, Info } from 'lucide-react';
import { apiRequest } from '../lib/api';

type University = { id: string; nameAr: string; nameEn?: string | null };
type College = { id: string; nameAr: string; nameEn?: string | null; universityId: string };
type AcademicYear = { id: string; nameAr: string; nameEn?: string | null; collegeId: string };
type Semester = { id: string; nameAr: string; nameEn?: string | null; academicYearId: string };
type Subject = { id: string; nameAr: string; nameEn?: string | null; semesterId: string };

export type ScopeState = {
  universityId: string;
  collegeId: string;
  yearId: string;
  subjectId: string;
};

type Props = {
  token: string;
  isArabic: boolean;
  value: ScopeState;
  onChange: (next: ScopeState) => void;
  // Resolved names from the admin being edited (optional — for display context)
  existingNames?: {
    universityName?: string | null;
    collegeName?: string | null;
    yearName?: string | null;
    subjectName?: string | null;
  };
};

const label = (item: { nameAr: string; nameEn?: string | null }, isArabic: boolean) =>
  isArabic ? item.nameAr : (item.nameEn || item.nameAr);

const selectClass = "w-full h-9 rounded-lg border text-xs px-2 disabled:opacity-50 disabled:cursor-not-allowed";
const labelClass = "block text-[11px] font-semibold mb-1";

export function ScopePicker({ token, isArabic, value, onChange, existingNames }: Props) {
  const [universities, setUniversities] = useState<University[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [, setSemesters] = useState<Semester[]>([]);  // internal cascade state — subjects depend on the first semester
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState<string>('');

  // Load universities once on mount
  useEffect(() => {
    if (!token) return;
    setLoading('universities');
    apiRequest<{ items: University[] } | University[]>('/api/v1/universities?Page=1&PageSize=100', token)
      .then(res => setUniversities(Array.isArray(res) ? res : (res.items ?? [])))
      .catch(() => setUniversities([]))
      .finally(() => setLoading(''));
  }, [token]);

  // Load colleges when university changes
  useEffect(() => {
    if (!token || !value.universityId) { setColleges([]); return; }
    setLoading('colleges');
    apiRequest<College[]>(`/api/v1/universities/${value.universityId}/colleges`, token)
      .then(res => setColleges(Array.isArray(res) ? res : []))
      .catch(() => setColleges([]))
      .finally(() => setLoading(''));
  }, [token, value.universityId]);

  // Load years when college changes
  useEffect(() => {
    if (!token || !value.collegeId) { setYears([]); return; }
    setLoading('years');
    apiRequest<AcademicYear[]>(`/api/v1/colleges/${value.collegeId}/years`, token)
      .then(res => setYears(Array.isArray(res) ? res : []))
      .catch(() => setYears([]))
      .finally(() => setLoading(''));
  }, [token, value.collegeId]);

  // Load semesters when year changes (needed to reach subjects)
  useEffect(() => {
    if (!token || !value.yearId) { setSemesters([]); setSubjects([]); return; }
    setLoading('semesters');
    apiRequest<Semester[]>(`/api/v1/years/${value.yearId}/semesters`, token)
      .then(async res => {
        const sems = Array.isArray(res) ? res : [];
        setSemesters(sems);
        // Auto-load subjects from the first semester (admin scope is subject-level, not semester-level)
        if (sems.length > 0) {
          setLoading('subjects');
          try {
            const subs = await apiRequest<Subject[]>(`/api/v1/semesters/${sems[0].id}/subjects`, token);
            setSubjects(Array.isArray(subs) ? subs : []);
          } catch { setSubjects([]); }
        } else {
          setSubjects([]);
        }
      })
      .catch(() => { setSemesters([]); setSubjects([]); })
      .finally(() => setLoading(''));
  }, [token, value.yearId]);

  const t = isArabic
    ? {
        university: 'الجامعة', college: 'الكلية', year: 'السنة', subject: 'المادة',
        allUniversities: 'كل الجامعات', allColleges: 'كل الكليات', allYears: 'كل السنوات', allSubjects: 'كل المواد',
        selectUniversity: 'اختر الجامعة', selectCollege: 'اختر الكلية', selectYear: 'اختر السنة', selectSubject: 'اختر المادة',
        scopeHint: 'النطاق الفارغ يعني "كل المستوى". الاختيار يتدرّج: يجب اختيار الأب قبل الابن.',
        currentScope: 'النطاق الحالي',
      }
    : {
        university: 'University', college: 'College', year: 'Year', subject: 'Subject',
        allUniversities: 'All universities', allColleges: 'All colleges', allYears: 'All years', allSubjects: 'All subjects',
        selectUniversity: 'Select university', selectCollege: 'Select college', selectYear: 'Select year', selectSubject: 'Select subject',
        scopeHint: 'Empty scope means "all at this level". Selection cascades: parent must be chosen before child.',
        currentScope: 'Current scope',
      };

  const hasExistingNames = existingNames && (existingNames.universityName || existingNames.collegeName || existingNames.yearName || existingNames.subjectName);

  return (
    <div className="space-y-3">
      {/* Existing scope (read-only display for edit-admin) */}
      {hasExistingNames && (
        <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
          <div className="text-[10px] font-semibold uppercase mb-1" style={{ color: 'var(--cms-text-muted)' }}>{t.currentScope}</div>
          <div className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>
            {existingNames!.universityName || '—'} › {existingNames!.collegeName || '—'} › {existingNames!.yearName || '—'} › {existingNames!.subjectName || '—'}
          </div>
        </div>
      )}

      {/* Hint */}
      <div className="flex items-start gap-2 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>{t.scopeHint}</span>
      </div>

      {/* Cascade selects */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* University */}
        <div>
          <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>
            <Building2 size={11} className="inline mr-1" />
            {t.university}
          </label>
          <select
            value={value.universityId}
            onChange={(e) => onChange({ universityId: e.target.value, collegeId: '', yearId: '', subjectId: '' })}
            className={selectClass}
            style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
            disabled={loading === 'universities'}
          >
            <option value="">{t.allUniversities}</option>
            {universities.map(u => <option key={u.id} value={u.id}>{label(u, isArabic)}</option>)}
          </select>
        </div>

        {/* College */}
        <div>
          <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>
            <School size={11} className="inline mr-1" />
            {t.college}
          </label>
          <select
            value={value.collegeId}
            onChange={(e) => onChange({ universityId: value.universityId, collegeId: e.target.value, yearId: '', subjectId: '' })}
            className={selectClass}
            style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
            disabled={!value.universityId || loading === 'colleges'}
          >
            <option value="">{t.allColleges}</option>
            {colleges.map(c => <option key={c.id} value={c.id}>{label(c, isArabic)}</option>)}
          </select>
        </div>

        {/* Year */}
        <div>
          <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>
            <GraduationCap size={11} className="inline mr-1" />
            {t.year}
          </label>
          <select
            value={value.yearId}
            onChange={(e) => onChange({ ...value, yearId: e.target.value, subjectId: '' })}
            className={selectClass}
            style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
            disabled={!value.collegeId || loading === 'years'}
          >
            <option value="">{t.allYears}</option>
            {years.map(y => <option key={y.id} value={y.id}>{label(y, isArabic)}</option>)}
          </select>
        </div>

        {/* Subject */}
        <div>
          <label className={labelClass} style={{ color: 'var(--cms-text-soft)' }}>
            <Stethoscope size={11} className="inline mr-1" />
            {t.subject}
          </label>
          <select
            value={value.subjectId}
            onChange={(e) => onChange({ ...value, subjectId: e.target.value })}
            className={selectClass}
            style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
            disabled={!value.yearId || loading === 'subjects' || loading === 'semesters'}
          >
            <option value="">{t.allSubjects}</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{label(s, isArabic)}</option>)}
          </select>
        </div>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
          <LoaderCircle size={11} className="animate-spin" />
          {isArabic ? 'جارٍ التحميل...' : 'Loading...'}
        </div>
      )}
    </div>
  );
}
