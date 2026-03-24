import { body, query } from 'express-validator';

export const createPropertyValidator = [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 100 }),
  body('description').trim().notEmpty().withMessage('Description is required').isLength({ max: 2000 }),
  body('propertyType').isIn([
    'bedsitter','studio','1_bedroom','2_bedroom','3_bedroom','4_plus_bedroom',
    'maisonette','bungalow','townhouse','commercial',
  ]).withMessage('Invalid property type'),
  body('monthlyRent').isFloat({ min: 0 }).withMessage('Monthly rent must be a positive number'),
  body('serviceCharge').optional().isFloat({ min: 0 }),
  body('county').trim().notEmpty().withMessage('County is required'),
  body('neighborhood').trim().notEmpty().withMessage('Neighborhood is required'),
  body('amenities').optional().isArray(),
  body('expiresAt').optional().isISO8601().withMessage('Invalid expiry date'),
];

export const updatePropertyValidator = [
  body('title').optional().trim().isLength({ max: 100 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('monthlyRent').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(['available','occupied','under_maintenance','draft']),
  body('amenities').optional().isArray(),
];

export const marketplaceQueryValidator = [
  query('county').optional().trim(),
  query('neighborhood').optional().trim(),
  query('propertyType').optional(),
  query('minPrice').optional().isFloat({ min: 0 }),
  query('maxPrice').optional().isFloat({ min: 0 }),
  query('status').optional().isIn(['available']),
  query('search').optional().trim(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
];
