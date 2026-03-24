import { Router } from 'express';
import {
  createProperty, getMyProperties, getPropertyById, updateProperty, deleteProperty,
  uploadPropertyImages, deletePropertyImage, reorderPropertyImages, setCoverImage,
  getMarketplaceListings, getMarketplaceProperty, adminTogglePropertyVisibility,
} from '../controllers/property.controller';
import { authenticate, requireAgentOrAdmin, requirePlatformAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createPropertyValidator, updatePropertyValidator, marketplaceQueryValidator } from '../validators/property.validator';
import { uploadPropertyImages as uploadMiddleware } from '../services/storage/cloudinary';

const router = Router();

// ─── PUBLIC MARKETPLACE ───────────────────────────────────────────────────────
router.get('/marketplace',          validate(marketplaceQueryValidator), getMarketplaceListings);
router.get('/marketplace/:id',                                           getMarketplaceProperty);

// ─── DASHBOARD (authenticated) ───────────────────────────────────────────────
router.get('/',                     authenticate, requireAgentOrAdmin,   getMyProperties);
router.post('/',                    authenticate, requireAgentOrAdmin,
  validate(createPropertyValidator),                                     createProperty);
router.get('/:id',                  authenticate, requireAgentOrAdmin,   getPropertyById);
router.patch('/:id',                authenticate, requireAgentOrAdmin,
  validate(updatePropertyValidator),                                     updateProperty);
router.delete('/:id',               authenticate, requireAgentOrAdmin,   deleteProperty);

// ─── IMAGES ───────────────────────────────────────────────────────────────────
router.post('/:id/images',          authenticate, requireAgentOrAdmin,
  uploadMiddleware.array('images', 20),                                  uploadPropertyImages);
router.delete('/:id/images/:imageId', authenticate, requireAgentOrAdmin, deletePropertyImage);
router.patch('/:id/images/order',   authenticate, requireAgentOrAdmin,   reorderPropertyImages);
router.patch('/:id/images/:imageId/cover', authenticate, requireAgentOrAdmin, setCoverImage);

// ─── ADMIN ────────────────────────────────────────────────────────────────────
router.patch('/:id/admin/visibility', authenticate, requirePlatformAdmin, adminTogglePropertyVisibility);

export default router;
