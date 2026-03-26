import { Response, NextFunction } from 'express';
import { Inquiry } from '../models/Inquiry';
import { Property } from '../models/Property';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { AuthRequest, InquiryStatus, NotificationType } from '../types';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { getPagination } from '../utils/helpers';
import { sendNewInquiryEmail } from '../services/email';
import { sendInquiryAlertSms } from '../services/sms';

// ─── SUBMIT INQUIRY (PUBLIC) ──────────────────────────────────────────────────

export const submitInquiry = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { propertyId, senderName, senderPhone, senderEmail, message, inquiryType,
            requestedDate, requestedTimeSlot } = req.body;

    const property = await Property.findById(propertyId)
      .populate('tenantId', 'businessName')
      .populate('agentId', 'fullName email phone');

    if (!property) { sendError(res, 'Property not found.', 404); return; }

    const inquiry = await Inquiry.create({
      propertyId,
      tenantId: property.tenantId,
      agentId: property.agentId,
      inquiryType: inquiryType || 'general',
      senderName,
      senderPhone,
      senderEmail: senderEmail || null,
      message,
      requestedDate: requestedDate || null,
      requestedTimeSlot: requestedTimeSlot || null,
    });

    // Increment inquiry count on property
    await Property.findByIdAndUpdate(propertyId, { $inc: { inquiryCount: 1 } });

    // Notify the agent via email + SMS
    const agent = property.agentId as unknown as { fullName: string; email: string; phone: string };
    const inquiryUrl = `${process.env.CLIENT_URL}/dashboard/inquiries/${inquiry._id}`;

    await Promise.all([
      sendNewInquiryEmail(agent.email, agent.fullName, senderName, property.title, inquiryUrl),
      sendInquiryAlertSms(agent.phone, senderName, property.title),
    ]);

    // Create in-app notification for agent
    await Notification.create({
      userId: property.agentId,
      tenantId: property.tenantId,
      type: NotificationType.INQUIRY,
      title: 'New Inquiry Received',
      body: `${senderName} has inquired about "${property.title}".`,
      link: `/dashboard/inquiries/${inquiry._id}`,
    });

    sendSuccess(res, 'Inquiry submitted. The agent will contact you shortly.', { id: inquiry._id }, 201);
  } catch (err) { next(err); }
};

// ─── GET MY INQUIRIES (SEARCHER — by sender email) ────────────────────────────

export const getMyInquiries = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId).select('email');
    if (!user) { sendError(res, 'User not found.', 404); return; }

    const { status, type, page, limit: lim } = req.query as Record<string, string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '20');

    const filter: Record<string, unknown> = { senderEmail: user.email };
    if (status && status !== 'all') filter.status = status;
    if (type && type !== 'all') filter.inquiryType = type;

    const [inquiries, total] = await Promise.all([
      Inquiry.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .populate('propertyId', 'title images county neighborhood monthlyRent')
        .populate('agentId', 'fullName phone'),
      Inquiry.countDocuments(filter),
    ]);

    sendSuccess(res, 'Your inquiries fetched.', inquiries, 200, {
      page: p, limit: l, total, totalPages: Math.ceil(total / l),
    });
  } catch (err) { next(err); }
};

// ─── GET TENANT INQUIRIES (INBOX) ─────────────────────────────────────────────

export const getTenantInquiries = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, page, limit: lim } = req.query as Record<string, string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '20');

    const filter: Record<string, unknown> = { tenantId: req.user!.tenantId };
    if (status && status !== 'all') filter.status = status;

    // Agent staff only see their own inquiries
    if (req.user!.role === 'agent_staff') {
      filter.agentId = req.user!.userId;
    }

    const [inquiries, total] = await Promise.all([
      Inquiry.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .populate('propertyId', 'title images'),
      Inquiry.countDocuments(filter),
    ]);

    const unreadCount = await Inquiry.countDocuments({
      tenantId: req.user!.tenantId,
      status: InquiryStatus.NEW,
      isRead: false,
    });

    sendSuccess(res, 'Inquiries fetched.', { inquiries, unreadCount }, 200, {
      page: p, limit: l, total, totalPages: Math.ceil(total / l),
    });
  } catch (err) { next(err); }
};

// ─── GET SINGLE INQUIRY ───────────────────────────────────────────────────────

export const getInquiryById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const inquiry = await Inquiry.findOne({
      _id: req.params.id,
      tenantId: req.user!.tenantId,
    }).populate('propertyId', 'title images monthlyRent county neighborhood');

    if (!inquiry) { sendError(res, 'Inquiry not found.', 404); return; }

    // Mark as read
    if (!inquiry.isRead) {
      inquiry.isRead = true;
      await inquiry.save();
    }

    sendSuccess(res, 'Inquiry fetched.', inquiry);
  } catch (err) { next(err); }
};

// ─── UPDATE INQUIRY STATUS ────────────────────────────────────────────────────

export const updateInquiryStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.body;
    const allowed = Object.values(InquiryStatus);
    if (!allowed.includes(status)) { sendError(res, 'Invalid status.', 400); return; }

    const inquiry = await Inquiry.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { status },
      { new: true }
    );
    if (!inquiry) { sendError(res, 'Inquiry not found.', 404); return; }
    sendSuccess(res, 'Inquiry updated.', inquiry);
  } catch (err) { next(err); }
};

// ─── GET PROPERTY INQUIRIES (DASHBOARD) ───────────────────────────────────────

export const getPropertyInquiries = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit: lim } = req.query as Record<string, string>;
    const { page: p, limit: l, skip } = getPagination(page, lim);

    const filter: Record<string, unknown> = {
      propertyId: req.params.propertyId,
      tenantId: req.user!.tenantId,
    };

    const [inquiries, total] = await Promise.all([
      Inquiry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l),
      Inquiry.countDocuments(filter),
    ]);

    sendPaginated(res, 'Property inquiries fetched.', inquiries, total, p, l);
  } catch (err) { next(err); }
};
