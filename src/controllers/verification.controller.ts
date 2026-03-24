import { Response, NextFunction } from 'express';
import { Verification } from '../models/Verification';
import { Tenant } from '../models/Tenant';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { AuthRequest, VerificationStatus, TenantStatus, AuditAction, NotificationType } from '../types';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { getPagination } from '../utils/helpers';
import { createAuditLog } from '../utils/audit';
import { getSignedUrl } from '../services/storage/cloudinary';
import {
  sendVerificationApprovedEmail,
  sendVerificationRejectedEmail,
  sendVerificationInfoRequestEmail,
} from '../services/email';

export const getMyVerification = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verification = await Verification.findOne({ tenantId: req.user!.tenantId });
    if (!verification) {
      sendSuccess(res, 'Verification record fetched.', { status: VerificationStatus.NOT_SUBMITTED, documents: [], adminNotes: null });
      return;
    }
    const docs = verification.documents.map((doc) => ({ documentType: doc.documentType, url: doc.url, publicId: doc.publicId, uploadedAt: doc.uploadedAt, status: doc.status, signedUrl: getSignedUrl(doc.publicId) }));
    sendSuccess(res, 'Verification fetched.', { ...verification.toObject(), documents: docs });
  } catch (err) { next(err); }
};

export const uploadDocument = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) { sendError(res, 'No file uploaded.', 400); return; }
    const documentType = req.params['documentType'] as string;
    const allowed = ['national_id_front','national_id_back','kra_pin','business_registration','earb_certificate'];
    if (!allowed.includes(documentType)) { sendError(res, 'Invalid document type.', 400); return; }

    const file = req.file as Express.Multer.File & { path: string; filename: string };
    let verification = await Verification.findOne({ tenantId: req.user!.tenantId });
    if (!verification) {
      verification = await Verification.create({
        tenantId: req.user!.tenantId!, submittedBy: req.user!.userId,
        status: VerificationStatus.NOT_SUBMITTED, documents: [],
      });
    }
    const docType = documentType as 'national_id_front'|'national_id_back'|'kra_pin'|'business_registration'|'earb_certificate';
    const newDoc = { documentType: docType, url: file.path, publicId: file.filename, uploadedAt: new Date(), status: 'pending' as const };
    const idx = verification.documents.findIndex((d) => d.documentType === docType);
    if (idx > -1) { verification.documents[idx] = newDoc; } else { verification.documents.push(newDoc); }
    if (docType === 'earb_certificate' && req.body.earbNumber) verification.earbNumber = req.body.earbNumber as string;
    if (docType === 'earb_certificate' && req.body.earbExpiryDate) verification.earbExpiryDate = new Date(req.body.earbExpiryDate as string);
    await verification.save();
    sendSuccess(res, 'Document uploaded.', { documentType, status: 'pending' });
  } catch (err) { next(err); }
};

export const submitForReview = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verification = await Verification.findOne({ tenantId: req.user!.tenantId });
    if (!verification) { sendError(res, 'Please upload documents first.', 400); return; }
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }

    const uploaded = verification.documents.map((d) => d.documentType as string);
    const required = ['national_id_front','national_id_back','kra_pin'];
    if (tenant.accountType === 'estate_agent') required.push('earb_certificate','business_registration');
    const missing = required.filter((r) => !uploaded.includes(r));
    if (missing.length > 0) { sendError(res, `Missing: ${missing.join(', ')}.`, 400); return; }

    verification.status = VerificationStatus.DOCUMENTS_UPLOADED;
    verification.submittedAt = new Date();
    await verification.save();
    await Tenant.findByIdAndUpdate(req.user!.tenantId, { verificationStatus: VerificationStatus.DOCUMENTS_UPLOADED });

    const admins = await User.find({ role: 'platform_admin' });
    if (admins.length > 0) {
      await Notification.insertMany(admins.map((a) => ({
        userId: a._id, tenantId: req.user!.tenantId, type: NotificationType.VERIFICATION,
        title: 'New Verification Submission', body: `${tenant.businessName} submitted verification documents.`,
        link: `/admin/verifications/${verification._id}`,
      })));
    }
    await createAuditLog({ action: AuditAction.VERIFICATION_SUBMIT, resourceType: 'Verification', resourceId: verification._id.toString(), req, actor: req.user });
    sendSuccess(res, 'Documents submitted. We will respond within 1-2 business days.');
  } catch (err) { next(err); }
};

export const adminGetVerifications = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, page, limit: lim } = req.query as Record<string,string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '20');
    const filter: Record<string,unknown> = {};
    if (status && status !== 'all') filter.status = status;
    const [verifications, total] = await Promise.all([
      Verification.find(filter).sort({ submittedAt: 1 }).skip(skip).limit(l)
        .populate('tenantId','businessName accountType contactEmail contactPhone county')
        .populate('submittedBy','fullName email'),
      Verification.countDocuments(filter),
    ]);
    sendPaginated(res, 'Queue fetched.', verifications, total, p, l);
  } catch (err) { next(err); }
};

export const adminGetVerification = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const verification = await Verification.findById(req.params.id)
      .populate('tenantId','businessName accountType contactEmail contactPhone county status')
      .populate('submittedBy','fullName email').populate('reviewedBy','fullName email');
    if (!verification) { sendError(res, 'Not found.', 404); return; }
    const docs = verification.documents.map((d) => ({ documentType: d.documentType, url: d.url, publicId: d.publicId, uploadedAt: d.uploadedAt, status: d.status, signedUrl: getSignedUrl(d.publicId) }));
    sendSuccess(res, 'Verification fetched.', { ...verification.toObject(), documents: docs });
  } catch (err) { next(err); }
};

export const adminReviewVerification = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, notes } = req.body as { status: VerificationStatus; notes?: string };
    const allowed = [VerificationStatus.APPROVED, VerificationStatus.REJECTED, VerificationStatus.INFORMATION_REQUESTED, VerificationStatus.UNDER_REVIEW];
    if (!allowed.includes(status)) { sendError(res, 'Invalid status.', 400); return; }
    if ([VerificationStatus.REJECTED, VerificationStatus.INFORMATION_REQUESTED].includes(status) && !notes) {
      sendError(res, 'Notes required.', 400); return;
    }
    const verification = await Verification.findById(req.params.id);
    if (!verification) { sendError(res, 'Not found.', 404); return; }

    const [tenant, submitter] = await Promise.all([
      Tenant.findById(verification.tenantId),
      User.findById(verification.submittedBy).select('fullName email'),
    ]);

    verification.status = status;
    verification.adminNotes = notes ?? null;
    (verification as any).reviewedBy = req.user!.userId;
    verification.reviewedAt = new Date();
    await verification.save();

    const tenantUpdate: Record<string,unknown> = { verificationStatus: status };
    if (status === VerificationStatus.APPROVED) tenantUpdate.status = TenantStatus.ACTIVE;
    if (tenant) await Tenant.findByIdAndUpdate(tenant._id, tenantUpdate);

    if (submitter) {
      if (status === VerificationStatus.APPROVED) await sendVerificationApprovedEmail(submitter.email, submitter.fullName);
      else if (status === VerificationStatus.REJECTED && notes) await sendVerificationRejectedEmail(submitter.email, submitter.fullName, notes);
      else if (status === VerificationStatus.INFORMATION_REQUESTED && notes) await sendVerificationInfoRequestEmail(submitter.email, submitter.fullName, notes);

      await Notification.create({
        userId: verification.submittedBy, tenantId: verification.tenantId, type: NotificationType.VERIFICATION,
        title: status === VerificationStatus.APPROVED ? '✅ Verification Approved!' : status === VerificationStatus.REJECTED ? 'Verification Not Approved' : 'Action Required',
        body: notes || 'Your verification status has been updated.', link: '/dashboard/verification',
      });
    }

    await createAuditLog({
      action: status === VerificationStatus.APPROVED ? AuditAction.VERIFICATION_APPROVE : AuditAction.VERIFICATION_REJECT,
      resourceType: 'Verification', resourceId: verification._id.toString(), payload: { status, notes }, req, actor: req.user,
    });
    sendSuccess(res, `Verification ${status}.`, verification);
  } catch (err) { next(err); }
};

export const adminGetEarbTracker = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status } = req.query as { status?: string };
    const now = new Date();
    const filter: Record<string,unknown> = { accountType: 'estate_agent', verificationStatus: VerificationStatus.APPROVED };
    if (status === 'expired') filter.earbExpiryDate = { $lt: now };
    else if (status === 'critical') filter.earbExpiryDate = { $gte: now, $lt: new Date(now.getTime() + 14*86400000) };
    else if (status === 'expiring-soon') filter.earbExpiryDate = { $gte: now, $lt: new Date(now.getTime() + 30*86400000) };
    const tenants = await Tenant.find(filter).sort({ earbExpiryDate: 1 }).select('businessName earbNumber earbExpiryDate earbLastNotifiedAt activeListings status');
    sendSuccess(res, 'EARB tracker fetched.', tenants);
  } catch (err) { next(err); }
};
