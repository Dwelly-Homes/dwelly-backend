import { body } from 'express-validator';

export const registerValidator = [
  body('fullName').trim().notEmpty().withMessage('Full name is required')
    .isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('A valid email is required'),
  body('phone').matches(/^\+254[17]\d{8}$/).withMessage('Phone must be a valid Kenyan number (+254...)'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
  body('accountType').isIn(['estate_agent', 'landlord', 'searcher']).withMessage('Invalid account type'),
];

export const loginValidator = [
  body('identifier').notEmpty().withMessage('Email or phone is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const forgotPasswordValidator = [
  body('identifier').notEmpty().withMessage('Email or phone is required'),
];

export const resetPasswordValidator = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain a number'),
];

export const verifyOtpValidator = [
  body('phone').matches(/^\+254[17]\d{8}$/).withMessage('Valid Kenyan phone number required'),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('OTP must be 6 digits'),
];
