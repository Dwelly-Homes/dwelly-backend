import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Lease } from '../models/Lease';
import { Property } from '../models/Property';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import { AuthRequest, NotificationType } from '../types';
import { sendSuccess, sendError } from '../utils/response';

// ─── CREATE LEASE (agent onboards a residential tenant) ───────────────────────

export const createLease = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      propertyId, occupantName, occupantPhone, occupantEmail,
      monthlyRent, depositAmount, leaseStart, leaseEnd, notes,
    } = req.body as {
      propertyId: string; occupantName: string; occupantPhone: string;
      occupantEmail?: string; monthlyRent: number; depositAmount?: number;
      leaseStart: string; leaseEnd?: string; notes?: string;
    };

    if (!propertyId || !occupantName || !occupantPhone || !monthlyRent || !leaseStart) {
      sendError(res, 'propertyId, occupantName, occupantPhone, monthlyRent and leaseStart are required.', 400);
      return;
    }

    // Ensure property belongs to this tenant
    const property = await Property.findOne({ _id: propertyId, tenantId: req.user!.tenantId });
    if (!property) { sendError(res, 'Property not found.', 404); return; }

    // Check for existing active lease on this property
    const existing = await Lease.findOne({ propertyId, status: 'active' });
    if (existing) { sendError(res, 'This property already has an active lease.', 409); return; }

    // Link to a user account if email or phone matches a searcher
    const orConditions: { email?: string; phone?: string }[] = [];
    if (occupantEmail) orConditions.push({ email: occupantEmail.toLowerCase() });
    if (occupantPhone) orConditions.push({ phone: occupantPhone });
    const occupantUser = orConditions.length
      ? await User.findOne({ $or: orConditions, role: 'searcher' }).select('_id fullName')
      : null;

    const lease = await Lease.create({
      propertyId,
      tenantId: req.user!.tenantId as string,
      agentId: req.user!.userId,
      occupantUserId: (occupantUser as { _id: Types.ObjectId } | null)?._id ?? null,
      occupantName,
      occupantPhone,
      occupantEmail: occupantEmail || null,
      monthlyRent,
      depositAmount: depositAmount ?? 0,
      leaseStart: new Date(leaseStart),
      leaseEnd: leaseEnd ? new Date(leaseEnd) : null,
      notes: notes || null,
    });

    // Mark property as occupied
    await Property.findByIdAndUpdate(propertyId, { status: 'occupied' });

    // Notify the tenant user if they have an account
    if (occupantUser && occupantUser._id) {
      await Notification.create({
        userId: occupantUser._id,
        type: NotificationType.SYSTEM,
        title: 'Tenancy Activated',
        body: `Your tenancy for "${property.title}" has been set up on Dwelly. Check your dashboard for details.`,
        link: '/tenant/payments',
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const populated = await Lease.findById((lease as any)._id)
      .populate('propertyId', 'title neighborhood county images monthlyRent propertyType')
      .populate('agentId', 'fullName phone email');

    sendSuccess(res, 'Tenant onboarded successfully.', populated, 201);
  } catch (err) { next(err); }
};

// ─── GET LEASES (agent dashboard) ─────────────────────────────────────────────

export const getLeases = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, propertyId } = req.query as Record<string, string>;

    const filter: Record<string, unknown> = { tenantId: req.user!.tenantId };
    if (req.user!.role === 'agent_staff') filter.agentId = req.user!.userId;
    if (status) filter.status = status;
    if (propertyId) filter.propertyId = new Types.ObjectId(propertyId);

    const leases = await Lease.find(filter)
      .sort({ createdAt: -1 })
      .populate('propertyId', 'title neighborhood county images propertyType')
      .populate('agentId', 'fullName')
      .populate('occupantUserId', 'fullName');

    sendSuccess(res, 'Leases fetched.', leases);
  } catch (err) { next(err); }
};

// ─── GET MY LEASE (searcher) ───────────────────────────────────────────────────

export const getMyLease = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const lease = await Lease.findOne({ occupantUserId: req.user!.userId, status: 'active' })
      .populate('propertyId', 'title neighborhood county streetEstate images monthlyRent propertyType amenities')
      .populate('agentId', 'fullName phone email')
      .populate('tenantId', 'businessName phone email');

    sendSuccess(res, lease ? 'Active lease found.' : 'No active lease.', lease ?? null);
  } catch (err) { next(err); }
};

// ─── UPDATE LEASE STATUS (terminate / expire) ─────────────────────────────────

export const updateLease = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, notes } = req.body as { status?: string; notes?: string };

    const lease = await Lease.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!lease) { sendError(res, 'Lease not found.', 404); return; }

    if (status && !['active', 'expired', 'terminated'].includes(status)) {
      sendError(res, 'Invalid status.', 400); return;
    }

    if (status) lease.status = status as 'active' | 'expired' | 'terminated';
    if (notes !== undefined) lease.notes = notes;
    await lease.save();

    // If terminating, free up the property
    if (status === 'terminated' || status === 'expired') {
      await Property.findByIdAndUpdate(lease.propertyId, { status: 'available' });

      if (lease.occupantUserId) {
        await Notification.create({
          userId: lease.occupantUserId,
          type: NotificationType.SYSTEM,
          title: 'Tenancy Ended',
          body: 'Your tenancy has been ended. Contact your agent for more information.',
          link: '/tenant/payments',
        });
      }
    }

    sendSuccess(res, 'Lease updated.', lease);
  } catch (err) { next(err); }
};
