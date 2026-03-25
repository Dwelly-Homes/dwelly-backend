import { Response, NextFunction, Request } from 'express';
import { Payment } from '../models/Payment';
import { Commission } from '../models/Commission';
import { Tenant } from '../models/Tenant';
import { Property } from '../models/Property';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { AuthRequest, PaymentType, PaymentStatus, NotificationType, AuditAction } from '../types';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { getPagination, PLAN_LIMITS, SUBSCRIPTION_PRICES, normalizePhone } from '../utils/helpers';
import { createAuditLog } from '../utils/audit';
import { initiateStkPush, parseMpesaCallback } from '../services/mpesa';
import { sendSubscriptionConfirmationEmail } from '../services/email';
import { sendPaymentSuccessSms } from '../services/sms';
import { format } from 'date-fns';

export const initiateSubscription = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { planId, billingPeriod, phone } = req.body as { planId: string; billingPeriod: string; phone: string };
    if (!['starter','professional'].includes(planId)) { sendError(res, 'Invalid plan.', 400); return; }
    if (!['monthly','annual'].includes(billingPeriod)) { sendError(res, 'Invalid billing period.', 400); return; }

    const prices = SUBSCRIPTION_PRICES[planId as keyof typeof SUBSCRIPTION_PRICES];
    const amount = prices[billingPeriod as 'monthly'|'annual'];
    const normalizedPhone = normalizePhone(phone).replace('+','');

    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }

    const stkResult = await initiateStkPush(normalizedPhone, amount, `DW-SUB-${tenant._id}`, `Dwelly ${planId} plan - ${billingPeriod}`);
    if (stkResult.ResponseCode !== '0') { sendError(res, 'Could not initiate M-Pesa payment. Please try again.', 502); return; }

    const payment = await Payment.create({
      tenantId: req.user!.tenantId!, paymentType: PaymentType.SUBSCRIPTION,
      status: PaymentStatus.PENDING, amount, phone: normalizePhone(phone),
      plan: planId, billingPeriod,
      checkoutRequestId: stkResult.CheckoutRequestID, merchantRequestId: stkResult.MerchantRequestID,
      description: `Dwelly ${planId} subscription (${billingPeriod})`,
    });

    await createAuditLog({ action: AuditAction.PAYMENT_INITIATED, resourceType: 'Payment', resourceId: (payment as any)._id.toString(), payload: { planId, billingPeriod, amount }, req, actor: req.user });
    sendSuccess(res, 'Payment request sent. Enter your M-Pesa PIN to complete.', { checkoutRequestId: stkResult.CheckoutRequestID, paymentId: (payment as any)._id });
  } catch (err) { next(err); }
};

export const checkPaymentStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payment = await Payment.findOne({ checkoutRequestId: req.params.checkoutRequestId, tenantId: req.user!.tenantId! });
    if (!payment) { sendError(res, 'Payment not found.', 404); return; }
    sendSuccess(res, 'Status fetched.', { status: payment.status, mpesaReceiptNumber: payment.mpesaReceiptNumber });
  } catch (err) { next(err); }
};

export const mpesaCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  try {
    const data = parseMpesaCallback(req.body as Record<string,unknown>);
    const payment = await Payment.findOne({ checkoutRequestId: data.checkoutRequestId });
    if (!payment || payment.status !== PaymentStatus.PENDING) return;

    if (!data.success) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = data.resultDesc;
      await payment.save();
      await createAuditLog({ action: AuditAction.PAYMENT_FAILED, resourceType: 'Payment', resourceId: payment._id.toString(), payload: { resultDesc: data.resultDesc } });
      return;
    }

    if (data.mpesaReceiptNumber) {
      const duplicate = await Payment.findOne({ mpesaReceiptNumber: data.mpesaReceiptNumber });
      if (duplicate && duplicate._id.toString() !== payment._id.toString()) return;
    }

    payment.status = PaymentStatus.SUCCESS;
    payment.mpesaReceiptNumber = data.mpesaReceiptNumber ?? null;
    payment.mpesaTransactionDate = data.transactionDate ?? null;
    await payment.save();

    if (payment.paymentType === PaymentType.SUBSCRIPTION && payment.plan) {
      const months = payment.billingPeriod === 'annual' ? 12 : 1;
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + months);
      const tenant = await Tenant.findByIdAndUpdate(String(payment.tenantId), { subscriptionPlan: payment.plan as any, subscriptionExpiresAt: expiresAt, status: 'active' }, { new: true }) as (import('../models/Tenant').ITenant | null);
      const resolvedTenant = tenant as import("../models/Tenant").ITenant | null;
      if (resolvedTenant) {
        const owner = await User.findById(resolvedTenant.ownerId).select('fullName email phone');
        if (owner && payment.mpesaReceiptNumber) {
          await Promise.all([
            sendSubscriptionConfirmationEmail(owner.email, owner.fullName, payment.plan, format(expiresAt, 'dd MMM yyyy'), payment.mpesaReceiptNumber),
            sendPaymentSuccessSms(owner.phone, payment.amount, payment.mpesaReceiptNumber),
          ]);
        }
        await Notification.create({ userId: resolvedTenant!.ownerId, tenantId: resolvedTenant!._id, type: NotificationType.PAYMENT, title: '✅ Subscription Activated', body: `Your ${payment.plan} plan is active. Receipt: ${payment.mpesaReceiptNumber}`, link: '/dashboard/billing' });
      }
    }

    if (payment.paymentType === PaymentType.COMMISSION && payment.propertyId) {
      await Commission.findOneAndUpdate({ propertyId: String(payment.propertyId), status: 'pending_payment' }, { status: 'paid', paymentId: payment._id });
    }
    await createAuditLog({ action: AuditAction.PAYMENT_SUCCESS, resourceType: 'Payment', resourceId: payment._id.toString(), payload: { receipt: data.mpesaReceiptNumber, amount: data.amount } });
  } catch (err) { console.error('M-Pesa callback error:', err); }
};

export const getPaymentHistory = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type, status, from, to, page, limit: lim } = req.query as Record<string,string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '20');
    const filter: Record<string,unknown> = { tenantId: req.user!.tenantId };
    if (type && type !== 'all') filter.paymentType = type;
    if (status && status !== 'all') filter.status = status;
    if (from || to) {
      filter.createdAt = {} as Record<string,unknown>;
      if (from) (filter.createdAt as Record<string,unknown>).$gte = new Date(from);
      if (to)   (filter.createdAt as Record<string,unknown>).$lte = new Date(to);
    }
    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l).populate('propertyId','title'),
      Payment.countDocuments(filter),
    ]);
    sendPaginated(res, 'Payment history fetched.', payments, total, p, l);
  } catch (err) { next(err); }
};

export const getBillingOverview = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }
    const limits = PLAN_LIMITS[tenant.subscriptionPlan];
    const membersUsed = await User.countDocuments({ tenantId: tenant._id });
    const now = new Date();
    const isActive = tenant.status === 'active' && !!tenant.subscriptionExpiresAt && tenant.subscriptionExpiresAt > now;
    const prices = SUBSCRIPTION_PRICES[tenant.subscriptionPlan as keyof typeof SUBSCRIPTION_PRICES];
    const price = prices?.monthly ?? 0;
    const listingsAllowed = limits.listings === Infinity ? 9999 : limits.listings;
    const membersAllowed = (limits as any).users === Infinity ? 9999 : (limits as any).users;
    sendSuccess(res, 'Billing overview fetched.', {
      plan: {
        name: tenant.subscriptionPlan,
        price,
        renewalDate: tenant.subscriptionExpiresAt,
        active: isActive,
      },
      usage: {
        listingsUsed: tenant.activeListings,
        listingsAllowed,
        membersUsed,
        membersAllowed,
      },
    });
  } catch (err) { next(err); }
};

export const getCommissions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, page, limit: lim } = req.query as Record<string,string>;
    const { page: p, limit: l, skip } = getPagination(page, lim);
    const filter: Record<string,unknown> = { tenantId: req.user!.tenantId };
    if (status) filter.status = status;
    const [commissions, total] = await Promise.all([
      Commission.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l).populate('propertyId','title monthlyRent'),
      Commission.countDocuments(filter),
    ]);
    sendPaginated(res, 'Commissions fetched.', commissions, total, p, l);
  } catch (err) { next(err); }
};

export const recordMoveIn = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { propertyId, moveInDate, monthlyRent } = req.body as { propertyId: string; moveInDate: string; monthlyRent: number };
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }
    const property = await Property.findOne({ _id: propertyId, tenantId: req.user!.tenantId as string });
    if (!property) { sendError(res, 'Property not found.', 404); return; }
    const rate = PLAN_LIMITS[tenant.subscriptionPlan].commissionRate;
    const commissionAmount = (monthlyRent * rate) / 100;
    const commission = await Commission.create({ tenantId: req.user!.tenantId!, propertyId, agentId: property.agentId, monthlyRent, commissionRate: rate, commissionAmount, moveInDate: new Date(moveInDate) });
    await Property.findByIdAndUpdate(propertyId, { status: 'occupied' });
    sendSuccess(res, 'Move-in recorded. Commission invoice generated.', commission, 201);
  } catch (err) { next(err); }
};

export const initiateCommissionPayment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { commissionId, phone } = req.body as { commissionId: string; phone: string };
    const commission = await Commission.findOne({ _id: commissionId, tenantId: req.user!.tenantId, status: 'pending_payment' }).populate('propertyId','title');
    if (!commission) { sendError(res, 'Commission not found or already paid.', 404); return; }
    const prop = commission.propertyId as unknown as { title: string };
    const normalizedPhone = normalizePhone(phone).replace('+','');
    const stkResult = await initiateStkPush(normalizedPhone, commission.commissionAmount, `DW-COM-${commission._id}`, `Commission: ${prop.title}`);
    if (stkResult.ResponseCode !== '0') { sendError(res, 'Could not initiate M-Pesa payment.', 502); return; }
    const payment = await Payment.create({ tenantId: req.user!.tenantId!, paymentType: PaymentType.COMMISSION, status: PaymentStatus.PENDING, amount: commission.commissionAmount, phone: normalizePhone(phone), propertyId: (commission.propertyId as any), commissionRate: commission.commissionRate, checkoutRequestId: stkResult.CheckoutRequestID, merchantRequestId: stkResult.MerchantRequestID, description: `Commission: ${prop.title}` });
    sendSuccess(res, 'Commission payment initiated. Enter M-Pesa PIN on your phone.', { checkoutRequestId: stkResult.CheckoutRequestID, paymentId: (payment as any)._id });
  } catch (err) { next(err); }
};
