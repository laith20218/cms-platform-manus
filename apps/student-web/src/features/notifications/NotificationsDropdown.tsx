import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Bell, CheckCheck, ChevronLeft, Loader2, Megaphone, AlertTriangle, ShieldAlert, MessageSquare, Trophy, FileText, X } from 'lucide-react';
import { notificationApi, type Notification } from './services/notification-api';
import { formatRelativeTime, sanitizeActionUrl } from '@/utils';

/**
 * Night Task 4 — the notifications DROPDOWN (لوحة الإشعارات المنسدلة).
 *
 * Opening notifications no longer full-page navigates as the primary action:
 * the bell toggles this panel, which occupies roughly the TOP-START quarter
 * of the viewport — with the Arabic RTL document (`dir="rtl"`, index.html)
 * the logical `start` side resolves to the RIGHT edge, matching the reading
 * direction. On phones it degrades to a near-full-width sheet.
 *
 * Behavior parity with the full page (which stays reachable for deep links
 * and via «عرض الكل»): same API list, same mark-read / mark-all-read
 * mutations + invalidations, same sanitized actionUrl navigation, same
 * honest loading/error/empty states, unread badges preserved.
 *
 * Accessibility: role="dialog" + aria-modal, focus moves into the panel on
 * open and returns to the bell on close, Escape and click-outside close it.
 */

const DROPDOWN_PAGE_SIZE = 8;

const typeConfig: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  announcement: { icon: Megaphone, color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  subscription_alert: { icon: AlertTriangle, color: 'var(--c-warning-500)', bg: 'rgba(255,179,0,0.10)' },
  new_content: { icon: FileText, color: 'var(--c-accent-500)', bg: 'rgba(0,188,212,0.10)' },
  security: { icon: ShieldAlert, color: 'var(--c-danger-500)', bg: 'rgba(255,82,82,0.08)' },
  message: { icon: MessageSquare, color: 'var(--c-text-soft)', bg: 'var(--c-neutral-100)' },
  achievement: { icon: Trophy, color: 'var(--c-warning-500)', bg: 'rgba(255,179,0,0.10)' },
};

export function NotificationsDropdown({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications', 'dropdown', 'all'],
    queryFn: () => notificationApi.getNotifications(false, 1, DROPDOWN_PAGE_SIZE),
    enabled: open,
  });

  const { data: unreadCount } = useQuery({
    queryKey: ['unread-count'],
    queryFn: notificationApi.getUnreadCount,
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
    onError: () => toast.error('تعذّر تعليم الإشعار كمقروء. حاول مجددًا.'),
  });

  const markAllReadMutation = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      toast.success('تم تعليم جميع الإشعارات كمقروءة');
    },
    onError: () => toast.error('تعذّر تعليم جميع الإشعارات كمقروءة.'),
  });

  // Focus management: into the panel on open…
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // …Escape closes…
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const notifications: Notification[] = (data as { items?: Notification[] } | undefined)?.items ?? [];

  const handleNotificationClick = (notif: Notification, safeActionUrl: string | null) => {
    if (!notif.isRead) markReadMutation.mutate(notif.id);
    if (safeActionUrl) window.location.href = safeActionUrl;
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-[var(--z-modal)]">
      {/* click-outside closes (transparent, keyboard-neutral) */}
      <button
        type="button"
        aria-label="إغلاق لوحة الإشعارات"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        data-testid="notifications-dropdown-backdrop"
      />
      {/* The panel: top-START corner — right edge under RTL, left under LTR. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="الإشعارات"
        tabIndex={-1}
        data-testid="notifications-dropdown"
        className="absolute top-0 start-0 flex flex-col w-full sm:w-[min(50vw,520px)] h-[min(52vh,480px)] rounded-ee-2xl border border-[var(--c-border-strong)] bg-[var(--cms-surface)] shadow-2xl outline-none"
      >
        {/* Header */}
        <header className="flex items-center gap-2 px-4 py-3 border-b border-[var(--c-border)]" data-testid="notifications-dropdown-header">
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: 'var(--grad-primary)' }}>
            <Bell className="w-[18px] h-[18px] text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14.5px] font-extrabold text-[var(--c-text)] flex items-center gap-2">
              الإشعارات
              {Boolean(unreadCount && unreadCount > 0) && (
                <span className="bg-[var(--c-danger-500)] text-white text-[10.5px] min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center font-bold tabular-nums" lang="en" data-testid="notifications-dropdown-unread-badge">
                  {unreadCount}
                </span>
              )}
            </h2>
            <p className="text-[11px] text-[var(--c-text-muted)]">آخر إشعاراتك</p>
          </div>
          {Boolean(unreadCount && unreadCount > 0) && (
            <button
              type="button"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="press min-h-11 flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-bold text-[var(--c-primary-700)] hover:bg-[var(--c-primary-50)] transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
              تعليم الكل
            </button>
          )}
          <Link
            to="/notifications"
            onClick={onClose}
            data-testid="notifications-dropdown-view-all"
            className="min-h-11 flex items-center gap-0.5 px-2.5 rounded-lg text-xs font-bold text-[var(--c-primary-700)] hover:bg-[var(--c-primary-50)] transition-colors"
          >
            عرض الكل
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            data-testid="notifications-dropdown-close"
            className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0" data-testid="notifications-dropdown-body">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--c-primary-700)]" />
            </div>
          ) : isError ? (
            <div role="alert" className="m-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-5 text-center" data-testid="notifications-dropdown-error">
              <p className="text-sm font-bold text-[var(--c-text)]">تعذّر تحميل الإشعارات</p>
              <button
                type="button"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['notifications', 'dropdown', 'all'] })}
                className="mt-3 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center" data-testid="notifications-dropdown-empty">
              <Bell className="w-9 h-9 text-[var(--c-text-muted)] opacity-50" />
              <p className="text-sm text-[var(--c-text-muted)]">لا توجد إشعارات</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--c-border)]">
              {notifications.map((notif) => {
                const config = typeConfig[notif.type] || typeConfig.message;
                const Icon = config.icon;
                const safeActionUrl = sanitizeActionUrl(notif.actionUrl);
                return (
                  <li key={notif.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notif, safeActionUrl)}
                      data-testid={`notification-dropdown-row-${notif.id}`}
                      className={`w-full text-right flex items-start gap-3 px-4 py-3 transition-colors ${
                        notif.isRead ? 'hover:bg-[var(--c-bg-hover)]' : 'bg-[var(--c-primary-50)] hover:shadow-sm'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: config.bg, color: config.color }}>
                        <Icon className="w-[18px] h-[18px]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-[13px] font-bold text-[var(--c-text)] truncate">{notif.title}</h3>
                          {!notif.isRead && <span className="w-2 h-2 rounded-full bg-[var(--c-primary-500)] shrink-0" aria-label="غير مقروء" />}
                        </div>
                        <p className="text-[12.5px] text-[var(--c-text-soft)] line-clamp-1">{notif.body}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[11px] text-[var(--c-text-muted)]">{formatRelativeTime(notif.createdAt)}</span>
                          {notif.actionLabel && safeActionUrl && (
                            <span className="text-[11px] font-bold text-[var(--c-primary-700)] flex items-center gap-0.5">
                              {notif.actionLabel}
                              <ChevronLeft className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="px-4 py-2 border-t border-[var(--c-border)] text-[11px] text-[var(--c-text-faint)]">
          «عرض الكل» يفتح صفحة الإشعارات الكاملة مع التصفية والأرشيف.
        </footer>
      </div>
    </div>
  );
}
