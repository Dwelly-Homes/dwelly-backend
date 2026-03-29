import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, requirePlatformAdmin, requireRoles } from '../middleware/auth';
import { mpesaLimiter } from '../middleware/rateLimiter';
import { UserRole } from '../types';
import {
  initiateRentPayment,
  rentMpesaCallback,
  b2cCallback,
  getRentPaymentStatus,
  getMyRentPayments,
  getLeaseRentPayments,
  confirmMoveIn,
  raiseDispute,
  adminListDisputes,
  adminGetDispute,
  adminResolveDispute,
  adminUpdateDisputeStatus,
} from '../controllers/rentPayment.controller';

const router = Router();

// ─── TENANT-FACING ────────────────────────────────────────────────────────────

/**
 * POST /rent-payments/initiate
 * Tenant initiates M-Pesa rent payment for a specific period.
 */
router.post(
  '/initiate',
  authenticate,
  requireRoles(UserRole.SEARCHER),
  mpesaLimiter,
  validate([
    body('leaseId')      .isMongoId()               .withMessage('Valid lease ID required.'),
    body('phone')        .isMobilePhone('any')       .withMessage('Valid phone number required.'),
    body('periodMonth')  .isInt({ min: 1, max: 12 }) .withMessage('Month must be 1–12.'),
    body('periodYear')   .isInt({ min: 2020 })       .withMessage('Year must be 2020 or later.'),
  ]),
  initiateRentPayment
);

/**
 * GET /rent-payments/my
 * Tenant retrieves their own rent payment history.
 */
router.get(
  '/my',
  authenticate,
  requireRoles(UserRole.SEARCHER),
  validate([
    query('status').optional().isIn(['all', 'pending_payment', 'held', 'released', 'refunded', 'disputed']),
    query('page')  .optional().isInt({ min: 1 }),
    query('limit') .optional().isInt({ min: 1, max: 50 }),
  ]),
  getMyRentPayments
);

/**
 * GET /rent-payments/:paymentId/status
 * Check status of a specific rent payment.
 */
router.get(
  '/:paymentId/status',
  authenticate,
  validate([param('paymentId').isMongoId()]),
  getRentPaymentStatus
);

/**
 * POST /rent-payments/:paymentId/confirm-move-in
 * Tenant confirms successful move-in → triggers immediate fund release.
 */
router.post(
  '/:paymentId/confirm-move-in',
  authenticate,
  requireRoles(UserRole.SEARCHER),
  validate([param('paymentId').isMongoId()]),
  confirmMoveIn
);

/**
 * POST /rent-payments/:paymentId/dispute
 * Tenant raises a dispute within the 24-hour window.
 */
router.post(
  '/:paymentId/dispute',
  authenticate,
  requireRoles(UserRole.SEARCHER),
  validate([
    param('paymentId')   .isMongoId(),
    body('reason')       .trim().isLength({ min: 10, max: 1000 }).withMessage('Reason must be 10–1000 characters.'),
    body('evidence')     .optional().trim().isLength({ max: 2000 }),
  ]),
  raiseDispute
);

// ─── AGENT / LANDLORD FACING ─────────────────────────────────────────────────

/**
 * GET /rent-payments/lease/:leaseId
 * Agent or admin fetches all payments for a given lease.
 */
router.get(
  '/lease/:leaseId',
  authenticate,
  requireRoles(UserRole.TENANT_ADMIN, UserRole.AGENT_STAFF, UserRole.PLATFORM_ADMIN),
  validate([param('leaseId').isMongoId()]),
  getLeaseRentPayments
);

// ─── M-PESA CALLBACKS (no auth — Safaricom server-to-server) ─────────────────

/**
 * POST /rent-payments/mpesa/callback
 * M-Pesa STK Push result callback.
 * Must be publicly accessible (no auth).
 */
router.post('/mpesa/callback', rentMpesaCallback);

/**
 * POST /rent-payments/b2c/callback
 * M-Pesa B2C transfer result callback.
 */
router.post('/b2c/callback', b2cCallback);

// ─── ADMIN ────────────────────────────────────────────────────────────────────

/**
 * GET /rent-payments/admin/disputes
 * Platform admin lists all disputes.
 */
router.get(
  '/admin/disputes',
  authenticate,
  requirePlatformAdmin,
  validate([
    query('status').optional().isIn(['all', 'open', 'under_review', 'resolved_refund', 'resolved_release']),
    query('page')  .optional().isInt({ min: 1 }),
    query('limit') .optional().isInt({ min: 1, max: 50 }),
  ]),
  adminListDisputes
);

/**
 * GET /rent-payments/admin/disputes/:disputeId
 * Get detailed view of a single dispute.
 */
router.get(
  '/admin/disputes/:disputeId',
  authenticate,
  requirePlatformAdmin,
  validate([param('disputeId').isMongoId()]),
  adminGetDispute
);

/**
 * PATCH /rent-payments/admin/disputes/:disputeId/status
 * Mark dispute as under_review.
 */
router.patch(
  '/admin/disputes/:disputeId/status',
  authenticate,
  requirePlatformAdmin,
  validate([
    param('disputeId').isMongoId(),
    body('status').equals('under_review'),
  ]),
  adminUpdateDisputeStatus
);

/**
 * POST /rent-payments/admin/disputes/:disputeId/resolve
 * Admin resolves dispute — release to landlord or refund to tenant.
 */
router.post(
  '/admin/disputes/:disputeId/resolve',
  authenticate,
  requirePlatformAdmin,
  validate([
    param('disputeId').isMongoId(),
    body('decision')  .isIn(['release', 'refund']).withMessage('Decision must be "release" or "refund".'),
    body('adminNote') .optional().trim().isLength({ max: 2000 }),
  ]),
  adminResolveDispute
);

export default router;
