import { Router } from 'express';
import {
  initiateSubscription, checkPaymentStatus, mpesaCallback,
  getPaymentHistory, getBillingOverview, getCommissions,
  recordMoveIn, initiateCommissionPayment,
} from '../controllers/payment.controller';
import { authenticate, requireTenantAdmin } from '../middleware/auth';
import { mpesaLimiter } from '../middleware/rateLimiter';

const router = Router();

// ─── BILLING ──────────────────────────────────────────────────────────────────
router.get('/billing/overview',             authenticate, requireTenantAdmin, getBillingOverview);
router.get('/billing/history',              authenticate, requireTenantAdmin, getPaymentHistory);

// ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
router.post('/billing/subscribe',           authenticate, requireTenantAdmin,
  mpesaLimiter,                                                               initiateSubscription);
router.get('/billing/:checkoutRequestId/status', authenticate,               checkPaymentStatus);

// ─── COMMISSIONS ─────────────────────────────────────────────────────────────
router.get('/commissions',                  authenticate, requireTenantAdmin, getCommissions);
router.post('/commissions/move-in',         authenticate, requireTenantAdmin, recordMoveIn);
router.post('/commissions/pay',             authenticate, requireTenantAdmin,
  mpesaLimiter,                                                               initiateCommissionPayment);

// ─── M-PESA CALLBACK (called by Safaricom — no auth, IP-whitelisted in prod) ─
router.post('/mpesa/callback',                                                mpesaCallback);

export default router;
