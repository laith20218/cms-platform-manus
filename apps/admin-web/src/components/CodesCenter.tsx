/** Style reminder — غرفة القيادة السريرية: restrained ivory panels, navy labels, teal confirmations, and real production data only. */
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Ban, KeyRound, LoaderCircle, Plus, RefreshCw, UsersRound } from 'lucide-react';
import { apiRequest, type PagedResult } from '../lib/api';

type University = { id: string; nameAr: string; nameEn?: string | null };
type College = { id: string; nameAr: string; nameEn?: string | null };
type AcademicYear = { id: string; nameAr: string; nameEn?: string | null; yearNumber: number };
type Semester = { id: string; nameAr: string; nameEn?: string | null };
type Subject = { id: string; nameAr: string; nameEn?: string | null; code?: string | null };
type CodeItem = { id: string; code: string; scopeType: string; contentScope: string; isPublic: boolean; scopeName?: string | null; status: string; usedAt?: string | null; usedByName?: string | null; createdAt: string; expiresAt?: string | null; redemptionCount: number };
type ContentScope = 'questions_exams' | 'lectures_text' | 'video_audio' | 'full_subject' | 'full_year';

type Props = { token: string; isArabic: boolean; onError: (message: string) => void; onNotice: (message: string) => void };

const displayName = (arabic: boolean, item: { nameAr: string; nameEn?: string | null }) => arabic ? item.nameAr : (item.nameEn || item.nameAr);
const scopeChoices: Array<{ value: ContentScope; ar: string; en: string }> = [
  { value: 'questions_exams', ar: 'أسئلة واختبارات مادة', en: 'Subject questions & exams' },
  { value: 'lectures_text', ar: 'محاضرات وملفات نصية', en: 'Lectures & text files' },
  { value: 'video_audio', ar: 'فيديو وتسجيلات صوتية', en: 'Video & audio' },
  { value: 'full_subject', ar: 'مادة كاملة', en: 'Full subject' },
  { value: 'full_year', ar: 'سنة كاملة', en: 'Full academic year' },
];

export function CodesCenter({ token, isArabic, onError, onNotice }: Props) {
  const [codes, setCodes] = useState<CodeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [universities, setUniversities] = useState<University[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [universityId, setUniversityId] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [yearId, setYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [form, setForm] = useState({ contentScope: 'questions_exams' as ContentScope, isPublic: false, quantity: '1', durationDays: '0', prefix: '', codeExpiresAt: '' });

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);
  const isYearCode = form.contentScope === 'full_year';
  const selectedScopeId = isYearCode ? yearId : subjectId;
  const selectedScopeType = isYearCode ? 'year' : 'subject';

  const loadCodes = async () => {
    setLoading(true);
    try { setCodes((await request<PagedResult<CodeItem>>('/api/v1/admin/codes?page=1&pageSize=100')).items); }
    catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setLoading(false); }
  };
  const loadUniversities = async () => setUniversities((await request<PagedResult<University>>('/api/v1/universities?Page=1&PageSize=100')).items);
  useEffect(() => { void Promise.all([loadCodes(), loadUniversities()]); }, []);

  async function chooseUniversity(id: string) {
    setUniversityId(id); setCollegeId(''); setYearId(''); setSemesterId(''); setSubjectId(''); setYears([]); setSemesters([]); setSubjects([]);
    if (!id) { setColleges([]); return; }
    try { setColleges(await request<College[]>(`/api/v1/universities/${id}/colleges`)); } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); }
  }
  async function chooseCollege(id: string) {
    setCollegeId(id); setYearId(''); setSemesterId(''); setSubjectId(''); setSemesters([]); setSubjects([]);
    if (!id) { setYears([]); return; }
    try { setYears(await request<AcademicYear[]>(`/api/v1/colleges/${id}/years`)); } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); }
  }
  async function chooseYear(id: string) {
    setYearId(id); setSemesterId(''); setSubjectId(''); setSubjects([]);
    if (!id || isYearCode) { setSemesters([]); return; }
    try { setSemesters(await request<Semester[]>(`/api/v1/years/${id}/semesters`)); } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); }
  }
  async function chooseSemester(id: string) {
    setSemesterId(id); setSubjectId('');
    if (!id) { setSubjects([]); return; }
    try { setSubjects(await request<Subject[]>(`/api/v1/semesters/${id}/subjects`)); } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedScopeId) { onError(isArabic ? 'اختر نطاق الرمز الأكاديمي أولًا.' : 'Choose the academic code scope first.'); return; }
    setBusy(true);
    try {
      const payload = {
        scopeType: selectedScopeType,
        scopeId: selectedScopeId,
        durationDays: Number(form.durationDays),
        quantity: Number(form.quantity),
        prefix: form.prefix.trim() || null,
        codeExpiresAt: form.codeExpiresAt ? new Date(form.codeExpiresAt).toISOString() : null,
        contentScope: form.contentScope,
        isPublic: form.isPublic,
      };
      const result = await request<{ codes: string[] }>('/api/v1/admin/codes/generate', { method: 'POST', body: JSON.stringify(payload) });
      await loadCodes();
      onNotice(isArabic ? `تم إنشاء ${result.codes.length} رمز وصول.` : `${result.codes.length} access code(s) created.`);
    } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setBusy(false); }
  }

  async function revoke(code: CodeItem) {
    const reason = window.prompt(isArabic ? 'سبب إبطال الرمز وسحب وصول جميع مسترديه:' : 'Reason for revoking this code and all of its redemptions:');
    if (reason === null) return;
    setBusy(true);
    try {
      const result = await request<{ revokedSubscriptions: number }>(`/api/v1/admin/codes/${code.id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) });
      await loadCodes();
      onNotice(isArabic ? `أُلغي الرمز وسُحب وصول ${result.revokedSubscriptions} اشتراكًا.` : `Code revoked; ${result.revokedSubscriptions} subscription(s) withdrawn.`);
    } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setBusy(false); }
  }

  const scopeLabel = useMemo(() => scopeChoices.find((scope) => scope.value === form.contentScope), [form.contentScope]);
  return <section className="codes-center">
    <div className="directory-heading"><div><p className="eyebrow">{isArabic ? 'سياسة الوصول' : 'ACCESS POLICY'}</p><h2>{isArabic ? 'رموز الوصول' : 'Access codes'}</h2><p className="codes-heading-note">{isArabic ? 'يتحكم الرمز في نوع المحتوى ونطاقه الأكاديمي، ولا يُمنح الوصول من الواجهة.' : 'Every code defines content and academic scope; access is issued by the server only.'}</p></div><button className="secondary-action" type="button" disabled={loading} onClick={() => void loadCodes()}><RefreshCw size={16} />{isArabic ? 'تحديث' : 'Refresh'}</button></div>
    <div className="codes-layout">
      <form className="codes-form" onSubmit={generate}><div className="codes-form-title"><span className="card-icon teal"><KeyRound size={19} /></span><div><p className="eyebrow">{isArabic ? 'إنشاء رمز' : 'CREATE CODE'}</p><h3>{isArabic ? 'نطاق وصول مضبوط' : 'Controlled access scope'}</h3></div></div>
        <label>{isArabic ? 'نوع المحتوى' : 'Content scope'}<select value={form.contentScope} onChange={(event) => setForm({ ...form, contentScope: event.target.value as ContentScope })}>{scopeChoices.map((scope) => <option key={scope.value} value={scope.value}>{isArabic ? scope.ar : scope.en}</option>)}</select></label>
        <label className="code-public-toggle"><input type="checkbox" checked={form.isPublic} onChange={(event) => setForm({ ...form, isPublic: event.target.checked })} /><span><strong>{isArabic ? 'رمز عام مجاني' : 'Public free code'}</strong><small>{isArabic ? 'يمكن لكل طالب مسجّل استرداده مرة واحدة.' : 'Each registered student may redeem it once.'}</small></span></label>
        <div className="scope-chain"><label>{isArabic ? 'الجامعة' : 'University'}<select value={universityId} onChange={(event) => void chooseUniversity(event.target.value)}><option value="">{isArabic ? 'اختر الجامعة' : 'Choose university'}</option>{universities.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}</select></label><label>{isArabic ? 'الكلية' : 'College'}<select value={collegeId} disabled={!universityId} onChange={(event) => void chooseCollege(event.target.value)}><option value="">{isArabic ? 'اختر الكلية' : 'Choose college'}</option>{colleges.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}</select></label><label>{isArabic ? 'السنة' : 'Academic year'}<select value={yearId} disabled={!collegeId} onChange={(event) => void chooseYear(event.target.value)}><option value="">{isArabic ? 'اختر السنة' : 'Choose year'}</option>{years.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}</select></label>{!isYearCode && <><label>{isArabic ? 'الفصل' : 'Semester'}<select value={semesterId} disabled={!yearId} onChange={(event) => void chooseSemester(event.target.value)}><option value="">{isArabic ? 'اختر الفصل' : 'Choose semester'}</option>{semesters.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}</select></label><label>{isArabic ? 'المادة' : 'Subject'}<select value={subjectId} disabled={!semesterId} onChange={(event) => setSubjectId(event.target.value)}><option value="">{isArabic ? 'اختر المادة' : 'Choose subject'}</option>{subjects.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}{item.code ? ` — ${item.code}` : ''}</option>)}</select></label></>}</div>
        <div className="codes-form-grid"><label>{isArabic ? 'الكمية' : 'Quantity'}<input min="1" max="1000" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></label><label>{isArabic ? 'المدة بالأيام' : 'Duration in days'}<input min="0" type="number" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })} required /><small>{isArabic ? '0 = وصول دائم' : '0 = permanent access'}</small></label><label>{isArabic ? 'بادئة الرمز (اختياري)' : 'Code prefix (optional)'}<input value={form.prefix} onChange={(event) => setForm({ ...form, prefix: event.target.value.toUpperCase() })} /></label><label>{isArabic ? 'تاريخ انتهاء الرمز (اختياري)' : 'Code expiry (optional)'}<input type="datetime-local" value={form.codeExpiresAt} onChange={(event) => setForm({ ...form, codeExpiresAt: event.target.value })} /></label></div>
        <div className="code-policy-note"><BadgeCheck size={17} /><span>{isArabic ? `${scopeLabel?.ar ?? ''}: ${form.isPublic ? 'متاح لكل طالب مسجل مرة واحدة.' : 'يملكه أول طالب مسجل يسترده.'}` : `${scopeLabel?.en ?? ''}: ${form.isPublic ? 'available once to every registered student.' : 'owned by the first registered student to redeem it.'}`}</span></div>
        <button className="primary-action" disabled={busy} type="submit">{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{isArabic ? 'إنشاء الرموز' : 'Generate codes'}</button>
      </form>
      <section className="code-ledger"><div className="code-ledger-head"><div><p className="eyebrow">{isArabic ? 'سجل الرموز' : 'CODE LEDGER'}</p><h3>{isArabic ? 'الأكواد المنشأة' : 'Generated codes'}</h3></div><span><UsersRound size={16} />{codes.length}</span></div>{loading ? <div className="table-loading"><LoaderCircle className="spin" size={20} />{isArabic ? 'جارٍ تحميل الأكواد…' : 'Loading codes…'}</div> : codes.length === 0 ? <div className="table-empty"><KeyRound size={22} /><strong>{isArabic ? 'لا توجد رموز ضمن نطاقك.' : 'No codes exist in your scope.'}</strong></div> : <div className="code-list">{codes.map((code) => <article className={`code-row ${code.status.toLowerCase() !== 'active' ? 'is-inactive' : ''}`} key={code.id}><div className="code-token"><code>{code.code}</code><small>{code.isPublic ? (isArabic ? 'عام' : 'Public') : (isArabic ? 'خاص' : 'Private')}</small></div><div className="code-meta"><strong>{scopeChoices.find((scope) => scope.value === code.contentScope)?.[isArabic ? 'ar' : 'en'] ?? code.contentScope}</strong><span>{code.scopeName || code.scopeType}</span><small>{isArabic ? `${code.redemptionCount} تفعيل` : `${code.redemptionCount} redemption(s)`}</small></div><div className="code-state"><span className={`status-chip ${code.status.toLowerCase() === 'active' ? 'active' : 'disabled'}`}>{code.status}</span>{code.expiresAt && <small>{new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(code.expiresAt))}</small>}</div>{code.status.toLowerCase() === 'active' && <button className="danger code-revoke" disabled={busy} title={isArabic ? 'إبطال شامل' : 'Revoke all'} onClick={() => void revoke(code)}><Ban size={16} />{isArabic ? 'إبطال' : 'Revoke'}</button>}</article>)}</div>}</section>
    </div>
  </section>;
}
