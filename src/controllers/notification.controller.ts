import { Response, NextFunction } from 'express';
import { Notification } from '../models/Notification';
import { AuthRequest, NotificationType } from '../types';
import { sendSuccess, sendPaginated } from '../utils/response';
import { getPagination } from '../utils/helpers';

export const getNotifications = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type, page, limit: lim } = req.query as Record<string, string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '20');

    const filter: Record<string, unknown> = { userId: req.user!.userId };
    if (type && type !== 'all') filter.type = type;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.user!.userId, isRead: false }),
    ]);

    sendSuccess(res, 'Notifications fetched.', { notifications, unreadCount }, 200, {
      page: p, limit: l, total, totalPages: Math.ceil(total / l),
    });
  } catch (err) { next(err); }
};

export const markNotificationRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.userId },
      { isRead: true }
    );
    sendSuccess(res, 'Notification marked as read.');
  } catch (err) { next(err); }
};

export const markAllNotificationsRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await Notification.updateMany({ userId: req.user!.userId, isRead: false }, { isRead: true });
    sendSuccess(res, 'All notifications marked as read.');
  } catch (err) { next(err); }
};
