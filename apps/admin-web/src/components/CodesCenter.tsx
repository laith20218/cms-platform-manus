/** CodesCenter — premium Tailwind redesign. Restrained ivory panels, navy labels, teal confirmations. */
import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, BadgeCheck, Ban, Copy, Check, Download, KeyRound, LoaderCircle, Plus, RefreshCw, Search, UsersRound, Ticket, UserPlus } from 'lucide-react';
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

const statusChipClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'active') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (value === 'revoked') return 'text-red-600 bg-red-50 border-red-200';
  if (value === 'expired') return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

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
  const [revokeTarget, setRevokeTarget] = useState<CodeItem | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  // AREA 2: filters + multi-select + manual activation
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterScopeType, setFilterScopeType] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activateTarget, setActivateTarget] = useState<CodeItem | null>(null);
  const [activateStudentQuery, setActivateStudentQuery] = useState('');
  const [activateStudents, setActivateStudents] = useState<Array<{ id: string; fullName: string; phone: string }>>([]);
  const [activateStudentId, setActivateStudentId] = useState('');
  const [activateLoading, setActivateLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);
  const isYearCode = form.contentScope === 'full_year';
  const selectedScopeId = isYearCode ? yearId : subjectId;
  const selectedScopeType = isYearCode ? 'year' : 'subject';

  const loadCodes = async (status = filterStatus, search = filterSearch, scopeType = filterScopeType) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '100' });
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      if (scopeType) params.set('scopeType', scopeType);
      setCodes((await request<PagedResult<CodeItem>>(`/api/v1/admin/codes?${params.toString()}`)).items);
      setSelectedIds(new Set());
    }
    catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setLoading(false); }
  };
  const loadUniversities = async () => setUniversities((await request<PagedResult<University>>('/api/v1/universities?Page=1&PageSize=100')).items);
  // The initial load must run once; later interactions refresh the relevant data explicitly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function revoke(code: CodeItem, reason: string) {
    setBusy(true);
    try {
      const result = await request<{ revokedSubscriptions: number }>(`/api/v1/admin/codes/${code.id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) });
      await loadCodes();
      onNotice(isArabic ? `أُلغي الرمز وسُحب وصول ${result.revokedSubscriptions} اشتراكًا.` : `Code revoked; ${result.revokedSubscriptions} subscription(s) withdrawn.`);
      setRevokeTarget(null);
      setRevokeReason('');
    } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setBusy(false); }
  }

  // AREA 2: copy code to clipboard
  async function copyCode(code: CodeItem) {
    try {
      await navigator.clipboard.writeText(code.code);
      setCopiedId(code.id);
      setTimeout(() => setCopiedId(null), 1500);
      onNotice(isArabic ? 'تم نسخ الكود.' : 'Code copied.');
    } catch { onError(isArabic ? 'تعذّر النسخ.' : 'Copy failed.'); }
  }

  // AREA 2: export codes to CSV
  function exportCsv() {
    if (codes.length === 0) { onError(isArabic ? 'لا توجد أكواد للتصدير.' : 'No codes to export.'); return; }
    const headers = ['Code', 'Status', 'ScopeType', 'ContentScope', 'IsPublic', 'ScopeName', 'RedemptionCount', 'CreatedAt', 'ExpiresAt', 'UsedAt', 'UsedByName'];
    const rows = codes.map(c => [c.code, c.status, c.scopeType, c.contentScope, c.isPublic ? 'Yes' : 'No', c.scopeName || '', c.redemptionCount, c.createdAt, c.expiresAt || '', c.usedAt || '', c.usedByName || '']);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => typeof c === 'string' && c.includes(',') ? `"${c.replace(/"/g, '""')}"` : c).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `access-codes-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // AREA 2: bulk revoke selected codes
  async function bulkRevoke() {
    if (selectedIds.size === 0) return;
    setBusy(true);
    let success = 0;
    for (const id of selectedIds) {
      try {
        await request(`/api/v1/admin/codes/${id}/revoke`, { method: 'POST', body: JSON.stringify({ reason: 'Bulk revoke by admin' }) });
        success++;
      } catch { /* continue */ }
    }
    setBusy(false);
    await loadCodes();
    onNotice(isArabic ? `تم إبطال ${success} كود.` : `${success} code(s) revoked.`);
  }

  // AREA 2: search students for manual activation
  async function searchStudents(query: string) {
    setActivateStudentQuery(query);
    if (query.trim().length < 3) { setActivateStudents([]); return; }
    try {
      const data = await request<PagedResult<{ id: string; fullName: string; phone: string }>>(`/api/v1/admin/students?page=1&pageSize=10&search=${encodeURIComponent(query.trim())}`);
      setActivateStudents(data.items || []);
    } catch { setActivateStudents([]); }
  }

  // AREA 2: manually activate a code for a student
  async function manuallyActivate(code: CodeItem, studentId: string) {
    if (!studentId) { onError(isArabic ? 'اختر طالبًا أولاً.' : 'Select a student first.'); return; }
    setActivateLoading(true);
    try {
      await request(`/api/v1/admin/codes/${code.id}/activate`, { method: 'POST', body: JSON.stringify({ studentId }) });
      onNotice(isArabic ? 'تم تفعيل الكود للطالب.' : 'Code activated for student.');
      setActivateTarget(null); setActivateStudentQuery(''); setActivateStudents([]); setActivateStudentId('');
      await loadCodes();
    } catch (error) { onError(error instanceof Error ? error.message : 'Activation failed.'); }
    finally { setActivateLoading(false); }
  }

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'سياسة الوصول' : 'Access policy'}</p>
            <h2 className="text-2xl font-bold text-slate-900">{isArabic ? 'رموز الوصول' : 'Access codes'}</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">{isArabic ? 'يتحكم الرمز في نوع المحتوى ونطاقه الأكاديمي، ولا يُمنح الوصول من الواجهة.' : 'Every code defines content and academic scope; access is issued by the server only.'}</p>
          </div>
        </div>
        <button type="button" disabled={loading} onClick={() => void loadCodes()} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50">
          {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}{isArabic ? 'تحديث' : 'Refresh'}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.25fr] gap-5 items-start">
        {/* Codes form */}
        <form onSubmit={generate} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'إنشاء رمز' : 'Create code'}</p>
              <h3 className="text-base font-bold text-slate-900">{isArabic ? 'نطاق وصول مضبوط' : 'Controlled access scope'}</h3>
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'نوع المحتوى' : 'Content scope'}</span>
            <select value={form.contentScope} onChange={(event) => setForm({ ...form, contentScope: event.target.value as ContentScope })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              {scopeChoices.map((scope) => <option key={scope.value} value={scope.value}>{isArabic ? scope.ar : scope.en}</option>)}
            </select>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg bg-teal-50/40 border border-teal-200 cursor-pointer">
            <input type="checkbox" checked={form.isPublic} onChange={(event) => setForm({ ...form, isPublic: event.target.checked })} className="mt-0.5 h-4 w-4 accent-teal-600" />
            <span className="flex flex-col gap-0.5">
              <strong className="text-sm font-semibold text-slate-900">{isArabic ? 'رمز عام مجاني' : 'Public free code'}</strong>
              <small className="text-xs text-slate-500">{isArabic ? 'يمكن لكل طالب مسجّل استرداده مرة واحدة.' : 'Each registered student may redeem it once.'}</small>
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الجامعة' : 'University'}</span>
              <select value={universityId} onChange={(event) => void chooseUniversity(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">{isArabic ? 'اختر الجامعة' : 'Choose university'}</option>
                {universities.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الكلية' : 'College'}</span>
              <select value={collegeId} disabled={!universityId} onChange={(event) => void chooseCollege(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">{isArabic ? 'اختر الكلية' : 'Choose college'}</option>
                {colleges.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'السنة' : 'Academic year'}</span>
              <select value={yearId} disabled={!collegeId} onChange={(event) => void chooseYear(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">{isArabic ? 'اختر السنة' : 'Choose year'}</option>
                {years.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
              </select>
            </label>
            {!isYearCode && (
              <>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الفصل' : 'Semester'}</span>
                  <select value={semesterId} disabled={!yearId} onChange={(event) => void chooseSemester(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">{isArabic ? 'اختر الفصل' : 'Choose semester'}</option>
                    {semesters.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'المادة' : 'Subject'}</span>
                  <select value={subjectId} disabled={!semesterId} onChange={(event) => setSubjectId(event.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">{isArabic ? 'اختر المادة' : 'Choose subject'}</option>
                    {subjects.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}{item.code ? ` — ${item.code}` : ''}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'الكمية' : 'Quantity'}</span>
              <input min="1" max="1000" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'المدة بالأيام' : 'Duration in days'}</span>
              <input min="0" type="number" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })} required className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <small className="block mt-1 text-[10px] text-slate-400">{isArabic ? '0 = وصول دائم' : '0 = permanent access'}</small>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'بادئة الرمز (اختياري)' : 'Code prefix (optional)'}</span>
              <input value={form.prefix} onChange={(event) => setForm({ ...form, prefix: event.target.value.toUpperCase() })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono" />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'تاريخ انتهاء الرمز (اختياري)' : 'Code expiry (optional)'}</span>
              <input type="datetime-local" value={form.codeExpiresAt} onChange={(event) => setForm({ ...form, codeExpiresAt: event.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-teal-50 border border-teal-200 p-3 text-teal-700">
            <BadgeCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="text-xs">{isArabic ? `${scopeChoices.find((s) => s.value === form.contentScope)?.ar ?? ''}: ${form.isPublic ? 'متاح لكل طالب مسجل مرة واحدة.' : 'يملكه أول طالب مسجل يسترده.'}` : `${scopeChoices.find((s) => s.value === form.contentScope)?.en ?? ''}: ${form.isPublic ? 'available once to every registered student.' : 'owned by the first registered student to redeem it.'}`}</span>
          </div>

          <button className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50" disabled={busy} type="submit">
            {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{isArabic ? 'إنشاء الرموز' : 'Generate codes'}
          </button>
        </form>

        {/* Code ledger */}
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{isArabic ? 'سجل الرموز' : 'Code ledger'}</p>
              <h3 className="text-base font-bold text-slate-900">{isArabic ? 'الأكواد المنشأة' : 'Generated codes'}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={exportCsv} disabled={codes.length === 0} title={isArabic ? 'تصدير CSV' : 'Export CSV'} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50">
                <Download className="w-3.5 h-3.5" />CSV
              </button>
              {selectedIds.size > 0 && (
                <button type="button" onClick={() => void bulkRevoke()} disabled={busy} title={isArabic ? 'إبطال المحدد' : 'Revoke selected'} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 bg-white hover:bg-red-50 transition-colors disabled:opacity-50">
                  {busy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}{selectedIds.size}
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-bold">
                <UsersRound className="w-3.5 h-3.5" />{codes.length}
              </span>
            </div>
          </div>
          {/* AREA 2: Filters bar */}
          <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input value={filterSearch} onChange={(e) => { setFilterSearch(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') void loadCodes(filterStatus, filterSearch, filterScopeType); }} placeholder={isArabic ? 'بحث بالكود...' : 'Search by code...'} className="w-full pr-8 pl-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); void loadCodes(e.target.value, filterSearch, filterScopeType); }} className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">{isArabic ? 'كل الحالات' : 'All status'}</option>
              <option value="Active">{isArabic ? 'نشط' : 'Active'}</option>
              <option value="Used">{isArabic ? 'مستخدم' : 'Used'}</option>
              <option value="Revoked">{isArabic ? 'ملغي' : 'Revoked'}</option>
              <option value="Expired">{isArabic ? 'منتهي' : 'Expired'}</option>
            </select>
            <select value={filterScopeType} onChange={(e) => { setFilterScopeType(e.target.value); void loadCodes(filterStatus, filterSearch, e.target.value); }} className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">{isArabic ? 'كل النطاقات' : 'All scopes'}</option>
              <option value="subject">{isArabic ? 'مادة' : 'Subject'}</option>
              <option value="year">{isArabic ? 'سنة' : 'Year'}</option>
              <option value="semester">{isArabic ? 'فصل' : 'Semester'}</option>
              <option value="college">{isArabic ? 'كلية' : 'College'}</option>
              <option value="university">{isArabic ? 'جامعة' : 'University'}</option>
            </select>
            <button type="button" onClick={() => void loadCodes(filterStatus, filterSearch, filterScopeType)} disabled={loading} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50">
              {loading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}{isArabic ? 'بحث' : 'Search'}
            </button>
          </div>
          <div className="p-3 max-h-[36rem] overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-2">
                {[0, 1, 2, 3, 4].map((row) => (
                  <div key={row} className="flex items-center gap-3 p-2">
                    <div className="h-5 w-32 rounded bg-slate-100 animate-pulse" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 rounded bg-slate-100 animate-pulse w-1/2" />
                      <div className="h-2.5 rounded bg-slate-100 animate-pulse w-1/4" />
                    </div>
                    <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : codes.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 text-slate-500">
                <KeyRound className="w-6 h-6 text-slate-300" />
                <p className="mt-2 text-sm">{isArabic ? 'لا توجد رموز ضمن نطاقك.' : 'No codes exist in your scope.'}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {codes.map((code) => {
                  const inactive = code.status.toLowerCase() !== 'active';
                  return (
                    <article key={code.id} className={`flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors ${inactive ? 'opacity-60' : ''}`}>
                      {/* AREA 2: multi-select checkbox */}
                      {code.status.toLowerCase() === 'active' && (
                        <input type="checkbox" checked={selectedIds.has(code.id)} onChange={(e) => { const next = new Set(selectedIds); if (e.target.checked) next.add(code.id); else next.delete(code.id); setSelectedIds(next); }} className="h-4 w-4 accent-teal-600 shrink-0" />
                      )}
                      <div className="min-w-0 md:w-48">
                        <div className="flex items-center gap-1">
                          <code className="block font-mono text-sm text-slate-900 break-all">{code.code}</code>
                          {/* AREA 2: copy button */}
                          <button type="button" onClick={() => void copyCode(code)} title={isArabic ? 'نسخ' : 'Copy'} className="shrink-0 p-1 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                            {copiedId === code.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <small className={`mt-0.5 inline-block text-[10px] font-bold uppercase tracking-wide ${code.isPublic ? 'text-teal-700' : 'text-slate-500'}`}>{code.isPublic ? (isArabic ? 'عام' : 'Public') : (isArabic ? 'خاص' : 'Private')}</small>
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <strong className="block text-sm font-medium text-slate-900">{scopeChoices.find((scope) => scope.value === code.contentScope)?.[isArabic ? 'ar' : 'en'] ?? code.contentScope}</strong>
                        <span className="block text-xs text-slate-500 truncate">{code.scopeName || code.scopeType}</span>
                        <small className="block text-xs text-slate-400">{isArabic ? `${code.redemptionCount} تفعيل` : `${code.redemptionCount} redemption(s)`}</small>
                      </div>
                      <div className="flex items-center gap-2 md:flex-col md:items-end">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${statusChipClass(code.status)}`}>{code.status}</span>
                        {code.expiresAt && <small className="text-xs text-slate-400">{new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(code.expiresAt))}</small>}</div>
                      <div className="flex items-center gap-1">
                        {/* AREA 2: manual activation button */}
                        {code.status.toLowerCase() === 'active' && (
                          <button type="button" disabled={busy} title={isArabic ? 'تفعيل يدوي لطالب' : 'Activate for student'} onClick={() => { setActivateTarget(code); setActivateStudentQuery(''); setActivateStudents([]); setActivateStudentId(''); }} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-teal-200 text-xs font-medium text-teal-700 bg-white hover:bg-teal-50 transition-colors disabled:opacity-50">
                            <UserPlus className="w-3.5 h-3.5" />{isArabic ? 'تفعيل' : 'Activate'}
                          </button>
                        )}
                        {code.status.toLowerCase() === 'active' && (
                          <button type="button" disabled={busy} title={isArabic ? 'إبطال شامل' : 'Revoke all'} onClick={() => { setRevokeTarget(code); setRevokeReason(''); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 bg-white hover:bg-red-50 transition-colors disabled:opacity-50">
                            <Ban className="w-3.5 h-3.5" />{isArabic ? 'إبطال' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* AREA 2: Manual activation modal */}
      {activateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={() => !activateLoading && setActivateTarget(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full shadow-xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3 p-5 border-b border-slate-200">
              <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
                <UserPlus className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">{isArabic ? 'تفعيل يدوي للكود' : 'Manual code activation'}</h3>
                <p className="text-sm text-slate-600 mt-1">{isArabic ? 'اختر طالبًا لتفعيل هذا الكود له مباشرة.' : 'Select a student to activate this code for.'}</p>
                <p className="text-sm font-mono font-medium text-slate-900 mt-2 break-all">{activateTarget.code}</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'بحث عن طالب' : 'Search student'}</label>
                <input value={activateStudentQuery} onChange={(e) => void searchStudents(e.target.value)} placeholder={isArabic ? 'الاسم أو الهاتف...' : 'Name or phone...'} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              {activateStudents.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {activateStudents.map(s => (
                    <button key={s.id} type="button" onClick={() => setActivateStudentId(s.id)} className={`w-full text-left flex items-center gap-2 p-2 rounded-lg border transition-colors ${activateStudentId === s.id ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <UsersRound className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{s.fullName}</p>
                        <p className="text-xs text-slate-500">{s.phone}</p>
                      </div>
                      {activateStudentId === s.id && <Check className="w-4 h-4 text-teal-600 shrink-0 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setActivateTarget(null)} disabled={activateLoading} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">{isArabic ? 'إلغاء' : 'Cancel'}</button>
                <button type="button" onClick={() => void manuallyActivate(activateTarget, activateStudentId)} disabled={activateLoading || !activateStudentId} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50">
                  {activateLoading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}{isArabic ? 'تفعيل' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirmation modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={() => !busy && setRevokeTarget(null)}>
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3 p-5 border-b border-slate-200">
              <div className="p-2 rounded-lg bg-red-50 text-red-600">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{isArabic ? 'إبطال الرمز' : 'Revoke code'}</h3>
                <p className="text-sm text-slate-600 mt-1">{isArabic ? 'سيُسحب وصول جميع من استرد هذا الرمز. لا يمكن التراجع.' : 'All students who redeemed this code will lose access. This cannot be undone.'}</p>
                <p className="text-sm font-mono font-medium text-slate-900 mt-2 break-all">{revokeTarget.code}</p>
              </div>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); if (!revokeReason.trim()) { onError(isArabic ? 'أدخل سبب الإبطال.' : 'Provide a revoke reason.'); return; } void revoke(revokeTarget, revokeReason.trim()); }} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{isArabic ? 'سبب الإبطال' : 'Revoke reason'}</label>
                <textarea required rows={3} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} placeholder={isArabic ? 'سبب واضح وآمن للتدقيق.' : 'A clear, audit-safe reason.'} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setRevokeTarget(null)} disabled={busy} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">{isArabic ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}{isArabic ? 'تأكيد الإبطال' : 'Confirm revoke'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
