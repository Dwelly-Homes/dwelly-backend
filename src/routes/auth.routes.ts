import { Router } from 'express';
import {
  register, login, verifyOtp, resendOtp, refreshToken,
  logout, forgotPassword, resetPassword, validateResetToken,
  getMe, updateMe, changePassword,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import {
  registerValidator, loginValidator, forgotPasswordValidator,
  resetPasswordValidator, verifyOtpValidator,
} from '../validators/auth.validator';
import { authLimiter, otpLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register',          authLimiter, validate(registerValidator),       register);
router.post('/login',             authLimiter, validate(loginValidator),           login);
router.post('/verify-otp',        validate(verifyOtpValidator),                   verifyOtp);
router.post('/resend-otp',        otpLimiter,                                     resendOtp);
router.post('/refresh-token',                                                      refreshToken);
router.post('/logout',            authenticate,                                    logout);
router.get('/me',                 authenticate,                                    getMe);
router.patch('/me',               authenticate,                                    updateMe);
router.post('/change-password',   authenticate,                                    changePassword);
router.post('/forgot-password',   authLimiter, validate(forgotPasswordValidator), forgotPassword);
router.patch('/reset-password',   validate(resetPasswordValidator),               resetPassword);
router.get('/validate-reset-token',                                                validateResetToken);

export default router;
