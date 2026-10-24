import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookMarked, CalendarDays, ChevronLeft, Eye, FileCode, FileSpreadsheet,
  FileText, Image as ImageIcon, LoaderCircle, Music, Target, Video,
} from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';
import { cn } from '@/utils';
import { useMySubjects } from '../hooks/useMySubjects';
import { LockedEmptyState } from './LockedEmptyState';

/** Category tabs (Push 5 Task 3) — mirror the backend LibraryFileCategory enum. */
const CATEGORIES = [
  { key: 'all', label: 'الكل' },
  { key: 'Curriculum', label: 'المنهاج' },
  { key: 'Lecture', label: 'المحاضرات' },
  { key: 'Summary', label: 'الملخصات' },
  { key: 'GoldenIdeas', label: 'الأفكار الذهبية' },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]['key'];

const TYPE_META: Record<string, { icon: typeof FileText; label: string; color: string; bg: string }> = {
  Pdf: { icon: FileText, label: 'PDF', color: 'var(--c-danger-500)', bg: 'rgba(255,82,82,0.10)' },
  Html: { icon: FileCode, label: 'HTML', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  Image: { icon: ImageIcon, label: 'صورة', color: 'var(--c-accent-500)', bg: 'rgba(0,188,212,0.10)' },
  Video: { icon: Video, label: 'فيديو', color: 'var(--c-warning-500)', bg: 'rgba(255,179,0,0.10)' },
  Audio: { icon: Music, label: 'صوت', color: 'var(--c-accent-500)', bg: 'rgba(0,188,212,0.10)' },
  Summary: { icon: FileSpreadsheet, label: 'ملخص', color: 'var(--c-success-500)', bg: 'var(--c-success-50)' },
  Comprehensive: { icon: FileText, label: 'شامل', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  Paragraph: { icon: FileText, label: 'فقرة', color: 'var(--c-text-muted)', bg: 'var(--c-bg-hover)' },
};

const CATEGORY_BADGES: Record<string, { label: string; classes: string }> = {
  Curriculum: { label: 'منهاج', classes: 'bg-[var(--c-primary-50)] text-[var(--c-primary-700)]' },
  Lecture: { label: 'محاضرة', classes: 'bg-amber-50 text-amber-700' },
  Summary: { label: 'تلخيص', classes: 'bg-[var(--c-success-50)] text-[var(--c-success-700)]' },
  GoldenIdeas: { label: 'أفكار ذهبية', classes: 'bg-amber-100 text-amber-800' },
};

interface HubLibraryFile {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  fileSize: number;
  viewsCount: number;
  /** Curricular category (Curriculum / Lecture / Summary / GoldenIdeas) — null = uncategorized. */
  category?: string | null;
  createdAt?: string | null;
  subjectId: string;
  subjectSlug: string;
  subjectName: string;
}

/**
 * My Studies → Library tab (Push 5 redesign): fetches every file across the
 * student's entitled subjects, groups it behind elegant category tabs
 * (الكل | المنهاج | المحاضرات | الملخصات | الأفكار الذهبية) and renders a card
 * grid with type icon, subject, category badge and upload date.
 * `subjectId` (Push 6) narrows the hub to a single subject.
 */
export function LibraryHub({ subjectId }: { subjectId?: string | null }) {
  const [category, setCategory] = useState<CategoryKey>('all');

  const mySubjects = useMySubjects();
  const allSubjects = mySubjects.data ?? [];
  const subjects = subjectId ? allSubjects.filter((s) => s.id === subjectId) : allSubjects;

  const { data: files, isLoading } = useQuery({
    queryKey: ['library-hub', subjects.map((s) => s.id).join(',')],
    enabled: subjects.length > 0,
    queryFn: async (): Promise<HubLibraryFile[]> => {
      const all: HubLibraryFile[] = [];
      await Promise.all(
        subjects.map(async (subject) => {
          try {
            const res = await apiClient.get(`/library/subject/${subject.id}`, {
              ...(await entitlementRequestConfig()),
              params: { page: 1, pageSize: 100 },
            });
            const items = res.data?.items ?? [];
            items.forEach((f: Omit<HubLibraryFile, 'subjectId' | 'subjectSlug' | 'subjectName'>) => {
              all.push({
                ...f,
                subjectId: subject.id,
                subjectSlug: subject.slug,
                subjectName: subject.nameAr,
              });
            });
          } catch { /* silent — subject may hold no accessible files */ }
        })
      );
      // Newest first across subjects.
      all.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      return all;
    },
  });

  const allFiles = useMemo(() => files ?? [], [files]);

  // Available category tabs: always show الكل; show a category tab only when
  // at least one file carries it (clean, honest filtering).
  const availableCategories = useMemo(() => {
    const present = new Set(allFiles.map((f) => f.category ?? ''));
    return CATEGORIES.filter((c) => c.key === 'all' || present.has(c.key));
  }, [allFiles]);

  const filtered = useMemo(
    () => (category === 'all' ? allFiles : allFiles.filter((f) => f.category === category)),
    [allFiles, category]
  );

  if (mySubjects.isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="library-loading">
        <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
      </div>
    );
  }

  // No active code → locked state with the activation CTA.
  if (allSubjects.length === 0) {
    return <LockedEmptyState title="المكتبة مُقفلة" hint="ملفات المحاضرات والمناهج والملخصات تُفتح بعد تفعيل كود الاشتراك لموادك." />;
  }

  // Deep-linked subject the student holds no grant for (stale link).
  if (subjectId && subjects.length === 0) {
    return (
      <div className="text-center py-14 rounded-2xl border border-dashed border-[var(--c-border)]" data-testid="library-subject-locked">
        <Target className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
        <p className="text-[var(--c-text-muted)]">لا يمكنك الوصول إلى مكتبة هذه المادة بعد</p>
        <p className="text-xs text-[var(--c-text-faint)] mt-1">فعّل كوداً يشمل هذه المادة لفتح ملفاتها</p>
      </div>
    );
  }

  return (
    <div>
      {/* Category filter tabs */}
      <div role="tablist" aria-label="تصنيفات المكتبة" className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-5" data-testid="library-category-tabs">
        {availableCategories.map(({ key, label }) => {
          const active = category === key;
          const count = key === 'all' ? allFiles.length : allFiles.filter((f) => f.category === key).length;
          return (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={active}
              data-testid={`library-tab-${key}`}
              onClick={() => setCategory(key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border',
                active
                  ? 'text-white border-transparent shadow-sm'
                  : 'text-[var(--c-text-soft)] border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:text-[var(--c-primary-700)]'
              )}
              style={active ? { background: 'var(--grad-primary)' } : undefined}
            >
              {label}
              <span className={cn('text-[11px] px-1.5 py-px rounded-full tabular-nums', active ? 'bg-white/20' : 'bg-[var(--c-bg-hover)]')} lang="en">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16" data-testid="library-loading">
          <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14 rounded-2xl border border-dashed border-[var(--c-border)]" data-testid="library-empty">
          <BookMarked className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
          <p className="text-[var(--c-text-muted)]">
            {category === 'all' ? 'لا توجد ملفات في مكتبتك بعد' : 'لا توجد ملفات في هذا التصنيف'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="library-grid">
          {filtered.map((file, index) => {
            const meta = TYPE_META[file.type] ?? TYPE_META.Paragraph;
            const Icon = meta.icon;
            const badge = file.category ? CATEGORY_BADGES[file.category] : null;
            return (
              <motion.div key={file.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }}>
                <Link
                  to={`/subjects/${file.subjectSlug}/library`}
                  className="flex items-start gap-3 p-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] hover:border-[var(--c-primary-200)] hover:shadow-md hover:-translate-y-0.5 transition-all group"
                  data-testid="library-card"
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: meta.bg, color: meta.color }}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-[var(--c-text)] truncate group-hover:text-[var(--c-primary-700)] transition-colors">
                        {file.title}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--c-text-muted)]">
                      <span className="font-medium" style={{ color: meta.color }}>{meta.label}</span>
                      <span className="inline-flex items-center gap-1">
                        <BookMarked className="w-3.5 h-3.5" />
                        {file.subjectName}
                      </span>
                      {badge && (
                        <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', badge.classes)} data-testid="library-card-category">
                          {badge.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[var(--c-text-faint)] mt-1.5">
                      {file.createdAt && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {new Date(file.createdAt).toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{file.viewsCount}</span>
                      <span>{formatSize(file.fileSize)}</span>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-[var(--c-text-muted)] group-hover:text-[var(--c-primary-700)] transition-colors shrink-0 mt-1" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
