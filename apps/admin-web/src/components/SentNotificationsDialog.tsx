/**
 * SentNotificationsDialog — sent-notification ledger + delivery stats
 * (W-coverage, matrix row 26: the two admin read endpoints had no UI).
 *
 * API (recon-verified):
 *   GET /api/v1/notifications/sent?page&pageSize   → Paged<NotificationListItemDto>
 *   GET /api/v1/notifications/{id}/stats           → NotificationStatsDto
 * Both are super-admin-gated server-side; the launcher hides the entry for
 * non-super operators so nobody reaches a guaranteed-403 dead end.
 */
import { useEffect, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Send } from 'lucide-react';
import { Dialog } from '@cms/ui';
import { apiRequest, type PagedResult } from '../lib/api';
import { t, localeOf } from '../lib/dictionary';

type SentItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
};

type Stats = {
  notificationId: string;
  title: string;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  clickedCount: number;
  failedCount: number;
  sentAt: string;
};

type Props = {
  token: string;
  isArabic: boolean;
  onClose: () => void;
  onError: (message: string) => void;
};

const PAGE_SIZE = 20;

export function SentNotificationsDialog({ token, isArabic, onClose, onError }: Props) {
  const [items, setItems] = useState<SentItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const dir = isArabic ? 'rtl' : 'ltr';
  const locale = localeOf(isArabic);

  const load = (targetPage: number) => {
    setLoading(true);
    apiRequest<PagedResult<SentItem>>(`/api/v1/notifications/sent?page=${targetPage}&pageSize=${PAGE_SIZE}`, token)
      .then((result) => {
        setItems(result.items ?? []);
        setTotal(result.total ?? 0);
        setPage(targetPage);
      })
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : t(locale, 'notifications.sent.loadFailed'));
        setItems([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (token) load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openStats = (id: string) => {
    if (statsFor === id) { setStatsFor(null); setStats(null); return; }
    setStatsFor(id);
    setStats(null);
    setStatsLoading(true);
    apiRequest<Stats>(`/api/v1/notifications/${id}/stats`, token)
      .then(setStats)
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : t(locale, 'notifications.sent.loadFailed'));
        setStatsFor(null);
      })
      .finally(() => setStatsLoading(false));
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={t(locale, 'topbar.sentNotifications')}
      description={t(locale, 'notifications.sent.desc')}
      dir={dir}
      size="lg"
      testId="sent-notifications-dialog"
    >
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {t(locale, 'notifications.sentCount', { count: total })}
          </span>
          <button
            type="button"
            onClick={() => load(page)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50"
            style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t(locale, 'common.refresh')}
          </button>
        </div>

        {loading && items === null && (
          <div className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: 'var(--cms-text-muted)' }}>
            <LoaderCircle className="w-4 h-4 animate-spin" /> {t(locale, 'notifications.sent.loading')}
          </div>
        )}
        {items !== null && items.length === 0 && !loading && (
          <div className="text-sm text-center py-8" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'notifications.sent.empty')}</div>
        )}

        <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
          {(items ?? []).map((item) => (
            <li key={item.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--cms-line)' }} data-testid="sent-notification-row">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Send className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--cms-teal-700)' }} />
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--cms-text)' }}>{item.title}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}>{item.type}</span>
                  </div>
                  <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--cms-text-soft)' }}>{item.body}</p>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--cms-text-muted)' }}>
                    {new Date(item.createdAt).toLocaleString(isArabic ? 'ar' : 'en')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openStats(item.id)}
                  aria-expanded={statsFor === item.id}
                  data-testid={`sent-notification-stats-${item.id}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium shrink-0"
                  style={{
                    borderColor: statsFor === item.id ? 'var(--cms-teal-700)' : 'var(--cms-line-strong)',
                    color: statsFor === item.id ? 'var(--cms-teal-700)' : 'var(--cms-text-soft)',
                  }}
                >
                  <BarChart3 className="w-3 h-3" />
                  {t(locale, 'notifications.sent.stats')}
                </button>
              </div>

              {statsFor === item.id && (
                <div className="mt-3 rounded-lg border p-2.5" style={{ borderColor: 'var(--cms-teal-100)', background: 'var(--cms-ivory-50)' }} data-testid="notification-stats-panel">
                  {statsLoading && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> {t(locale, 'notifications.sent.statsLoad')}
                    </div>
                  )}
                  {stats && !statsLoading && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                      {[
                        { label: t(locale, 'notifications.sent.recipients'), value: stats.totalRecipients, color: 'var(--cms-text)' },
                        { label: t(locale, 'notifications.sent.delivered'), value: stats.deliveredCount, color: 'var(--cms-success)' },
                        { label: t(locale, 'notifications.sent.read'), value: stats.readCount, color: 'var(--cms-info)' },
                        { label: t(locale, 'notifications.sent.clicked'), value: stats.clickedCount, color: 'var(--cms-teal-700)' },
                        { label: t(locale, 'notifications.sent.failed'), value: stats.failedCount, color: 'var(--cms-danger)' },
                      ].map((cell) => (
                        <div key={cell.label}>
                          <div className="text-base font-bold" style={{ color: cell.color }}>{cell.value}</div>
                          <div className="text-[9px]" style={{ color: 'var(--cms-text-muted)' }}>{cell.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => load(page - 1)}
              disabled={page <= 1 || loading}
              aria-label={t(locale, 'notifications.sent.prev')}
              className="p-1.5 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
            >
              {isArabic ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'notifications.sent.pageOf', { page, totalPages })}</span>
            <button
              type="button"
              onClick={() => load(page + 1)}
              disabled={page >= totalPages || loading}
              aria-label={t(locale, 'notifications.sent.next')}
              className="p-1.5 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
            >
              {isArabic ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
      <div className="flex justify-end rounded-b-2xl border-t border-[color:var(--c-border)] bg-[color:var(--c-bg-elevated)] px-5 py-3.5">
        <button
          type="button"
          onClick={onClose}
          data-testid="sent-notifications-close"
          className="px-4 py-2 rounded-lg border text-sm font-medium"
          style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
        >
          {t(locale, 'common.close')}
        </button>
      </div>
    </Dialog>
  );
}
