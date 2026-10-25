import { useEffect, useState } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Check, ChevronDown, Loader2, TriangleAlert, X } from 'lucide-react';
import { academicApi } from '@/features/subjects/services/academic-api';
import { profileApi, type StudentProfile } from './services/profile-api';
import { CenteredDialog } from '@/components/ui/Overlays';

/**
 * Profile edit (Push 9 Task 5) — Stripe-grade self-service modal: Full Name,
 * College, Academic Year. The college list follows the student's university and
 * the year list follows the chosen college — the hierarchy is impossible to
 * break from the UI, and the backend re-validates it inside a transaction
 * anyway. Saving a College/Year change warns the student that subscriptions
 * may be affected and that the admin will be notified.
 */

interface EditState {
  fullName: string;
  collegeId: string;
  academicYearId: string;
}

export function ProfileEditModal({
  open, onClose, profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: StudentProfile;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditState>({
    fullName: profile.fullName,
    collegeId: profile.collegeId ?? '',
    academicYearId: profile.academicYearId ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({
        fullName: profile.fullName,
        collegeId: profile.collegeId ?? '',
        academicYearId: profile.academicYearId ?? '',
      });
      setError(null);
    }
  }, [open, profile]);

  const hasUniversity = !!profile.universityId;
  const needsUniversityPick = !hasUniversity && form.collegeId === '';

  // College list: from the student's university (or every college when the
  // student has no university yet — the subjects cascade style fallback).
  const colleges = useQuery({
    queryKey: ['edit-colleges', profile.universityId ?? 'all'],
    queryFn: async () => {
      if (profile.universityId) return academicApi.getColleges(profile.universityId);
      const universities = await academicApi.getUniversities(1, 100);
      const lists = await Promise.all(
        universities.items.map((u) => academicApi.getColleges(u.id).catch(() => []))
      );
      return lists.flat();
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });

  // Year list: filtered by the CHOSEN college (hierarchy guard in the UI).
  const years = useQuery({
    queryKey: ['edit-years', form.collegeId],
    queryFn: () => academicApi.getYears(form.collegeId),
    enabled: open && !!form.collegeId,
    staleTime: 5 * 60_000,
  });

  const collegeChanging = !!profile.collegeId && !!form.collegeId && form.collegeId !== profile.collegeId;
  const yearChanging = !!profile.academicYearId && !!form.academicYearId && form.academicYearId !== profile.academicYearId;
  const nameChanging = form.fullName.trim() !== profile.fullName;
  const pathChanging = collegeChanging || yearChanging;
  const anythingChanged = nameChanging || pathChanging
    || !!form.collegeId !== !!profile.collegeId
    || !!form.academicYearId !== !!profile.academicYearId;

  const save = useMutation({
    mutationFn: () => profileApi.updateProfile({
      fullName: form.fullName.trim(),
      collegeId: form.collegeId || undefined,
      academicYearId: form.academicYearId || undefined,
    }),
    onSuccess: (result) => {
      toast.success(
        result?.adminNotified
          ? 'تم حفظ التعديلات — أُبلغت الإدارة بالتغيير'
          : 'تم حفظ التعديلات'
      );
      queryClient.invalidateQueries({ queryKey: ['student-profile'] });
      onClose();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string; title?: string; message?: string } } };
      const status = axiosErr?.response?.status;
      const detail = axiosErr?.response?.data?.detail
        ?? axiosErr?.response?.data?.title
        ?? axiosErr?.response?.data?.message;
      if (status === 409) {
        setError(detail ?? 'لديك اختبار قيد التنفيذ — أكمله ثم أعد المحاولة.');
      } else if (status === 400) {
        setError(detail ?? 'تحقّق من الكلية والسنة الدراسية المختارة.');
      } else {
        setError(detail ?? 'تعذّر حفظ التعديلات. تحقّق من اتصالك ثم حاول مجدداً.');
      }
    },
  });

  const canSubmit = form.fullName.trim().length >= 2
    && !!form.collegeId
    && !!form.academicYearId
    && anythingChanged
    && !save.isPending;

  return (
    <CenteredDialog open={open} onOpenChange={(next) => { if (!next && !save.isPending) onClose(); }} title="تعديل البيانات الشخصية" description="الاسم والكلية والسنة الدراسية — تحدّث بياناتك الدراسية بنفسك." testId="profile-edit-modal">
      <div className="space-y-4">
        {/* Subscription warning (the integrity catch, made human) */}
        <div className="flex items-start gap-3 rounded-xl border border-[var(--cms-warning)]/40 bg-[var(--cms-warning-50)] p-3.5" role="alert">
          <TriangleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[var(--cms-warning)]" />
          <p className="text-[13px] leading-relaxed text-[var(--cms-text-soft)]">
            تغيير الكلية أو السنة قد يؤثر على اشتراكاتك النشطة المرتبطة بمسارك السابق.
            سيتم إشعار الإدارة بهذا التغيير فوراً لضمان سلامة بياناتك.
          </p>
        </div>

        {/* Full name */}
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-[var(--cms-text-soft)]">الاسم الكامل</span>
          <input
            type="text"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            maxLength={100}
            dir="auto"
            data-testid="edit-fullname"
            className="h-12 w-full rounded-xl border border-[var(--cms-line-strong)] bg-[var(--cms-surface-2)] px-4 text-[15px] font-medium text-[var(--cms-text)] outline-none transition-colors focus:border-[var(--cms-teal-500)]"
            disabled={save.isPending}
          />
        </label>

        {/* Academic path */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-sm font-bold text-[var(--cms-text-soft)]">الكلية</span>
            <FormSelect
              testId="edit-college"
              value={form.collegeId}
              placeholder="اختر الكلية…"
              items={(colleges.data ?? []).map((c) => ({ value: c.id, label: c.nameAr, hint: `${c.yearsCount} سنوات` }))}
              loading={colleges.isLoading}
              disabled={save.isPending}
              onValueChange={(value) => setForm((f) => ({ ...f, collegeId: value, academicYearId: '' }))}
            />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-bold text-[var(--cms-text-soft)]">السنة الدراسية</span>
            <FormSelect
              testId="edit-year"
              value={form.academicYearId}
              placeholder={form.collegeId ? 'اختر السنة…' : 'اختر الكلية أولاً'}
              items={(years.data ?? []).map((y) => ({ value: y.id, label: y.nameAr, hint: `${y.semestersCount} فصول` }))}
              loading={years.isLoading}
              disabled={save.isPending || !form.collegeId}
              onValueChange={(value) => setForm((f) => ({ ...f, academicYearId: value }))}
            />
          </div>
        </div>

        {needsUniversityPick && (
          <p className="text-xs text-[var(--cms-text-muted)]">
            لم تحدد جامعة بعد — القائمة تعرض كليات جميع الجامعات، وسيتم ربط مسارك جامعياً تلقائياً.
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--cms-danger)]/40 bg-[var(--cms-danger-50)] p-3.5" role="alert" data-testid="edit-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cms-danger)]" />
            <p className="text-[13px] font-medium leading-relaxed text-[var(--cms-danger)]">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="press inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--cms-line-strong)] px-5 py-2 text-sm font-semibold text-[var(--cms-text-soft)] transition-colors hover:bg-[var(--cms-surface-2)] disabled:opacity-50"
          >
            <X className="h-4 w-4" /> إلغاء
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!canSubmit}
            data-testid="edit-save"
            className="press inline-flex min-h-11 items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all disabled:opacity-50"
            style={{ background: 'var(--cms-teal-700)' }}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            حفظ التعديلات
          </button>
        </div>
      </div>
    </CenteredDialog>
  );
}

/** A compact Radix Select matching the form rows (44px targets, dark-safe). */
function FormSelect({
  value, onValueChange, items, placeholder, loading, disabled, testId,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: string; hint?: string }[];
  placeholder: string;
  loading?: boolean;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <SelectPrimitive.Root value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        data-testid={testId}
        aria-label={placeholder}
        className={`press inline-flex h-12 w-full items-center justify-between gap-2 rounded-xl border px-3.5 text-sm font-medium outline-none transition-colors ${
          value
            ? 'border-[var(--cms-teal-100)] bg-[var(--cms-teal-50)] text-[var(--cms-text)]'
            : 'border-[var(--cms-line-strong)] bg-[var(--cms-surface-2)] text-[var(--cms-text-muted)]'
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="truncate">{items.find((i) => i.value === value)?.label ?? placeholder}</span>
        {loading
          ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--cms-text-muted)]" />
          : <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />}
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="select-content z-[var(--z-modal)] max-h-72 overflow-hidden rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] shadow-xl"
          position="popper"
          sideOffset={6}
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {items.length === 0 && !loading && (
              <div className="px-3 py-6 text-center text-xs text-[var(--cms-text-muted)]">لا توجد خيارات</div>
            )}
            {items.map((item) => (
              <SelectPrimitive.Item
                key={item.value}
                value={item.value}
                className="flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--cms-text)] outline-none transition-colors data-[highlighted]:bg-[var(--cms-teal-50)] data-[highlighted]:text-[var(--cms-teal-700)]"
              >
                <SelectPrimitive.ItemIndicator className="inline-flex w-4 justify-center">
                  <Check className="h-4 w-4 text-[var(--cms-teal-700)]" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
                {item.hint && <span className="ms-auto text-[11px] text-[var(--cms-text-muted)]" lang="en">{item.hint}</span>}
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
