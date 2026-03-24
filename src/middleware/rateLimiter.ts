import rateLimit from 'express-rate-limit';
import { sendError } from '../utils/response';

const limiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, message, 429),
  });

// Strict limiter for auth endpoints
export const authLimiter = limiter(
  15 * 60 * 1000,  // 15 minutes
  10,
  'Too many attempts from this IP. Please try again in 15 minutes.'
);

// OTP resend limiter
export const otpLimiter = limiter(
  60 * 1000,  // 1 minute
  1,
  'Please wait 60 seconds before requesting a new OTP.'
);

// General API limiter
export const apiLimiter = limiter(
  60 * 1000,  // 1 minute
  120,
  'Too many requests. Please slow down.'
);

// M-Pesa STK Push limiter
export const mpesaLimiter = limiter(
  60 * 1000,
  3,
  'Too many payment requests. Please wait before trying again.'
);
