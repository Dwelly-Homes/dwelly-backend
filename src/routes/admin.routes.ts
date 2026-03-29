import { Router } from 'express';
import {
  getPlatformStats, getRegistrationTrend, getListingsByCounty,
  getActivityFeed, getAuditLog, adminListTenants, adminGetTenantDetail,
  getEarbTracker, sendEarbReminders, markEarbRenewed, sendTenantNotification,
} from '../controllers/admin.controller';
import { authenticate, requirePlatformAdmin } from '../middleware/auth';

const router: Router = Router();

// All admin routes require platform_admin role
router.use(authenticate, requirePlatformAdmin);

router.get('/stats',                     getPlatformStats);
router.get('/stats/registrations',       getRegistrationTrend);
router.get('/stats/listings-by-county',  getListingsByCounty);
router.get('/activity-feed',             getActivityFeed);
router.get('/audit-log',                 getAuditLog);

// Tenant management
router.get('/tenants',                   adminListTenants);
router.get('/tenants/:id',               adminGetTenantDetail);

// EARB
router.get('/earb-tracker',              getEarbTracker);
router.post('/earb/send-reminders',      sendEarbReminders);
router.patch('/earb/:tenantId/renew',    markEarbRenewed);

// Notifications
router.post('/notifications/send',       sendTenantNotification);

export default router;
