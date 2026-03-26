import { Response, NextFunction } from 'express';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { AuthRequest, PropertyStatus, VerificationStatus, AuditAction } from '../types';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { getPagination, PLAN_LIMITS } from '../utils/helpers';
import { createAuditLog } from '../utils/audit';
import { deleteFromCloudinary } from '../services/storage/cloudinary';

const assertVerified = async (tenantId: string, res: Response): Promise<boolean> => {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant || tenant.verificationStatus !== VerificationStatus.APPROVED) {
    sendError(res, 'Your account must be verified before listing properties.', 403);
    return false;
  }
  return true;
};

export const createProperty = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!await assertVerified(req.user!.tenantId!, res)) return;
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }
    const limit = PLAN_LIMITS[tenant.subscriptionPlan].listings;
    if (limit !== Infinity && tenant.activeListings >= limit) {
      sendError(res, `Your ${tenant.subscriptionPlan} plan allows max ${limit} active listings. Upgrade to add more.`, 403); return;
    }
    const property = await Property.create({ ...req.body, tenantId: req.user!.tenantId, agentId: req.body.agentId || req.user!.userId, status: PropertyStatus.DRAFT });
    await createAuditLog({ action: AuditAction.PROPERTY_CREATE, resourceType: 'Property', resourceId: property._id.toString(), req, actor: req.user });
    sendSuccess(res, 'Property created. Add photos to publish.', property, 201);
  } catch (err) { next(err); }
};

export const getMyProperties = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const _q = req.query as Record<string, string | string[]>;
    const status = _q.status as string | undefined;
    const search = _q.search as string | undefined;
    const page = _q.page as string | undefined;
    const lim = _q.limit as string | undefined;
    const sort = Array.isArray(_q.sort) ? _q.sort[0] : (_q.sort as string || 'createdAt');
    const order = (_q.order as string) || 'desc';
    const { page: p, limit: l, skip } = getPagination(page, lim);
    const filter: Record<string,unknown> = { tenantId: req.user!.tenantId };
    if (status) filter.status = status;
    if (search) filter.$text = { $search: search };
    const _sk = sort ? (Array.isArray(sort) ? String((sort as string[])[0]) : sort as string) : 'createdAt';
    const _sd: 1|-1 = (order as string) === 'asc' ? 1 : -1;
    const sortObj: Record<string,1|-1> = { [_sk]: _sd };
    const [properties, total] = await Promise.all([
      Property.find(filter).sort(sortObj).skip(skip).limit(l).populate({ path: 'agentId', select: 'fullName email' }),
      Property.countDocuments(filter),
    ]);
    sendPaginated(res, 'Properties fetched.', properties, total, p, l);
  } catch (err) { next(err); }
};

export const getPropertyById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const property = await Property.findOne({ _id: req.params.id, tenantId: req.user!.tenantId }).populate('agentId','fullName email phone');
    if (!property) { sendError(res, 'Property not found.', 404); return; }
    sendSuccess(res, 'Property fetched.', property);
  } catch (err) { next(err); }
};

export const updateProperty = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const allowed = ['title','description','propertyType','monthlyRent','serviceCharge','county','constituency','neighborhood','streetEstate','coordinates','amenities','status','availableFrom','expiresAt','agentId'];
    const updates: Record<string,unknown> = {};
    allowed.forEach((k) => { if ((req.body as Record<string,unknown>)[k] !== undefined) updates[k] = (req.body as Record<string,unknown>)[k]; });
    const property = await Property.findOneAndUpdate({ _id: req.params.id, tenantId: req.user!.tenantId }, updates, { new: true, runValidators: true });
    if (!property) { sendError(res, 'Property not found.', 404); return; }
    await Tenant.findByIdAndUpdate(req.user!.tenantId, { activeListings: await Property.countDocuments({ tenantId: req.user!.tenantId, status: PropertyStatus.AVAILABLE }) });
    await createAuditLog({ action: AuditAction.PROPERTY_UPDATE, resourceType: 'Property', resourceId: property._id.toString(), req, actor: req.user });
    sendSuccess(res, 'Property updated.', property);
  } catch (err) { next(err); }
};

export const deleteProperty = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const property = await Property.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!property) { sendError(res, 'Property not found.', 404); return; }
    await Promise.all(property.images.map((img) => deleteFromCloudinary(img.publicId)));
    await property.deleteOne();
    await createAuditLog({ action: AuditAction.PROPERTY_DELETE, resourceType: 'Property', resourceId: String(req.params.id), req, actor: req.user });
    sendSuccess(res, 'Property deleted.');
  } catch (err) { next(err); }
};

export const uploadPropertyImages = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) { sendError(res, 'No images uploaded.', 400); return; }
    const property = await Property.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!property) { sendError(res, 'Property not found.', 404); return; }
    if (property.images.length >= 20) { sendError(res, 'Maximum 20 images per property.', 400); return; }
    const files = req.files as (Express.Multer.File & { path: string; filename: string })[];
    const newImages = files.map((f, i) => ({ url: f.path, publicId: f.filename, isCover: property.images.length === 0 && i === 0, order: property.images.length + i }));
    property.images.push(...newImages);
    await property.save();
    sendSuccess(res, `${files.length} image(s) uploaded.`, { images: property.images });
  } catch (err) { next(err); }
};

export const deletePropertyImage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const property = await Property.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!property) { sendError(res, 'Property not found.', 404); return; }
    const idx = property.images.findIndex((img) => img.publicId === req.params.imageId);
    if (idx === -1) { sendError(res, 'Image not found.', 404); return; }
    await deleteFromCloudinary(property.images[idx].publicId);
    property.images.splice(idx, 1);
    if (property.images.length > 0 && !property.images.some((i) => i.isCover)) property.images[0].isCover = true;
    await property.save();
    sendSuccess(res, 'Image deleted.', { images: property.images });
  } catch (err) { next(err); }
};

export const reorderPropertyImages = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { imageIds } = req.body as { imageIds: string[] };
    const property = await Property.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!property) { sendError(res, 'Property not found.', 404); return; }
    const reordered = imageIds.map((pid, i) => {
      const img = property.images.find((im) => im.publicId === pid);
      if (!img) throw new Error(`Image ${pid} not found`);
      return { ...img, order: i };
    });
    property.images = reordered;
    await property.save();
    sendSuccess(res, 'Image order updated.', { images: property.images });
  } catch (err) { next(err); }
};

export const setCoverImage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const property = await Property.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!property) { sendError(res, 'Property not found.', 404); return; }
    property.images = property.images.map((img) => ({ ...img, isCover: img.publicId === req.params.imageId }));
    await property.save();
    sendSuccess(res, 'Cover image updated.', { images: property.images });
  } catch (err) { next(err); }
};

export const getMarketplaceListings = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { county, neighborhood, propertyType, minPrice, maxPrice, search, agentSlug, page, limit: lim } = req.query as Record<string,string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '12');
    const filter: Record<string,unknown> = { status: PropertyStatus.AVAILABLE, isHiddenByAdmin: false, expiresAt: { $gt: new Date() } };
    if (county) filter.county = new RegExp(county, 'i');
    if (neighborhood) filter.neighborhood = new RegExp(neighborhood, 'i');
    if (propertyType) filter.propertyType = propertyType;
    if (minPrice || maxPrice) {
      filter.monthlyRent = {} as Record<string,unknown>;
      if (minPrice) (filter.monthlyRent as Record<string,unknown>).$gte = parseFloat(minPrice);
      if (maxPrice) (filter.monthlyRent as Record<string,unknown>).$lte = parseFloat(maxPrice);
    }
    if (search) filter.$text = { $search: search };
    if (agentSlug) {
      const t = await Tenant.findOne({ slug: agentSlug });
      if (t) filter.tenantId = t._id;
    }
    const [properties, total] = await Promise.all([
      Property.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l)
        .populate({ path: 'tenantId', select: 'businessName slug logo verificationStatus earbNumber earbExpiryDate' })
        .select('-__v'),
      Property.countDocuments(filter),
    ]);
    if (properties.length > 0) Property.updateMany({ _id: { $in: properties.map((x) => x._id) } }, { $inc: { viewCount: 1 } }).exec();
    sendPaginated(res, 'Listings fetched.', properties, total, p, l);
  } catch (err) { next(err); }
};

export const getMarketplaceProperty = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const property = await Property.findOne({ _id: req.params.id, isHiddenByAdmin: false })
      .populate({ path: 'tenantId', select: 'businessName slug logo verificationStatus earbNumber earbExpiryDate county contactPhone' })
      .populate({ path: 'agentId', select: 'fullName' });
    if (!property) { sendError(res, 'Property not found or no longer available.', 404); return; }
    await Property.findByIdAndUpdate(property._id, { $inc: { viewCount: 1 } });
    sendSuccess(res, 'Property fetched.', property);
  } catch (err) { next(err); }
};

export const adminTogglePropertyVisibility = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const property = await Property.findByIdAndUpdate(req.params.id, { isHiddenByAdmin: (req.body as { hidden: boolean }).hidden }, { new: true });
    if (!property) { sendError(res, 'Property not found.', 404); return; }
    sendSuccess(res, `Property ${(req.body as { hidden: boolean }).hidden ? 'hidden' : 'unhidden'}.`, property);
  } catch (err) { next(err); }
};
