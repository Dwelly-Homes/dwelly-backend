import { Router } from 'express';
import {
  getMyVerification, uploadDocument, submitForReview,
  adminGetVerifications, adminGetVerification, adminReviewVerification,
  adminGetEarbTracker,
} from '../controllers/verification.controller';
import { authenticate, requireTenantAdmin, requirePlatformAdmin } from '../middleware/auth';
import { uploadVerificationDoc } from '../services/storage/cloudinary';

const router = Router();

// ─── TENANT ───────────────────────────────────────────────────────────────────
router.get('/status',           authenticate, requireTenantAdmin, getMyVerification);
router.post('/documents/:documentType',
  authenticate, requireTenantAdmin,
  uploadVerificationDoc.single('document'),                       uploadDocument);
router.post('/submit',          authenticate, requireTenantAdmin, submitForReview);

// ─── ADMIN ────────────────────────────────────────────────────────────────────
router.get('/admin',            authenticate, requirePlatformAdmin, adminGetVerifications);
router.get('/admin/earb-tracker', authenticate, requirePlatformAdmin, adminGetEarbTracker);
router.get('/admin/:id',        authenticate, requirePlatformAdmin, adminGetVerification);
router.patch('/admin/:id/review', authenticate, requirePlatformAdmin, adminReviewVerification);

export default router;
