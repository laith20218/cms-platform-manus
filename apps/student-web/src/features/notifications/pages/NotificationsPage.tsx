import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  Bell, CheckCheck, Loader2, ChevronLeft,
  Megaphone, AlertTriangle, ShieldAlert, MessageSquare, Trophy, FileText,
} from 'lucide-react';
import { notificationApi, type Notification } from '../services/notification-api';
import { formatRelativeTime, sanitizeActionUrl } from '@/utils';

const typeConfig: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  announcement: { icon: Megaphone, color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  subscription_alert: { icon: AlertTriangle, color: 'var(--c-warning-500)', bg: 'rgba(255,179,0,0.10)' },
  new_content: { icon: FileText, color: 'var(--c-accent-500)', bg: 'rgba(0,188,212,0.10)' },
  security: { icon: ShieldAlert, color: 'var(--c-danger-500)', bg: 'rgba(255,82,82,0.08)' },
  message: { icon: MessageSquare, color: 'var(--c-text-soft)', bg: 'var(--c-neutral-100)' },
  achievement: { icon: Trophy, color: 'var(--c-warning-500)', bg: 'rgba(255,179,0,0.10)' },
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () => notificationApi.getNotifications(filter === 'unread'),
  });

  const { data: unreadCount } = useQuery({
    queryKey: ['unread-count'],
    queryFn: notificationApi.getUnreadCount,
    refetchInterval: 30000, // Refresh every 30s
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      toast.success('تم تعليم جميع الإشعارات كمقروءة');
    },
  });

  const notifications: Notification[] = data?.items || [];

  const handleNotificationClick = (notif: Notification, safeActionUrl: string | null) => {
    if (!notif.isRead) {
      markReadMutation.mutate(notif.id);
    }
    // SECURITY: only navigate to actionUrls that pass the strict whitelist
    // (same-origin + internal path). See utils/sanitizeActionUrl.ts.
    if (safeActionUrl) {
      window.location.href = safeActionUrl;
    }
  };

  return (
    <div className="space-y-5 max-w-[680px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-[var(--c-text-muted)]">
          <Link to="/dashboard" className="hover:text-[var(--c-primary-700)]">الرئيسية</Link>
          <ChevronLeft className="w-3 h-3" />
          <span className="font-semibold text-[var(--c-text)]">الإشعارات</span>
        </div>
        {unreadCount && unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--c-primary-700)] hover:bg-[var(--c-primary-50)] transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            تعليم الكل كمقروء
          </button>
        )}
      </div>

      {/* Title + Filter */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الإشعارات</h1>
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--c-neutral-100)]">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${filter === 'all' ? 'bg-[var(--c-surface)] text-[var(--c-text)] shadow-sm' : 'text-[var(--c-text-muted)]'}`}
          >
            الكل
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${filter === 'unread' ? 'bg-[var(--c-surface)] text-[var(--c-text)] shadow-sm' : 'text-[var(--c-text-muted)]'}`}
          >
            غير مقروء
            {unreadCount && unreadCount > 0 && (
              <span className="bg-[var(--c-danger-500)] text-white text-[10px] px-1.5 py-0.5 rounded-full" lang="en">{unreadCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Notifications List */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /></div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-20">
          <Bell className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-muted)] opacity-50" />
          <p className="text-[var(--c-text-muted)]">{filter === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif, i) => {
            const config = typeConfig[notif.type] || typeConfig.message;
            const Icon = config.icon;
            // Sanitize once per notification — used both for navigation and
            // to gate the "View" affordance, so a rejected URL shows no chevron.
            const safeActionUrl = sanitizeActionUrl(notif.actionUrl);
            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => handleNotificationClick(notif, safeActionUrl)}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  notif.isRead
                    ? 'bg-[var(--c-surface)] border-[var(--c-border)]'
                    : 'bg-[var(--c-primary-50)] border-[rgba(25,118,210,0.15)] hover:shadow-md'
                }`}
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: config.bg, color: config.color }}>
                  <Icon className="w-5 h-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-bold text-[var(--c-text)] truncate">{notif.title}</h3>
                    {!notif.isRead && <span className="w-2 h-2 rounded-full bg-[var(--c-primary-500)] shrink-0" />}
                  </div>
                  <p className="text-sm text-[var(--c-text-soft)] line-clamp-2">{notif.body}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-[var(--c-text-muted)]">{formatRelativeTime(notif.createdAt)}</span>
                    {notif.actionLabel && safeActionUrl && (
                      <span className="text-xs font-semibold text-[var(--c-primary-700)] flex items-center gap-0.5">
                        {notif.actionLabel}
                        <ChevronLeft className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
