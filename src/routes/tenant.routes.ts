import { Router } from 'express';
import {
  getMyTenant, updateTenantProfile, uploadTenantLogo,
  submitOnboarding, adminGetTenants, adminUpdateTenantStatus,
} from '../controllers/tenant.controller';
import { authenticate, requireTenantAdmin, requirePlatformAdmin } from '../middleware/auth';
import { uploadLogo } from '../services/storage/cloudinary';

const router = Router();

// ─── TENANT (self) ────────────────────────────────────────────────────────────
router.get('/me',                  authenticate,                          getMyTenant);
router.patch('/me/profile',        authenticate, requireTenantAdmin,      updateTenantProfile);
router.post('/me/logo',            authenticate, requireTenantAdmin,
  uploadLogo.single('logo'),                                              uploadTenantLogo);
router.post('/me/submit-onboarding', authenticate, requireTenantAdmin,   submitOnboarding);

// ─── ADMIN ────────────────────────────────────────────────────────────────────
router.get('/',                    authenticate, requirePlatformAdmin,    adminGetTenants);
router.patch('/:id/status',        authenticate, requirePlatformAdmin,    adminUpdateTenantStatus);

export default router;
