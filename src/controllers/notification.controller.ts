import { Response, NextFunction } from 'express';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { AuthRequest, NotificationType } from '../types';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { getPagination } from '../utils/helpers';

export const getNotifications = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type, page, limit: lim, since } = req.query as Record<string, string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '20');

    const filter: Record<string, unknown> = { userId: req.user!.userId };
    if (type && type !== 'all') filter.type = type;
    if (since) filter.createdAt = { $gt: new Date(since) };

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

export const getPreferences = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId).select('notificationPreferences');
    if (!user) { sendError(res, 'User not found.', 404); return; }
    sendSuccess(res, 'Preferences fetched.', user.notificationPreferences);
  } catch (err) { next(err); }
};

export const updatePreferences = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const allowed = ['inquiry', 'verification', 'property', 'payment', 'earb', 'system'];
    const update: Record<string, boolean> = {};
    for (const key of allowed) {
      if (typeof req.body[key] === 'boolean') {
        update[`notificationPreferences.${key}`] = req.body[key];
      }
    }
    const user = await User.findByIdAndUpdate(
      req.user!.userId,
      { $set: update },
      { new: true, select: 'notificationPreferences' }
    );
    if (!user) { sendError(res, 'User not found.', 404); return; }
    sendSuccess(res, 'Preferences updated.', user.notificationPreferences);
  } catch (err) { next(err); }
};
