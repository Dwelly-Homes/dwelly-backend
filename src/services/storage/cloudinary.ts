import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { config } from '../../config';

// Configure Cloudinary
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key:    config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

// ─── STORAGE PROFILES ─────────────────────────────────────────────────────────

const makeStorage = (folder: string, allowedFormats = ['jpg', 'jpeg', 'png', 'webp']) =>
  new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `dwelly/${folder}`,
      allowed_formats: allowedFormats,
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    } as Record<string, unknown>,
  });

// Property images — compressed + auto-format
const propertyStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'dwelly/properties',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 1280, height: 960, crop: 'limit' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  } as Record<string, unknown>,
});

// Verification documents — PDF and images, stored privately
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'dwelly/verification_docs',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    resource_type: 'auto',
    type: 'private',          // not publicly accessible without signed URL
  } as Record<string, unknown>,
});

// Tenant logos
const logoStorage = makeStorage('logos');

// ─── MULTER UPLOAD INSTANCES ──────────────────────────────────────────────────

const fileSizeLimit = (mb: number) => ({ fileSize: mb * 1024 * 1024 });

export const uploadPropertyImages = multer({
  storage: propertyStorage,
  limits: fileSizeLimit(5),
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WebP images are allowed'));
    }
  },
});

export const uploadVerificationDoc = multer({
  storage: documentStorage,
  limits: fileSizeLimit(10),
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and PDF files are allowed'));
    }
  },
});

export const uploadLogo = multer({
  storage: logoStorage,
  limits: fileSizeLimit(2),
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WebP images are allowed'));
    }
  },
});

// ─── DELETE FROM CLOUDINARY ────────────────────────────────────────────────────

export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: 'image' | 'raw' = 'image'
): Promise<void> => {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

// ─── SIGNED URL FOR PRIVATE DOCS ─────────────────────────────────────────────

export const getSignedUrl = (publicId: string): string => {
  return cloudinary.url(publicId, {
    type: 'private',
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
  });
};
