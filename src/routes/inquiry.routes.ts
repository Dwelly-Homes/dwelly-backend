import { Router } from 'express';
import {
  submitInquiry, getTenantInquiries, getInquiryById,
  updateInquiryStatus, getPropertyInquiries, getMyInquiries,
} from '../controllers/inquiry.controller';
import { authenticate, requireAgentOrAdmin } from '../middleware/auth';
import { apiLimiter } from '../middleware/rateLimiter';

const router = Router();

// ─── PUBLIC ───────────────────────────────────────────────────────────────────
router.post('/',        apiLimiter, submitInquiry);

// ─── SEARCHER (my own inquiries) ──────────────────────────────────────────────
router.get('/my',       authenticate, getMyInquiries);

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/',         authenticate, requireAgentOrAdmin, getTenantInquiries);
router.get('/:id',      authenticate, requireAgentOrAdmin, getInquiryById);
router.patch('/:id',    authenticate, requireAgentOrAdmin, updateInquiryStatus);

// ─── PER-PROPERTY ─────────────────────────────────────────────────────────────
router.get('/property/:propertyId', authenticate, requireAgentOrAdmin, getPropertyInquiries);

export default router;
