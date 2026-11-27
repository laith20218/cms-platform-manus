/** CodesCenter — Night Task 5.4: modal-driven code management.
 *  The heavy permanent generate form became a focused modal; the main screen is
 *  a clean, filterable ledger (status / scope / year / subject / search) with
 *  per-code redemption detail (5.3) — who activated, what it unlocks, when it
 *  expires. Existing workflows (generate, copy, CSV, bulk revoke, manual
 *  activate, revoke) preserved 1:1. */
import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, BadgeCheck, Ban, Copy, Check, Download, Eye, KeyRound, LoaderCircle, Plus, RefreshCw, Search, UsersRound, Ticket, UserPlus } from 'lucide-react';
import { ConfirmDialog } from '@cms/ui';
import { apiRequest, type PagedResult } from '../lib/api';
import { useUiPermissions } from '../hooks/uiPermissionsContext';
import { t, localeOf, statusLabel } from '../lib/dictionary';

type University = { id: string; nameAr: string; nameEn?: string | null };
type College = { id: string; nameAr: string; nameEn?: string | null };
type AcademicYear = { id: string; nameAr: string; nameEn?: string | null; yearNumber: number };
type Semester = { id: string; nameAr: string; nameEn?: string | null };
type Subject = { id: string; nameAr: string; nameEn?: string | null; code?: string | null };
type CodeItem = { id: string; code: string; scopeType: string; contentScope: string; isPublic: boolean; scopeName?: string | null; status: string; usedAt?: string | null; usedByName?: string | null; createdAt: string; expiresAt?: string | null; redemptionCount: number };
type RedemptionRow = { subscriptionId: string; studentName?: string | null; studentPhone?: string | null; contentScope: string; subjectName?: string | null; scopeType: string; status: string; startsAt: string; expiresAt: string; revokedAt?: string | null; revocationReason?: string | null };
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
const contentScopeLabel = (value: string, arabic: boolean) => scopeChoices.find((s) => s.value === value)?.[arabic ? 'ar' : 'en'] ?? value;
const redemptionStatusChip = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'active') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (value === 'cancelled' || value === 'revoked') return 'text-red-600 bg-red-50 border-red-200';
  if (value === 'expired') return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

const statusChipClass = (status: string) => {
  const value = status.toLowerCase();
  if (value === 'active') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (value === 'revoked') return 'text-red-600 bg-red-50 border-red-200';
  if (value === 'expired') return 'text-amber-600 bg-amber-50 border-amber-200';
  if (value === 'used') return 'text-teal-600 bg-teal-50 border-teal-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
};

// W3 (admin-ui): code/subscription statuses must never render raw enum wire
// values (Active/Used/…) on the Arabic surface (debt D-23).
// PR-3: known values resolve through the central status registry (codeStatus /
// redemptionStatus domains — byte-identical to the legacy switch). The legacy
// unknown behavior is preserved exactly: Arabic «غير معروف»/«غير معروفة»,
// English raw pass-through (the `en` side of the dictionary entries never
// renders — see codes.statuses in the dictionary).
const codeStatusLabel = (status: string, isArabic: boolean) => {
  switch (status.toLowerCase()) {
    case 'active':
    case 'used':
    case 'revoked':
    case 'expired': return statusLabel(localeOf(isArabic), 'codeStatus', status);
    default: return isArabic ? t(localeOf(isArabic), 'codes.statuses.unknownCode') : status;
  }
};

const redemptionStatusLabel = (status: string, isArabic: boolean) => {
  switch (status.toLowerCase()) {
    case 'active':
    case 'cancelled':
    case 'revoked':
    case 'expired': return statusLabel(localeOf(isArabic), 'redemptionStatus', status);
    default: return isArabic ? t(localeOf(isArabic), 'codes.statuses.unknownRedemption') : status;
  }
};

export function CodesCenter({ token, isArabic, onError, onNotice }: Props) {
  const locale = localeOf(isArabic);
  // Push 3: cosmetic gating — the API policies remain the real boundary.
  // activate-for-student stays ungated (out-of-census control); backend policy is the gate.
  const { can } = useUiPermissions();
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
  // W3 (admin-ui): bulk revoke is destructive over N subscriptions — it needs
  // an explicit confirm with a mandatory reason (debt D-09: it previously
  // fired on a single click, silently swallowed per-item failures, and sent a
  // hardcoded English reason).
  const [bulkRevokeOpen, setBulkRevokeOpen] = useState(false);
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
  // Night Task 5.4 — the generate form lives in a modal now.
  const [generateOpen, setGenerateOpen] = useState(false);
  // Night Task 5.3 — academic filters (year + subject) on the ledger.
  const [filterYearId, setFilterYearId] = useState('');
  const [filterSubjectId, setFilterSubjectId] = useState('');
  const [filterColleges, setFilterColleges] = useState<College[]>([]);
  const [filterYears, setFilterYears] = useState<AcademicYear[]>([]);
  const [filterSemesters, setFilterSemesters] = useState<Semester[]>([]);
  const [filterSubjects, setFilterSubjects] = useState<Subject[]>([]);
  const [filterSemesterSelection, setFilterSemesterSelection] = useState('');
  const [filterUniversityId, setFilterUniversityId] = useState('');
  const [filterCollegeId, setFilterCollegeId] = useState('');
  // Night Task 5.3 — per-code redemption detail modal.
  const [redemptionsTarget, setRedemptionsTarget] = useState<CodeItem | null>(null);
  const [redemptions, setRedemptions] = useState<RedemptionRow[] | null>(null);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);

  const request = async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init);
  const isYearCode = form.contentScope === 'full_year';
  const selectedScopeId = isYearCode ? yearId : subjectId;
  const selectedScopeType = isYearCode ? 'year' : 'subject';

  const loadCodes = async (status = filterStatus, search = filterSearch, scopeType = filterScopeType, year = filterYearId, subject = filterSubjectId) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '100' });
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      if (scopeType) params.set('scopeType', scopeType);
      if (year) params.set('yearId', year);
      if (subject) params.set('subjectId', subject);
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

  // ===== Generate-modal cascade (unchanged logic) =====
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

  // ===== Night Task 5.3 — filter cascade (separate, light state) =====
  async function chooseFilterUniversity(id: string) {
    setFilterUniversityId(id); setFilterCollegeId(''); setFilterYearId(''); setFilterSubjectId('');
    setFilterYears([]); setFilterSemesters([]); setFilterSubjects([]);
    if (!id) { setFilterColleges([]); return; }
    try { setFilterColleges(await request<College[]>(`/api/v1/universities/${id}/colleges`)); } catch { setFilterColleges([]); }
  }
  async function chooseFilterCollege(id: string) {
    setFilterCollegeId(id); setFilterYearId(''); setFilterSubjectId('');
    setFilterSemesters([]); setFilterSubjects([]);
    if (!id) { setFilterYears([]); return; }
    try { setFilterYears(await request<AcademicYear[]>(`/api/v1/colleges/${id}/years`)); } catch { setFilterYears([]); }
  }
  async function chooseFilterYear(id: string) {
    setFilterYearId(id); setFilterSubjectId(''); setFilterSemesterSelection('');
    setFilterSubjects([]);
    if (!id) { setFilterSemesters([]); return; }
    try { setFilterSemesters(await request<Semester[]>(`/api/v1/years/${id}/semesters`)); } catch { setFilterSemesters([]); }
  }
  async function chooseFilterSemester(id: string) {
    setFilterSubjectId('');
    if (!id) { setFilterSubjects([]); return; }
    try { setFilterSubjects(await request<Subject[]>(`/api/v1/semesters/${id}/subjects`)); } catch { setFilterSubjects([]); }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedScopeId) { onError(t(locale, 'codes.errors.chooseScopeFirst')); return; }
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
      setGenerateOpen(false);
      await loadCodes();
      onNotice(t(locale, 'codes.toasts.generated', { count: result.codes.length }));
    } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setBusy(false); }
  }

  async function revoke(code: CodeItem, reason: string) {
    setBusy(true);
    try {
      const result = await request<{ revokedSubscriptions: number }>(`/api/v1/admin/codes/${code.id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) });
      await loadCodes();
      onNotice(t(locale, 'codes.toasts.revoked', { count: result.revokedSubscriptions }));
      setRevokeTarget(null);
      setRevokeReason('');
    } catch (error) { onError(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setBusy(false); }
  }

  async function copyCode(code: CodeItem) {
    try {
      await navigator.clipboard.writeText(code.code);
      setCopiedId(code.id);
      setTimeout(() => setCopiedId(null), 1500);
      onNotice(t(locale, 'codes.toasts.copied'));
    } catch { onError(t(locale, 'codes.errors.copyFailed')); }
  }

  function exportCsv() {
    if (codes.length === 0) { onError(t(locale, 'codes.errors.noCodesToExport')); return; }
    const headers = ['Code', 'Status', 'ScopeType', 'ContentScope', 'IsPublic', 'ScopeName', 'RedemptionCount', 'CreatedAt', 'ExpiresAt', 'UsedAt', 'UsedByName'];
    const rows = codes.map(c => [c.code, c.status, c.scopeType, c.contentScope, c.isPublic ? 'Yes' : 'No', c.scopeName || '', c.redemptionCount, c.createdAt, c.expiresAt || '', c.usedAt || '', c.usedByName || '']);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => typeof c === 'string' && c.includes(',') ? `"${c.replace(/"/g, '""')}"` : c).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `access-codes-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function bulkRevoke(reason: string) {
    if (selectedIds.size === 0) return;
    setBusy(true);
    const failed: string[] = [];
    let success = 0;
    for (const id of selectedIds) {
      try {
        await request(`/api/v1/admin/codes/${id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) });
        success++;
      } catch {
        const code = codes.find(item => item.id === id);
        failed.push(code?.code ?? id);
      }
    }
    setBusy(false);
    setBulkRevokeOpen(false);
    setSelectedIds(new Set());
    await loadCodes();
    if (failed.length > 0) {
      // Honest failure surfacing: the operator sees exactly which codes
      // survived (previously swallowed with /* continue */).
      onError(t(locale, 'codes.bulkRevoke.partialFailure', { success, failed: failed.length, list: failed.join(t(locale, 'codes.bulkRevoke.listSeparator')) }));
    } else {
      onNotice(t(locale, 'codes.bulkRevoke.success', { count: success }));
    }
  }

  async function searchStudents(query: string) {
    setActivateStudentQuery(query);
    if (query.trim().length < 3) { setActivateStudents([]); return; }
    try {
      const data = await request<PagedResult<{ id: string; fullName: string; phone: string }>>(`/api/v1/admin/students?page=1&pageSize=10&search=${encodeURIComponent(query.trim())}`);
      setActivateStudents(data.items || []);
    } catch { setActivateStudents([]); }
  }

  async function manuallyActivate(code: CodeItem, studentId: string) {
    if (!studentId) { onError(t(locale, 'codes.errors.selectStudentFirst')); return; }
    setActivateLoading(true);
    try {
      await request(`/api/v1/admin/codes/${code.id}/activate`, { method: 'POST', body: JSON.stringify({ studentId }) });
      onNotice(t(locale, 'codes.toasts.activated'));
      setActivateTarget(null); setActivateStudentQuery(''); setActivateStudents([]); setActivateStudentId('');
      await loadCodes();
    } catch (error) { onError(error instanceof Error ? error.message : 'Activation failed.'); }
    finally { setActivateLoading(false); }
  }

  // Night Task 5.3 — per-code redemption detail.
  async function openRedemptions(code: CodeItem) {
    setRedemptionsTarget(code);
    setRedemptions(null);
    setRedemptionsLoading(true);
    try {
      setRedemptions(await request<RedemptionRow[]>(`/api/v1/admin/codes/${code.id}/redemptions`));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Request failed.');
      setRedemptionsTarget(null);
    } finally { setRedemptionsLoading(false); }
  }

  const dateFmt = new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium' });

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t(locale, 'codes.header.eyebrow')}</p>
            <h2 className="text-2xl font-bold text-slate-900">{t(locale, 'codes.header.title')}</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">{t(locale, 'codes.header.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={loading} onClick={() => void loadCodes()} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50">
            {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}{t(locale, 'codes.header.refresh')}
          </button>
          {can('btn:codes.generate') && (
            <button type="button" onClick={() => setGenerateOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors" data-testid="open-generate-modal">
              <Plus className="w-4 h-4" />{t(locale, 'codes.header.generate')}
            </button>
          )}
        </div>
      </header>

      {/* Code ledger — the single main surface (Night Task 5.4) */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t(locale, 'codes.ledger.eyebrow')}</p>
            <h3 className="text-base font-bold text-slate-900">{t(locale, 'codes.ledger.title')}</h3>
          </div>
          <div className="flex items-center gap-2">
            {can('btn:codes.export') && (
              <button type="button" onClick={exportCsv} disabled={codes.length === 0} title={t(locale, 'codes.ledger.exportCsv')} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50">
                <Download className="w-3.5 h-3.5" />CSV
              </button>
            )}
            {selectedIds.size > 0 && can('btn:codes.revoke-bulk') && (
              <button type="button" onClick={() => setBulkRevokeOpen(true)} disabled={busy} title={t(locale, 'codes.ledger.revokeSelected')} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 bg-white hover:bg-red-50 transition-colors disabled:opacity-50">
                {busy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}{selectedIds.size}
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-bold">
              <UsersRound className="w-3.5 h-3.5" />{codes.length}
            </span>
          </div>
        </div>

        {/* Filters — status / scope / search + Night 5.3 academic (year & subject) */}
        <div className="space-y-2 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input value={filterSearch} onChange={(e) => { setFilterSearch(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') void loadCodes(filterStatus, filterSearch, filterScopeType, filterYearId, filterSubjectId); }} placeholder={t(locale, 'codes.ledger.searchPlaceholder')} className="w-full pr-8 pl-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); void loadCodes(e.target.value, filterSearch, filterScopeType, filterYearId, filterSubjectId); }} aria-label={t(locale, 'codes.ledger.statusFilter')} className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">{t(locale, 'codes.ledger.allStatuses')}</option>
              <option value="Active">{t(locale, 'codes.ledger.statusActive')}</option>
              <option value="Used">{t(locale, 'codes.ledger.statusUsed')}</option>
              <option value="Revoked">{t(locale, 'codes.ledger.statusRevoked')}</option>
              <option value="Expired">{t(locale, 'codes.ledger.statusExpired')}</option>
            </select>
            <select value={filterScopeType} onChange={(e) => { setFilterScopeType(e.target.value); void loadCodes(filterStatus, filterSearch, e.target.value, filterYearId, filterSubjectId); }} aria-label={t(locale, 'codes.ledger.scopeFilter')} className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">{t(locale, 'codes.ledger.allScopes')}</option>
              <option value="subject">{t(locale, 'codes.ledger.scopeSubject')}</option>
              <option value="year">{t(locale, 'codes.ledger.scopeYear')}</option>
              <option value="semester">{t(locale, 'codes.ledger.scopeSemester')}</option>
              <option value="college">{t(locale, 'codes.ledger.scopeCollege')}</option>
              <option value="university">{t(locale, 'codes.ledger.scopeUniversity')}</option>
            </select>
            <button type="button" onClick={() => void loadCodes(filterStatus, filterSearch, filterScopeType, filterYearId, filterSubjectId)} disabled={loading} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50">
              {loading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}{t(locale, 'codes.ledger.search')}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t(locale, 'codes.ledger.academicFilter')}</span>
            <select value={filterUniversityId} onChange={(e) => void chooseFilterUniversity(e.target.value)} aria-label={t(locale, 'codes.ledger.university')} className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">{t(locale, 'codes.ledger.university')}</option>
              {universities.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
            </select>
            <select value={filterCollegeId} disabled={!filterUniversityId} onChange={(e) => void chooseFilterCollege(e.target.value)} aria-label={t(locale, 'codes.ledger.college')} className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">{t(locale, 'codes.ledger.college')}</option>
              {filterColleges.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
            </select>
            <select value={filterYearId} disabled={!filterCollegeId} onChange={(e) => { void chooseFilterYear(e.target.value).then(() => loadCodes(filterStatus, filterSearch, filterScopeType, e.target.value, '')); }} aria-label={t(locale, 'codes.generateModal.academicYear')} className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500" data-testid="filter-year">
              <option value="">{t(locale, 'codes.ledger.allYears')}</option>
              {filterYears.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
            </select>
            <select value={filterSemesterSelection} disabled={filterSemesters.length === 0} onChange={(e) => { setFilterSemesterSelection(e.target.value); void chooseFilterSemester(e.target.value); }} aria-label={t(locale, 'codes.generateModal.semester')} className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="">{t(locale, 'codes.ledger.allSemesters')}</option>
              {filterSemesters.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
            </select>
            <select value={filterSubjectId} disabled={filterSubjects.length === 0} onChange={(e) => { setFilterSubjectId(e.target.value); void loadCodes(filterStatus, filterSearch, filterScopeType, filterYearId, e.target.value); }} aria-label={t(locale, 'codes.generateModal.subject')} className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500" data-testid="filter-subject">
              <option value="">{t(locale, 'codes.ledger.allSubjects')}</option>
              {filterSubjects.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
            </select>
            {(filterYearId || filterSubjectId) && (
              <button type="button" onClick={() => { setFilterYearId(''); setFilterSubjectId(''); setFilterSemesterSelection(''); void loadCodes(filterStatus, filterSearch, filterScopeType, '', ''); }} className="px-2 py-1 rounded-lg text-[11px] font-bold text-teal-700 hover:bg-teal-50 transition-colors">
                {t(locale, 'codes.ledger.clearAcademic')}
              </button>
            )}
          </div>
        </div>

        <div className="p-3 max-h-[40rem] overflow-y-auto">
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
              <p className="mt-2 text-sm">{t(locale, 'codes.ledger.empty')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {codes.map((code) => {
                const inactive = code.status.toLowerCase() !== 'active';
                return (
                  <article key={code.id} className={`flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors ${inactive ? 'opacity-60' : ''}`}>
                    {code.status.toLowerCase() === 'active' && (
                      <input type="checkbox" checked={selectedIds.has(code.id)} onChange={(e) => { const next = new Set(selectedIds); if (e.target.checked) next.add(code.id); else next.delete(code.id); setSelectedIds(next); }} aria-label={t(locale, 'codes.row.selectCode', { code: code.code })} className="h-4 w-4 accent-teal-600 shrink-0" />
                    )}
                    <div className="min-w-0 md:w-48">
                      <div className="flex items-center gap-1">
                        <code className="block font-mono text-sm text-slate-900 break-all">{code.code}</code>
                        <button type="button" onClick={() => void copyCode(code)} title={t(locale, 'codes.row.copy')} className="shrink-0 p-1 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                          {copiedId === code.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <small className={`mt-0.5 inline-block text-[10px] font-bold uppercase tracking-wide ${code.isPublic ? 'text-teal-700' : 'text-slate-500'}`}>{code.isPublic ? t(locale, 'codes.row.publicCode') : t(locale, 'codes.row.privateCode')}</small>
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <strong className="block text-sm font-medium text-slate-900">{contentScopeLabel(code.contentScope, isArabic)}</strong>
                      <span className="block text-xs text-slate-500 truncate" data-testid={`code-scope-${code.id}`}>{code.scopeName || code.scopeType}</span>
                      <small className="block text-xs text-slate-500">{code.redemptionCount > 0
                        ? t(locale, 'codes.row.redemptionCount', { count: code.redemptionCount })
                        : t(locale, 'codes.row.noRedemptionsYet')}</small>
                    </div>
                    <div className="flex items-center gap-2 md:flex-col md:items-end">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${statusChipClass(code.status)}`}>{codeStatusLabel(code.status, isArabic)}</span>
                      {code.expiresAt && <small className="text-xs text-slate-500">{dateFmt.format(new Date(code.expiresAt))}</small>}
                    </div>
                    <div className="flex items-center gap-1">
                      {code.redemptionCount > 0 && (
                        <button type="button" onClick={() => void openRedemptions(code)} title={t(locale, 'codes.redemptionDetail')} data-testid={`open-redemptions-${code.id}`} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {code.status.toLowerCase() === 'active' && (
                        <button type="button" disabled={busy} title={t(locale, 'codes.row.activateForStudent')} onClick={() => { setActivateTarget(code); setActivateStudentQuery(''); setActivateStudents([]); setActivateStudentId(''); }} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-teal-200 text-xs font-medium text-teal-700 bg-white hover:bg-teal-50 transition-colors disabled:opacity-50">
                          <UserPlus className="w-3.5 h-3.5" />{t(locale, 'codes.activate')}
                        </button>
                      )}
                      {code.status.toLowerCase() === 'active' && can('btn:codes.revoke') && (
                        <button type="button" disabled={busy} title={t(locale, 'codes.row.revokeAll')} onClick={() => { setRevokeTarget(code); setRevokeReason(''); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 bg-white hover:bg-red-50 transition-colors disabled:opacity-50">
                          <Ban className="w-3.5 h-3.5" />{t(locale, 'codes.revoke')}
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

      {/* ===== Night Task 5.4 — generate modal (was the permanent side form) ===== */}
      {generateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={() => !busy && setGenerateOpen(false)}>
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3 p-5 border-b border-slate-200 sticky top-0 bg-white">
              <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
                <KeyRound className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">{t(locale, 'codes.generateModal.title')}</h3>
                <p className="text-sm text-slate-600 mt-0.5">{t(locale, 'codes.generateModal.subtitle')}</p>
              </div>
              <button type="button" onClick={() => setGenerateOpen(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" aria-label={t(locale, 'codes.close')}>✕</button>
            </div>
            <form onSubmit={generate} className="p-5 space-y-4">
              <label className="block">
                <span className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.generateModal.contentScope')}</span>
                <select value={form.contentScope} onChange={(event) => setForm({ ...form, contentScope: event.target.value as ContentScope })} aria-label={t(locale, 'codes.generateModal.contentScope')} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  {scopeChoices.map((scope) => <option key={scope.value} value={scope.value}>{isArabic ? scope.ar : scope.en}</option>)}
                </select>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg bg-teal-50/40 border border-teal-200 cursor-pointer">
                <input type="checkbox" checked={form.isPublic} onChange={(event) => setForm({ ...form, isPublic: event.target.checked })} className="mt-0.5 h-4 w-4 accent-teal-600" />
                <span className="flex flex-col gap-0.5">
                  <strong className="text-sm font-semibold text-slate-900">{t(locale, 'codes.generateModal.publicFreeCode')}</strong>
                  <small className="text-xs text-slate-500">{t(locale, 'codes.generateModal.publicFreeCodeNote')}</small>
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.ledger.university')}</span>
                  <select value={universityId} onChange={(event) => void chooseUniversity(event.target.value)} aria-label={t(locale, 'codes.ledger.university')} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">{t(locale, 'codes.generateModal.chooseUniversity')}</option>
                    {universities.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.ledger.college')}</span>
                  <select value={collegeId} disabled={!universityId} onChange={(event) => void chooseCollege(event.target.value)} aria-label={t(locale, 'codes.ledger.college')} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">{t(locale, 'codes.generateModal.chooseCollege')}</option>
                    {colleges.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.generateModal.academicYear')}</span>
                  <select value={yearId} disabled={!collegeId} onChange={(event) => void chooseYear(event.target.value)} aria-label={t(locale, 'codes.generateModal.academicYear')} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">{t(locale, 'codes.generateModal.chooseYear')}</option>
                    {years.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
                  </select>
                </label>
                {!isYearCode && (
                  <>
                    <label className="block">
                      <span className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.generateModal.semester')}</span>
                      <select value={semesterId} disabled={!yearId} onChange={(event) => void chooseSemester(event.target.value)} aria-label={t(locale, 'codes.generateModal.semester')} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                        <option value="">{t(locale, 'codes.generateModal.chooseSemester')}</option>
                        {semesters.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}</option>)}
                      </select>
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.generateModal.subject')}</span>
                      <select value={subjectId} disabled={!semesterId} onChange={(event) => setSubjectId(event.target.value)} aria-label={t(locale, 'codes.generateModal.subject')} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                        <option value="">{t(locale, 'codes.generateModal.chooseSubject')}</option>
                        {subjects.map((item) => <option key={item.id} value={item.id}>{displayName(isArabic, item)}{item.code ? ` — ${item.code}` : ''}</option>)}
                      </select>
                    </label>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.generateModal.quantity')}</span>
                  <input min="1" max="1000" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.generateModal.durationDays')}</span>
                  <input min="0" type="number" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })} required className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  <small className="block mt-1 text-[10px] text-slate-400">{t(locale, 'codes.generateModal.durationHint')}</small>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.generateModal.prefix')}</span>
                  <input value={form.prefix} onChange={(event) => setForm({ ...form, prefix: event.target.value.toUpperCase() })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.generateModal.expiry')}</span>
                  <input type="datetime-local" value={form.codeExpiresAt} onChange={(event) => setForm({ ...form, codeExpiresAt: event.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </label>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-teal-50 border border-teal-200 p-3 text-teal-700">
                <BadgeCheck className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="text-xs">{`${scopeChoices.find((s) => s.value === form.contentScope)?.[isArabic ? 'ar' : 'en'] ?? ''}: ${form.isPublic ? t(locale, 'codes.generateModal.publicScopeNote') : t(locale, 'codes.generateModal.privateScopeNote')}`}</span>
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={() => setGenerateOpen(false)} disabled={busy} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">{t(locale, 'codes.cancel')}</button>
                <button className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50" disabled={busy} type="submit">
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{t(locale, 'codes.generateModal.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Night Task 5.3 — redemptions detail modal ===== */}
      {redemptionsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={() => !redemptionsLoading && setRedemptionsTarget(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-xl max-h-[85vh] flex flex-col" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} data-testid="redemptions-modal">
            <div className="flex items-start gap-3 p-5 border-b border-slate-200">
              <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
                <UsersRound className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900">{t(locale, 'codes.redemptionDetail')}</h3>
                <p className="text-sm text-slate-600 mt-0.5">{t(locale, 'codes.redemptionsModal.subtitle')}</p>
                <p className="text-sm font-mono font-medium text-slate-900 mt-1.5 break-all">{redemptionsTarget.code}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {contentScopeLabel(redemptionsTarget.contentScope, isArabic)}
                  {redemptionsTarget.scopeName ? ` · ${redemptionsTarget.scopeName}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setRedemptionsTarget(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" aria-label={t(locale, 'codes.close')}>✕</button>
            </div>
            <div className="p-5 overflow-y-auto">
              {redemptionsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <LoaderCircle className="w-6 h-6 animate-spin text-teal-600" />
                </div>
              ) : !redemptions || redemptions.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <UsersRound className="w-6 h-6 mx-auto text-slate-300" />
                  <p className="mt-2 text-sm">{t(locale, 'codes.redemptionsModal.empty')}</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {redemptions.map((row) => (
                    <li key={row.subscriptionId} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{row.studentName || '—'}</p>
                        <p className="text-xs text-slate-500">{row.studentPhone || ''}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          <span className="font-bold text-slate-600">{contentScopeLabel(row.contentScope, isArabic)}</span>
                          {row.subjectName ? ` · ${row.subjectName}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{t(locale, 'codes.redemptionsModal.from')} {dateFmt.format(new Date(row.startsAt))}</span>
                        <span>{t(locale, 'codes.redemptionsModal.until')} {row.expiresAt === '0001-01-01T00:00:00Z' ? t(locale, 'codes.redemptionsModal.permanent') : dateFmt.format(new Date(row.expiresAt))}</span>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${redemptionStatusChip(row.status)}`}>{redemptionStatusLabel(row.status, isArabic)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual activation modal */}
      {activateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={() => !activateLoading && setActivateTarget(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full shadow-xl" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3 p-5 border-b border-slate-200">
              <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
                <UserPlus className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">{t(locale, 'codes.activateModal.title')}</h3>
                <p className="text-sm text-slate-600 mt-1">{t(locale, 'codes.activateModal.subtitle')}</p>
                <p className="text-sm font-mono font-medium text-slate-900 mt-2 break-all">{activateTarget.code}</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.activateModal.searchLabel')}</label>
                <input value={activateStudentQuery} onChange={(e) => void searchStudents(e.target.value)} placeholder={t(locale, 'codes.activateModal.searchPlaceholder')} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
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
                <button type="button" onClick={() => setActivateTarget(null)} disabled={activateLoading} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">{t(locale, 'codes.cancel')}</button>
                <button type="button" onClick={() => void manuallyActivate(activateTarget, activateStudentId)} disabled={activateLoading || !activateStudentId} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50">
                  {activateLoading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}{t(locale, 'codes.activate')}
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
                <h3 className="font-semibold text-slate-900">{t(locale, 'codes.revokeModal.title')}</h3>
                <p className="text-sm text-slate-600 mt-1">{t(locale, 'codes.revokeModal.subtitle')}</p>
                <p className="text-sm font-mono font-medium text-slate-900 mt-2 break-all">{revokeTarget.code}</p>
              </div>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); if (!revokeReason.trim()) { onError(t(locale, 'codes.revokeModal.provideReason')); return; } void revoke(revokeTarget, revokeReason.trim()); }} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">{t(locale, 'codes.revokeReason')}</label>
                <textarea required rows={3} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} placeholder={t(locale, 'codes.revokeReasonPlaceholder')} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setRevokeTarget(null)} disabled={busy} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">{t(locale, 'codes.cancel')}</button>
                <button type="submit" disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                  {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}{t(locale, 'codes.confirmRevoke')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* W3 (admin-ui): bulk revoke — explicit danger confirm with a mandatory
          reason (previously a single unconfirmed click with a hardcoded
          English reason and silent per-item failure swallowing, debt D-09). */}
      <ConfirmDialog
        open={bulkRevokeOpen}
        onOpenChange={(next) => { if (!next) setBulkRevokeOpen(false); }}
        title={t(locale, 'codes.bulkRevoke.title')}
        description={t(locale, 'codes.bulkRevoke.description', { count: selectedIds.size })}
        confirmLabel={t(locale, 'codes.confirmRevoke')}
        cancelLabel={t(locale, 'codes.cancel')}
        variant="danger"
        requireReason={{ label: t(locale, 'codes.revokeReason'), placeholder: t(locale, 'codes.revokeReasonPlaceholder') }}
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={busy}
        onConfirm={(reason) => { if (reason) void bulkRevoke(reason); }}
        testId="bulk-revoke-confirm"
      />
    </section>
  );
}
