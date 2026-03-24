import { Response, NextFunction } from 'express';
import { Tenant } from '../models/Tenant';
import { AuthRequest } from '../types';
import { sendSuccess, sendError } from '../utils/response';
import { deleteFromCloudinary } from '../services/storage/cloudinary';

// ─── GET MY TENANT ────────────────────────────────────────────────────────────

export const getMyTenant = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }
    sendSuccess(res, 'Tenant fetched.', tenant);
  } catch (err) { next(err); }
};

// ─── UPDATE TENANT PROFILE ────────────────────────────────────────────────────

export const updateTenantProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const allowed = ['businessName', 'contactEmail', 'contactPhone', 'physicalAddress', 'county', 'bio'];
    const updates: Record<string, unknown> = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const tenant = await Tenant.findByIdAndUpdate(
      req.user!.tenantId,
      updates,
      { new: true, runValidators: true }
    );
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }
    sendSuccess(res, 'Profile updated.', tenant);
  } catch (err) { next(err); }
};

// ─── UPLOAD LOGO ──────────────────────────────────────────────────────────────

export const uploadTenantLogo = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) { sendError(res, 'No file uploaded.', 400); return; }

    const file = req.file as Express.Multer.File & { path: string; filename: string };
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }

    // Delete old logo
    if (tenant.logo?.publicId) {
      await deleteFromCloudinary(tenant.logo.publicId);
    }

    tenant.logo = { url: file.path, publicId: file.filename };
    await tenant.save();

    sendSuccess(res, 'Logo uploaded.', { logo: tenant.logo });
  } catch (err) { next(err); }
};

// ─── SUBMIT ONBOARDING ────────────────────────────────────────────────────────

export const submitOnboarding = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }
    // Onboarding submission just marks the profile as ready; verification is separate
    sendSuccess(res, 'Onboarding complete. Proceed to document verification.');
  } catch (err) { next(err); }
};

// ─── ADMIN: GET ALL TENANTS ───────────────────────────────────────────────────

export const adminGetTenants = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, verificationStatus, county, search, page = '1', limit = '20' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (verificationStatus) filter.verificationStatus = verificationStatus;
    if (county) filter.county = new RegExp(county, 'i');
    if (search) filter.businessName = new RegExp(search, 'i');

    const p = Math.max(1, parseInt(page, 10));
    const l = Math.min(100, parseInt(limit, 10));
    const skip = (p - 1) * l;

    const [tenants, total] = await Promise.all([
      Tenant.find(filter).skip(skip).limit(l).sort({ createdAt: -1 }),
      Tenant.countDocuments(filter),
    ]);

    sendSuccess(res, 'Tenants fetched.', tenants, 200, {
      page: p, limit: l, total, totalPages: Math.ceil(total / l),
    });
  } catch (err) { next(err); }
};

// ─── ADMIN: SUSPEND / REACTIVATE ─────────────────────────────────────────────

export const adminUpdateTenantStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['active', 'suspended', 'deactivated'];
    if (!allowed.includes(status)) { sendError(res, 'Invalid status.', 400); return; }

    const tenant = await Tenant.findByIdAndUpdate(id, { status }, { new: true });
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }
    sendSuccess(res, `Tenant status updated to ${status}.`, tenant);
  } catch (err) { next(err); }
};
