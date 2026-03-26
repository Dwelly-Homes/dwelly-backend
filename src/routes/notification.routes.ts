import { Router } from 'express';
import {
  getNotifications, markNotificationRead, markAllNotificationsRead,
  getPreferences, updatePreferences,
} from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/',                authenticate, getNotifications);
router.get('/preferences',     authenticate, getPreferences);
router.patch('/preferences',   authenticate, updatePreferences);
router.patch('/read-all',      authenticate, markAllNotificationsRead);
router.patch('/:id/read',      authenticate, markNotificationRead);

export default router;
