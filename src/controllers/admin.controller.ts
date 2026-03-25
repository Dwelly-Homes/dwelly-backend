import { Response, NextFunction } from 'express';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { Property } from '../models/Property';
import { Inquiry } from '../models/Inquiry';
import { Payment } from '../models/Payment';
import { AuditLog } from '../models/AuditLog';
import { Notification } from '../models/Notification';
import { AuthRequest, NotificationType, AuditAction } from '../types';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { getPagination } from '../utils/helpers';
import { createAuditLog } from '../utils/audit';
import { sendEarbExpiryReminderEmail } from '../services/email';
import { sendEarbExpirySms } from '../services/sms';
import { format, differenceInDays } from 'date-fns';

// ─── PLATFORM STATS ───────────────────────────────────────────────────────────

export const getPlatformStats = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    const [
      totalActiveTenants,
      totalListingsLive,
      pendingVerifications,
      inquiriesThisWeek,
      failedPayments,
      approvedToday,
      rejectedToday,
      revenueMtd,
    ] = await Promise.all([
      Tenant.countDocuments({ status: 'active' }),
      Property.countDocuments({ status: 'available', isHiddenByAdmin: false }),
      Tenant.countDocuments({ verificationStatus: 'documents_uploaded' }),
      Inquiry.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
      Payment.countDocuments({ status: 'failed' }),
      Tenant.countDocuments({ verificationStatus: 'approved', updatedAt: { $gte: startOfDay } }),
      Tenant.countDocuments({ verificationStatus: 'rejected', updatedAt: { $gte: startOfDay } }),
      Payment.aggregate([
        {
          $match: {
            status: 'success',
            createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    sendSuccess(res, 'Platform stats fetched.', {
      totalActiveTenants,
      totalListingsLive,
      pendingVerifications,
      inquiriesThisWeek,
      failedPayments,
      approvedToday,
      rejectedToday,
      revenueMtd: revenueMtd[0]?.total || 0,
    });
  } catch (err) { next(err); }
};

// ─── REGISTRATION TREND (last 30 days) ───────────────────────────────────────

export const getRegistrationTrend = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await Tenant.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    sendSuccess(res, 'Registration trend fetched.', result);
  } catch (err) { next(err); }
};

// ─── LISTINGS BY COUNTY ───────────────────────────────────────────────────────

export const getListingsByCounty = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await Property.aggregate([
      { $match: { status: 'available', isHiddenByAdmin: false } },
      { $group: { _id: '$county', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    sendSuccess(res, 'Listings by county fetched.', result);
  } catch (err) { next(err); }
};

// ─── ACTIVITY FEED ────────────────────────────────────────────────────────────

export const getActivityFeed = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('actorId', 'fullName email')
      .populate('tenantId', 'businessName');
    sendSuccess(res, 'Activity feed fetched.', logs);
  } catch (err) { next(err); }
};

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────

export const getAuditLog = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type, tenantId, from, to, search, page, limit: lim } = req.query as Record<string, string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '20');

    const filter: Record<string, unknown> = {};
    if (type && type !== 'all') filter.action = new RegExp(`^${type}`, 'i');
    if (tenantId) filter.tenantId = tenantId;
    if (from || to) {
      filter.createdAt = {};
      if (from) (filter.createdAt as Record<string, unknown>).$gte = new Date(from);
      if (to)   (filter.createdAt as Record<string, unknown>).$lte = new Date(to);
    }
    if (search) {
      filter.$or = [
        { actorEmail: new RegExp(search, 'i') },
        { ipAddress: new RegExp(search, 'i') },
        { action: new RegExp(search, 'i') },
      ];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .populate('actorId', 'fullName email role')
        .populate('tenantId', 'businessName'),
      AuditLog.countDocuments(filter),
    ]);

    sendPaginated(res, 'Audit log fetched.', logs, total, p, l);
  } catch (err) { next(err); }
};

// ─── ADMIN: GET TENANT DETAIL ─────────────────────────────────────────────────

export const adminGetTenantDetail = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }

    const [users, properties, payments, auditLogs] = await Promise.all([
      User.find({ tenantId: tenant._id }).select('fullName email role isActive createdAt'),
      Property.find({ tenantId: tenant._id }).select('title status monthlyRent inquiryCount createdAt'),
      Payment.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(20),
      AuditLog.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(50),
    ]);

    sendSuccess(res, 'Tenant detail fetched.', { tenant, users, properties, payments, auditLogs });
  } catch (err) { next(err); }
};

// ─── EARB TRACKER ─────────────────────────────────────────────────────────────

export const getEarbTracker = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const agents = await Tenant.find({
      accountType: 'estate_agent',
      verificationStatus: 'approved',
    }).select('businessName earbNumber earbExpiryDate earbLastNotifiedAt contactEmail contactPhone');

    sendSuccess(res, 'EARB tracker fetched.', agents);
  } catch (err) { next(err); }
};

// ─── EARB EXPIRY REMINDERS ────────────────────────────────────────────────────

export const sendEarbReminders = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const expiring = await Tenant.find({
      accountType: 'estate_agent',
      verificationStatus: 'approved',
      earbExpiryDate: { $gte: now, $lte: in30Days },
    });

    let sent = 0;
    for (const tenant of expiring) {
      const owner = await User.findById(tenant.ownerId).select('fullName email phone');
      if (!owner || !tenant.earbExpiryDate) continue;

      const days = differenceInDays(tenant.earbExpiryDate, now);
      const formattedDate = format(tenant.earbExpiryDate, 'dd MMM yyyy');

      await Promise.all([
        sendEarbExpiryReminderEmail(owner.email, owner.fullName, formattedDate, days),
        sendEarbExpirySms(owner.phone, days),
      ]);

      await Tenant.findByIdAndUpdate(tenant._id, { earbLastNotifiedAt: now });
      sent++;
    }

    await createAuditLog({
      action: AuditAction.ADMIN_ACTION,
      resourceType: 'EarbReminder',
      payload: { sent },
      actor: req.user,
    });

    sendSuccess(res, `EARB reminders sent to ${sent} agent(s).`, { sent });
  } catch (err) { next(err); }
};

// ─── EARB: MARK CERTIFICATE RENEWED ──────────────────────────────────────────

export const markEarbRenewed = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { newExpiryDate } = req.body;
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.tenantId,
      { earbExpiryDate: new Date(newExpiryDate) },
      { new: true }
    );
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }
    sendSuccess(res, 'EARB expiry date updated.', { earbExpiryDate: tenant.earbExpiryDate });
  } catch (err) { next(err); }
};

// ─── SEND ADMIN NOTIFICATION TO TENANT ───────────────────────────────────────

export const sendTenantNotification = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tenantId, title, body, link } = req.body;

    const users = await User.find({ tenantId }).select('_id');
    await Notification.insertMany(users.map((u) => ({
      userId: u._id,
      tenantId,
      type: NotificationType.SYSTEM,
      title,
      body,
      link: link || null,
    })));

    sendSuccess(res, `Notification sent to ${users.length} user(s).`);
  } catch (err) { next(err); }
};
