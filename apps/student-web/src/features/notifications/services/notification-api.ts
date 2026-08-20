import { apiClient } from '@/services/api-client';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  icon?: string;
  actionUrl?: string;
  actionLabel?: string;
  createdAt: string;
  isRead: boolean;
}

export const notificationApi = {
  getNotifications: async (unreadOnly = false, page = 1, pageSize = 20) => {
    const res = await apiClient.get('/notifications', { params: { unreadOnly, page, pageSize } });
    return res.data;
  },

  getUnreadCount: async (): Promise<number> => {
    const res = await apiClient.get('/notifications/unread-count');
    return res.data;
  },

  markRead: async (id: string) => {
    await apiClient.patch(`/notifications/${id}/read`);
  },

  markAllRead: async () => {
    await apiClient.post('/notifications/mark-all-read');
  },

  registerPushToken: async (token: string, platform: string = 'web') => {
    await apiClient.post('/notifications/push-token', { token, platform });
  },
};
