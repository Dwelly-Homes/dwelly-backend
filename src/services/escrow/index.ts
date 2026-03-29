/**
 * Escrow Service
 *
 * Controls all state transitions for a RentPayment through its escrow lifecycle:
 *   pending_payment → held → released | refunded | disputed
 *
 * Actual fund movement (B2C transfers) is handled by services/mpesa/b2c.ts.
 * This service manages the state machine and emits notifications.
 */

import { Types } from 'mongoose';
import { RentPayment, EscrowStatus, ReleaseReason, IRentPayment } from '../../models/RentPayment';
import { Dispute, DisputeStatus } from '../../models/Dispute';
import { Notification } from '../../models/Notification';
import { Lease } from '../../models/Lease';
import { User } from '../../models/User';
import { initiateB2CTransfer } from '../mpesa/b2c';
import { sendRentEscrowEmail } from '../email/escrow';
import { sendRentEscrowSms } from '../sms/escrow';

const ESCROW_HOLD_HOURS = 24;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const addEvent = (
  payment: IRentPayment,
  action: string,
  note: string,
  actorId: string | null = null
): void => {
  payment.events.push({ action, actorId, note, timestamp: new Date() });
};

const log = (msg: string): void => {
  console.log(`[Escrow] ${new Date().toISOString()} — ${msg}`);
};

// ─── HOLD FUNDS ───────────────────────────────────────────────────────────────

/**
 * Called after a successful M-Pesa callback.
 * Transitions: pending_payment → held
 * Sets the 24-hour auto-release clock.
 */
export const holdFunds = async (rentPaymentId: string | Types.ObjectId): Promise<void> => {
  const payment = await RentPayment.findById(rentPaymentId);
  if (!payment) throw new Error(`RentPayment ${rentPaymentId} not found`);

  if (payment.escrowStatus !== EscrowStatus.PENDING_PAYMENT) {
    log(`holdFunds skipped — already ${payment.escrowStatus} for ${rentPaymentId}`);
    return;
  }

  const now = new Date();
  const heldUntil = new Date(now.getTime() + ESCROW_HOLD_HOURS * 60 * 60 * 1000);

  payment.escrowStatus = EscrowStatus.HELD;
  payment.paidAt = now;
  payment.heldUntil = heldUntil;

  addEvent(payment, 'funds_held', `KES ${payment.amount} held in escrow until ${heldUntil.toISOString()}`);
  await payment.save();

  log(`Funds held for payment ${rentPaymentId} until ${heldUntil.toISOString()}`);

  // Notify tenant and landlord
  await sendEscrowNotifications(payment, 'held');
};

// ─── RELEASE TO LANDLORD ──────────────────────────────────────────────────────

/**
 * Releases escrowed funds to the landlord.
 * Valid from: held OR disputed (admin decision).
 * Reason must be provided.
 */
export const releaseToLandlord = async (
  rentPaymentId: string | Types.ObjectId,
  reason: ReleaseReason,
  actorId: string | null = null
): Promise<void> => {
  const payment = await RentPayment.findById(rentPaymentId);
  if (!payment) throw new Error(`RentPayment ${rentPaymentId} not found`);

  const allowedStatuses: EscrowStatus[] = [EscrowStatus.HELD, EscrowStatus.DISPUTED];
  if (!allowedStatuses.includes(payment.escrowStatus)) {
    throw new Error(`Cannot release payment in status: ${payment.escrowStatus}`);
  }

  const now = new Date();
  payment.escrowStatus = EscrowStatus.RELEASED;
  payment.releasedAt = now;
  payment.releaseReason = reason;

  const reasonLabel: Record<ReleaseReason, string> = {
    [ReleaseReason.TENANT_CONFIRMED]: 'Tenant confirmed move-in',
    [ReleaseReason.AUTO_RELEASED]:    '24-hour window expired',
    [ReleaseReason.ADMIN_DECISION]:   'Admin resolved in landlord\'s favor',
  };

  addEvent(payment, 'funds_released', reasonLabel[reason], actorId);
  await payment.save();

  log(`Payment ${rentPaymentId} released to landlord. Reason: ${reason}`);

  // Initiate B2C transfer to landlord
  await triggerLandlordPayout(payment, actorId);

  // Notify both parties
  await sendEscrowNotifications(payment, 'released');
};

// ─── REFUND TO TENANT ─────────────────────────────────────────────────────────

/**
 * Refunds escrowed funds back to the tenant.
 * Only valid when escrowStatus is DISPUTED and admin decides to refund.
 */
export const refundToTenant = async (
  rentPaymentId: string | Types.ObjectId,
  adminUserId: string
): Promise<void> => {
  const payment = await RentPayment.findById(rentPaymentId);
  if (!payment) throw new Error(`RentPayment ${rentPaymentId} not found`);

  if (payment.escrowStatus !== EscrowStatus.DISPUTED) {
    throw new Error(`Can only refund a disputed payment. Current status: ${payment.escrowStatus}`);
  }

  const now = new Date();
  payment.escrowStatus = EscrowStatus.REFUNDED;
  payment.refundedAt = now;

  addEvent(payment, 'funds_refunded', 'Admin resolved in tenant\'s favor — refund initiated', adminUserId);
  await payment.save();

  log(`Payment ${rentPaymentId} refunded to tenant. Admin: ${adminUserId}`);

  // Initiate B2C transfer back to tenant
  await triggerTenantRefund(payment, adminUserId);

  // Notify both parties
  await sendEscrowNotifications(payment, 'refunded');
};

// ─── PLACE ON HOLD (DISPUTE) ──────────────────────────────────────────────────

/**
 * Transitions a held payment to disputed status.
 * Called when a tenant raises a dispute.
 */
export const placeOnHold = async (
  rentPaymentId: string | Types.ObjectId,
  disputeId: string | Types.ObjectId,
  actorId: string
): Promise<void> => {
  const payment = await RentPayment.findById(rentPaymentId);
  if (!payment) throw new Error(`RentPayment ${rentPaymentId} not found`);

  if (payment.escrowStatus !== EscrowStatus.HELD) {
    throw new Error(`Cannot dispute payment in status: ${payment.escrowStatus}`);
  }

  payment.escrowStatus = EscrowStatus.DISPUTED;
  payment.disputeId = new Types.ObjectId(String(disputeId));

  addEvent(payment, 'dispute_raised', 'Tenant raised a dispute — funds frozen pending admin review', actorId);
  await payment.save();

  log(`Payment ${rentPaymentId} placed on dispute hold.`);
};

// ─── AUTO-RELEASE EXPIRED ESCROWS ────────────────────────────────────────────

/**
 * Called by the scheduler every 5 minutes.
 * Finds all HELD payments past their heldUntil deadline and auto-releases them.
 */
export const processExpiredEscrows = async (): Promise<number> => {
  const now = new Date();

  const expired = await RentPayment.find({
    escrowStatus: EscrowStatus.HELD,
    heldUntil: { $lte: now },
  }).lean();

  if (expired.length === 0) return 0;

  log(`Auto-release: found ${expired.length} expired escrow(s)`);

  let released = 0;
  for (const p of expired) {
    try {
      await releaseToLandlord(p._id, ReleaseReason.AUTO_RELEASED, null);
      released++;
    } catch (err) {
      console.error(`[Escrow] Auto-release failed for ${p._id}:`, err);
    }
  }

  log(`Auto-release complete: ${released}/${expired.length} released`);
  return released;
};

// ─── B2C PAYOUT HELPERS ───────────────────────────────────────────────────────

const triggerLandlordPayout = async (
  payment: IRentPayment,
  actorId: string | null
): Promise<void> => {
  try {
    // Look up the landlord/agent's M-Pesa phone from the lease + user chain
    const lease = await Lease.findById(payment.leaseId).populate('tenantId', 'mpesaPhone contactPhone');
    if (!lease) {
      log(`B2C skipped — lease not found for payment ${payment._id}`);
      return;
    }

    // tenantId on Lease is the Tenant org — get the mpesaPhone configured for payouts
    const org = lease.tenantId as unknown as { mpesaPhone?: string; contactPhone?: string };
    const payoutPhone = org?.mpesaPhone || org?.contactPhone;

    if (!payoutPhone) {
      log(`B2C skipped — no payout phone configured for org ${payment.organizationId}`);
      return;
    }

    await initiateB2CTransfer({
      phone:       payoutPhone,
      amount:      payment.amount,
      reference:   `RENT-${payment._id}`,
      remarks:     `Rent release for period ${payment.periodMonth}/${payment.periodYear}`,
      paymentId:   String(payment._id),
    });

    addEvent(payment, 'b2c_initiated', `B2C payout to landlord initiated`, actorId);
    payment.b2cTransactionStatus = 'pending';
    await payment.save();
  } catch (err) {
    console.error(`[Escrow] B2C payout failed for payment ${payment._id}:`, err);
    addEvent(payment, 'b2c_failed', `B2C payout initiation failed: ${(err as Error).message}`, actorId);
    payment.b2cTransactionStatus = 'failed';
    await payment.save();
  }
};

const triggerTenantRefund = async (
  payment: IRentPayment,
  adminUserId: string
): Promise<void> => {
  try {
    await initiateB2CTransfer({
      phone:     payment.phone,
      amount:    payment.amount,
      reference: `REFUND-${payment._id}`,
      remarks:   `Rent refund for period ${payment.periodMonth}/${payment.periodYear}`,
      paymentId: String(payment._id),
    });

    addEvent(payment, 'b2c_refund_initiated', 'B2C refund to tenant initiated', adminUserId);
    payment.b2cTransactionStatus = 'pending';
    await payment.save();
  } catch (err) {
    console.error(`[Escrow] B2C refund failed for payment ${payment._id}:`, err);
    addEvent(payment, 'b2c_refund_failed', `B2C refund failed: ${(err as Error).message}`, adminUserId);
    payment.b2cTransactionStatus = 'failed';
    await payment.save();
  }
};

// ─── NOTIFICATION DISPATCH ────────────────────────────────────────────────────

const sendEscrowNotifications = async (
  payment: IRentPayment,
  event: 'held' | 'released' | 'refunded' | 'disputed'
): Promise<void> => {
  try {
    const lease = await Lease.findById(payment.leaseId).lean();
    if (!lease) return;

    const [tenant, agent] = await Promise.all([
      User.findById(payment.occupantUserId).select('fullName email phone').lean(),
      User.findById(lease.agentId).select('fullName email phone').lean(),
    ]);

    // In-app notifications
    const notifMap: Record<string, { tenantTitle: string; tenantBody: string; landlordTitle: string; landlordBody: string }> = {
      held: {
        tenantTitle:   'Rent Payment Received',
        tenantBody:    `KES ${payment.amount.toLocaleString()} held in escrow. Confirm your move-in within 24 hours to release funds.`,
        landlordTitle: 'Rent Payment in Escrow',
        landlordBody:  `KES ${payment.amount.toLocaleString()} rent payment is in escrow. Funds will be released after tenant confirmation or within 24 hours.`,
      },
      released: {
        tenantTitle:   'Rent Payment Processed',
        tenantBody:    `Your KES ${payment.amount.toLocaleString()} rent payment has been released to the landlord.`,
        landlordTitle: 'Rent Funds Released',
        landlordBody:  `KES ${payment.amount.toLocaleString()} rent has been transferred to your M-Pesa account.`,
      },
      refunded: {
        tenantTitle:   'Rent Refund Processed',
        tenantBody:    `KES ${payment.amount.toLocaleString()} has been refunded to your M-Pesa number ${payment.phone}.`,
        landlordTitle: 'Rent Payment Reversed',
        landlordBody:  `The rent dispute has been resolved. KES ${payment.amount.toLocaleString()} has been refunded to the tenant.`,
      },
      disputed: {
        tenantTitle:   'Dispute Submitted',
        tenantBody:    `Your dispute for KES ${payment.amount.toLocaleString()} has been submitted. Our team will review within 24 hours.`,
        landlordTitle: 'Rent Dispute Raised',
        landlordBody:  `A tenant has raised a dispute on a KES ${payment.amount.toLocaleString()} rent payment. Funds are frozen pending admin review.`,
      },
    };

    const n = notifMap[event];
    const notifLink = '/tenant/payments';
    const landlordLink = '/dashboard/commissions';

    const promises: Promise<unknown>[] = [];

    if (tenant) {
      promises.push(
        Notification.create({
          userId:   payment.occupantUserId,
          tenantId: payment.organizationId,
          type:     'payment',
          title:    n.tenantTitle,
          body:     n.tenantBody,
          link:     notifLink,
        }),
        sendRentEscrowEmail(tenant.email, tenant.fullName, event, payment.amount, payment.mpesaReceiptNumber),
        sendRentEscrowSms(tenant.phone, event, payment.amount, payment.mpesaReceiptNumber)
      );
    }

    if (agent) {
      promises.push(
        Notification.create({
          userId:   lease.agentId,
          tenantId: payment.organizationId,
          type:     'payment',
          title:    n.landlordTitle,
          body:     n.landlordBody,
          link:     landlordLink,
        }),
        sendRentEscrowEmail(agent.email, agent.fullName, event, payment.amount, payment.mpesaReceiptNumber)
      );
    }

    await Promise.allSettled(promises);
  } catch (err) {
    console.error('[Escrow] Notification dispatch failed:', err);
  }
};
