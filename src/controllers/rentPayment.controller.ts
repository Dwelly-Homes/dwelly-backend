import { Response, NextFunction, Request } from 'express';
import mongoose from 'mongoose';
import { RentPayment, EscrowStatus, RentPaymentStatus, ReleaseReason } from '../models/RentPayment';
import { Dispute, DisputeStatus } from '../models/Dispute';
import { Lease } from '../models/Lease';
import { AuthRequest, UserRole, AuditAction } from '../types';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { getPagination, normalizePhone } from '../utils/helpers';
import { createAuditLog } from '../utils/audit';
import { initiateStkPush, parseMpesaCallback } from '../services/mpesa';
import { holdFunds, releaseToLandlord, refundToTenant, placeOnHold } from '../services/escrow';
import { handleB2CCallback } from '../services/mpesa/b2c';

// ─── INITIATE RENT PAYMENT ────────────────────────────────────────────────────

export const initiateRentPayment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { leaseId, phone, periodMonth, periodYear } = req.body as {
      leaseId: string;
      phone: string;
      periodMonth: number;
      periodYear: number;
    };

    const userId = req.user!.userId;

    // ── 1. Load and validate the lease ──
    const lease = await Lease.findById(leaseId)
      .populate('propertyId', 'title')
      .populate('tenantId', 'businessName mpesaPhone contactPhone')
      .lean();

    if (!lease) {
      await session.abortTransaction();
      sendError(res, 'Lease not found.', 404);
      return;
    }

    // Ensure the requesting user is the occupant on this lease
    if (!lease.occupantUserId || lease.occupantUserId.toString() !== userId) {
      await session.abortTransaction();
      sendError(res, 'You are not the occupant of this lease.', 403);
      return;
    }

    if (lease.status !== 'active') {
      await session.abortTransaction();
      sendError(res, 'This lease is no longer active.', 400);
      return;
    }

    // ── 2. Idempotency — one active payment per period per lease ──
    const idempotencyKey = `${leaseId}_${periodYear}_${periodMonth}`;

    const existing = await RentPayment.findOne({
      idempotencyKey,
      escrowStatus: { $in: [EscrowStatus.PENDING_PAYMENT, EscrowStatus.HELD, EscrowStatus.DISPUTED] },
    }).lean();

    if (existing) {
      await session.abortTransaction();
      sendSuccess(res, 'A payment for this period is already active.', {
        paymentId:         existing._id,
        checkoutRequestId: existing.checkoutRequestId,
        escrowStatus:      existing.escrowStatus,
        paymentStatus:     existing.paymentStatus,
      });
      return;
    }

    // ── 3. Initiate M-Pesa STK Push ──
    const normalizedPhone = normalizePhone(phone).replace('+', '');
    const amount = lease.monthlyRent;

    const property = lease.propertyId as unknown as { title: string };

    const rentCallbackUrl = process.env.MPESA_RENT_CALLBACK_URL ?? undefined;
    const stkResult = await initiateStkPush(
      normalizedPhone,
      amount,
      `RENT-${leaseId}`,
      `Rent: ${property.title ?? 'Property'} (${periodMonth}/${periodYear})`,
      rentCallbackUrl
    );

    if (stkResult.ResponseCode !== '0') {
      await session.abortTransaction();
      sendError(res, 'Could not initiate M-Pesa payment. Please try again.', 502);
      return;
    }

    // ── 4. Create RentPayment record ──
    const [payment] = await RentPayment.create(
      [
        {
          leaseId,
          propertyId:     lease.propertyId,
          organizationId: lease.tenantId,
          occupantUserId: userId,
          periodMonth,
          periodYear,
          amount,
          phone:              normalizePhone(phone),
          checkoutRequestId:  stkResult.CheckoutRequestID,
          merchantRequestId:  stkResult.MerchantRequestID,
          idempotencyKey,
          paymentStatus:  RentPaymentStatus.PENDING,
          escrowStatus:   EscrowStatus.PENDING_PAYMENT,
          events: [{
            action:    'payment_initiated',
            actorId:   userId,
            note:      `STK Push sent to ${normalizePhone(phone)} for KES ${amount}`,
            timestamp: new Date(),
          }],
        },
      ],
      { session }
    );

    await session.commitTransaction();

    await createAuditLog({
      action:       AuditAction.PAYMENT_INITIATED,
      resourceType: 'RentPayment',
      resourceId:   (payment as any)._id.toString(),
      payload:      { leaseId, periodMonth, periodYear, amount },
      req:          req as Request,
      actor:        req.user,
    });

    sendSuccess(res, 'Payment request sent. Enter your M-Pesa PIN to complete.', {
      paymentId:         (payment as any)._id,
      checkoutRequestId: stkResult.CheckoutRequestID,
      amount,
    }, 201);
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// ─── M-PESA STK CALLBACK ──────────────────────────────────────────────────────

export const rentMpesaCallback = async (req: Request, res: Response): Promise<void> => {
  // Always respond 200 immediately — Safaricom requires this
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const data = parseMpesaCallback(req.body as Record<string, unknown>);

    // Atomic find-and-lock: only process if not already processed
    const payment = await RentPayment.findOneAndUpdate(
      {
        checkoutRequestId: data.checkoutRequestId,
        paymentStatus:     RentPaymentStatus.PENDING,
        callbackProcessed: false,
      },
      { $set: { callbackProcessed: true } },
      { new: true }
    );

    if (!payment) {
      console.log(`[RentCallback] Skipped — already processed or not found: ${data.checkoutRequestId}`);
      return;
    }

    if (!data.success) {
      payment.paymentStatus = RentPaymentStatus.FAILED;
      payment.failureReason = data.resultDesc;
      payment.events.push({
        action:    'payment_failed',
        actorId:   null,
        note:      `M-Pesa failed: ${data.resultDesc}`,
        timestamp: new Date(),
      });
      await payment.save();

      await createAuditLog({
        action:       AuditAction.PAYMENT_FAILED,
        resourceType: 'RentPayment',
        resourceId:   payment._id.toString(),
        payload:      { resultDesc: data.resultDesc },
      });
      return;
    }

    // Guard against duplicate receipt numbers (Safaricom replay)
    if (data.mpesaReceiptNumber) {
      const duplicate = await RentPayment.findOne({ mpesaReceiptNumber: data.mpesaReceiptNumber });
      if (duplicate && duplicate._id.toString() !== payment._id.toString()) {
        console.warn(`[RentCallback] Duplicate receipt ${data.mpesaReceiptNumber} — skipping`);
        return;
      }
    }

    // Update payment with M-Pesa confirmation
    payment.paymentStatus = RentPaymentStatus.SUCCESS;
    payment.mpesaReceiptNumber = data.mpesaReceiptNumber ?? null;
    payment.mpesaTransactionDate = data.transactionDate ?? null;
    await payment.save();

    await createAuditLog({
      action:       AuditAction.PAYMENT_SUCCESS,
      resourceType: 'RentPayment',
      resourceId:   payment._id.toString(),
      payload:      { receipt: data.mpesaReceiptNumber, amount: data.amount },
    });

    // Move to escrow hold — triggers notifications
    await holdFunds(payment._id);
  } catch (err) {
    console.error('[RentCallback] Error processing callback:', err);
  }
};

// ─── B2C RESULT CALLBACK ──────────────────────────────────────────────────────

export const b2cCallback = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  try {
    await handleB2CCallback(req.body as Record<string, unknown>);
  } catch (err) {
    console.error('[B2CCallback] Error:', err);
  }
};

// ─── CHECK PAYMENT STATUS ─────────────────────────────────────────────────────

export const getRentPaymentStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user!.userId;

    const payment = await RentPayment.findOne({ _id: paymentId, occupantUserId: userId })
      .populate('leaseId', 'monthlyRent periodMonth periodYear')
      .populate('propertyId', 'title neighborhood county')
      .populate('disputeId')
      .lean();

    if (!payment) { sendError(res, 'Payment not found.', 404); return; }

    sendSuccess(res, 'Payment status fetched.', payment);
  } catch (err) { next(err); }
};

// ─── GET MY RENT PAYMENTS ─────────────────────────────────────────────────────

export const getMyRentPayments = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { status, page, limit: lim } = req.query as Record<string, string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '20');

    const filter: Record<string, unknown> = { occupantUserId: userId };
    if (status && status !== 'all') filter.escrowStatus = status;

    const [payments, total] = await Promise.all([
      RentPayment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .populate('propertyId', 'title neighborhood county images')
        .populate('disputeId', 'status reason adminNote')
        .lean(),
      RentPayment.countDocuments(filter),
    ]);

    sendPaginated(res, 'Rent payments fetched.', payments, total, p, l);
  } catch (err) { next(err); }
};

// ─── GET PAYMENTS FOR A LEASE (agent/landlord view) ───────────────────────────

export const getLeaseRentPayments = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { leaseId } = req.params;
    const { page, limit: lim } = req.query as Record<string, string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '20');

    // Verify the lease belongs to this user's organization (unless platform admin)
    const lease = await Lease.findById(leaseId).lean();
    if (!lease) { sendError(res, 'Lease not found.', 404); return; }

    if (
      req.user!.role !== UserRole.PLATFORM_ADMIN &&
      (!req.user!.tenantId || lease.tenantId.toString() !== req.user!.tenantId)
    ) {
      sendError(res, 'Access denied.', 403);
      return;
    }

    const [payments, total] = await Promise.all([
      RentPayment.find({ leaseId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .populate('occupantUserId', 'fullName phone email')
        .populate('disputeId', 'status reason adminNote')
        .lean(),
      RentPayment.countDocuments({ leaseId }),
    ]);

    sendPaginated(res, 'Lease payments fetched.', payments, total, p, l);
  } catch (err) { next(err); }
};

// ─── CONFIRM MOVE-IN ──────────────────────────────────────────────────────────

export const confirmMoveIn = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user!.userId;

    const payment = await RentPayment.findOne({ _id: paymentId, occupantUserId: userId });
    if (!payment) { sendError(res, 'Payment not found.', 404); return; }

    if (payment.escrowStatus !== EscrowStatus.HELD) {
      sendError(res, `Cannot confirm move-in for a payment in status: ${payment.escrowStatus}`, 400);
      return;
    }

    // Record confirmation on payment first
    payment.tenantConfirmedAt = new Date();
    await payment.save();

    // Release funds — this updates escrow status and triggers B2C + notifications
    await releaseToLandlord(paymentId, ReleaseReason.TENANT_CONFIRMED, userId);

    await createAuditLog({
      action:       AuditAction.PAYMENT_SUCCESS,
      resourceType: 'RentPayment',
      resourceId:   paymentId,
      payload:      { action: 'move_in_confirmed' },
      req:          req as Request,
      actor:        req.user,
    });

    sendSuccess(res, 'Move-in confirmed. Funds have been released to the landlord.');
  } catch (err) { next(err); }
};

// ─── RAISE DISPUTE ────────────────────────────────────────────────────────────

export const raiseDispute = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { paymentId } = req.params;
    const { reason, evidence } = req.body as { reason: string; evidence?: string };
    const userId = req.user!.userId;

    const payment = await RentPayment.findOne({ _id: paymentId, occupantUserId: userId }).session(session);
    if (!payment) {
      await session.abortTransaction();
      sendError(res, 'Payment not found.', 404);
      return;
    }

    if (payment.escrowStatus !== EscrowStatus.HELD) {
      await session.abortTransaction();
      sendError(res, `Cannot raise a dispute for a payment in status: ${payment.escrowStatus}`, 400);
      return;
    }

    // Check 24h window has not expired yet
    if (payment.heldUntil && payment.heldUntil < new Date()) {
      await session.abortTransaction();
      sendError(res, 'The 24-hour dispute window has expired. Funds have been auto-released.', 400);
      return;
    }

    // Ensure no existing dispute
    const existingDispute = await Dispute.findOne({ rentPaymentId: paymentId }).session(session);
    if (existingDispute) {
      await session.abortTransaction();
      sendError(res, 'A dispute already exists for this payment.', 409);
      return;
    }

    // Create dispute
    const [dispute] = await Dispute.create(
      [
        {
          rentPaymentId:  paymentId,
          leaseId:        payment.leaseId,
          propertyId:     payment.propertyId,
          organizationId: payment.organizationId,
          raisedByUserId: userId,
          reason,
          evidence: evidence ?? null,
        },
      ],
      { session }
    );

    // Freeze escrow
    await placeOnHold(paymentId, (dispute as any)._id, userId);

    await session.commitTransaction();

    await createAuditLog({
      action:       AuditAction.ADMIN_ACTION,
      resourceType: 'Dispute',
      resourceId:   (dispute as any)._id.toString(),
      payload:      { paymentId, reason },
      req:          req as Request,
      actor:        req.user,
    });

    sendSuccess(res, 'Dispute raised. Funds are frozen pending admin review.', {
      disputeId: (dispute as any)._id,
      status:    (dispute as any).status,
    }, 201);
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// ─── ADMIN: LIST DISPUTES ─────────────────────────────────────────────────────

export const adminListDisputes = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, page, limit: lim } = req.query as Record<string, string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '20');

    const filter: Record<string, unknown> = {};
    if (status && status !== 'all') filter.status = status;

    const [disputes, total] = await Promise.all([
      Dispute.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .populate('rentPaymentId', 'amount phone periodMonth periodYear mpesaReceiptNumber escrowStatus')
        .populate('raisedByUserId', 'fullName email phone')
        .populate('leaseId', 'occupantName monthlyRent')
        .populate('propertyId', 'title neighborhood county')
        .lean(),
      Dispute.countDocuments(filter),
    ]);

    sendPaginated(res, 'Disputes fetched.', disputes, total, p, l);
  } catch (err) { next(err); }
};

// ─── ADMIN: GET SINGLE DISPUTE ────────────────────────────────────────────────

export const adminGetDispute = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { disputeId } = req.params;

    const dispute = await Dispute.findById(disputeId)
      .populate('rentPaymentId')
      .populate('raisedByUserId', 'fullName email phone')
      .populate('leaseId', 'occupantName monthlyRent leaseStart')
      .populate('propertyId', 'title neighborhood county')
      .populate('resolvedByUserId', 'fullName')
      .lean();

    if (!dispute) { sendError(res, 'Dispute not found.', 404); return; }

    sendSuccess(res, 'Dispute fetched.', dispute);
  } catch (err) { next(err); }
};

// ─── ADMIN: RESOLVE DISPUTE ───────────────────────────────────────────────────

export const adminResolveDispute = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { disputeId } = req.params;
    const { decision, adminNote } = req.body as {
      decision: 'release' | 'refund';
      adminNote?: string;
    };
    const adminUserId = req.user!.userId;

    if (!['release', 'refund'].includes(decision)) {
      await session.abortTransaction();
      sendError(res, 'Decision must be "release" or "refund".', 400);
      return;
    }

    const dispute = await Dispute.findById(disputeId).session(session);
    if (!dispute) {
      await session.abortTransaction();
      sendError(res, 'Dispute not found.', 404);
      return;
    }

    if (![DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW].includes(dispute.status)) {
      await session.abortTransaction();
      sendError(res, 'Dispute is already resolved.', 409);
      return;
    }

    // Update dispute record
    dispute.status         = decision === 'release' ? DisputeStatus.RESOLVED_RELEASE : DisputeStatus.RESOLVED_REFUND;
    dispute.adminNote      = adminNote ?? null;
    dispute.resolvedByUserId = new mongoose.Types.ObjectId(adminUserId);
    dispute.resolvedAt     = new Date();
    await dispute.save({ session });

    await session.commitTransaction();

    // Execute escrow decision (outside transaction — may trigger B2C calls)
    if (decision === 'release') {
      await releaseToLandlord(dispute.rentPaymentId, ReleaseReason.ADMIN_DECISION, adminUserId);
    } else {
      await refundToTenant(dispute.rentPaymentId, adminUserId);
    }

    await createAuditLog({
      action:       AuditAction.ADMIN_ACTION,
      resourceType: 'Dispute',
      resourceId:   disputeId,
      payload:      { decision, adminNote },
      req:          req as Request,
      actor:        req.user,
    });

    sendSuccess(res, `Dispute resolved: ${decision === 'release' ? 'funds released to landlord' : 'refund initiated for tenant'}.`);
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// ─── ADMIN: UPDATE DISPUTE STATUS ─────────────────────────────────────────────

export const adminUpdateDisputeStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { disputeId } = req.params;
    const { status } = req.body as { status: DisputeStatus };

    if (status !== DisputeStatus.UNDER_REVIEW) {
      sendError(res, 'Only "under_review" can be set via this endpoint. Use /resolve to resolve.', 400);
      return;
    }

    const dispute = await Dispute.findByIdAndUpdate(
      disputeId,
      { status: DisputeStatus.UNDER_REVIEW },
      { new: true }
    );

    if (!dispute) { sendError(res, 'Dispute not found.', 404); return; }

    sendSuccess(res, 'Dispute status updated.', { status: dispute.status });
  } catch (err) { next(err); }
};
