import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { Otp } from '../models/Otp';
import { AuthRequest, AccountType, UserRole, AuditAction } from '../types';
import { sendSuccess, sendError } from '../utils/response';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { generateOTP, generateToken, normalizePhone, generateUniqueSlug } from '../utils/helpers';
import { createAuditLog } from '../utils/audit';
import { sendOtpEmail, sendPasswordResetEmail } from '../services/email';
import { sendOtpSms } from '../services/sms';
import { config } from '../config';

// ─── REGISTER ─────────────────────────────────────────────────────────────────

export const register = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { fullName, email, phone, password, accountType } = req.body;

    const normalizedPhone = normalizePhone(phone);

    // Check duplicates
    const existing = await User.findOne({ $or: [{ email }, { phone: normalizedPhone }] });
    if (existing) {
      sendError(res, existing.email === email ? 'Email already registered.' : 'Phone number already registered.', 409);
      return;
    }

    // Determine role from accountType
    const role = accountType === AccountType.SEARCHER
      ? UserRole.SEARCHER
      : UserRole.TENANT_ADMIN;

    const user = await User.create({
      fullName, email, phone: normalizedPhone, password, accountType, role,
      tenantId: null,
    });

    // For supply-side users, create a skeleton tenant
    if (accountType !== AccountType.SEARCHER) {
      const slug = await generateUniqueSlug(
        fullName,
        async (s) => !!(await Tenant.findOne({ slug: s }))
      );
      const tenant = await Tenant.create({
        businessName: fullName,
        slug,
        accountType,
        ownerId: user._id,
        contactEmail: email,
        contactPhone: normalizedPhone,
      });
      user.tenantId = tenant._id;
      await user.save();
    }

    // Send OTP for phone verification
    const otp = generateOTP();
    await Otp.create({
      phone: normalizedPhone,
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    });

    await Promise.all([
      sendOtpEmail(email, fullName, otp),
      sendOtpSms(normalizedPhone, otp),
    ]);

    await createAuditLog({
      action: AuditAction.USER_REGISTER,
      resourceType: 'User',
      resourceId: user._id.toString(),
      req,
    });

    sendSuccess(res, 'Registration successful. Please verify your phone number.', {
      userId: user._id,
      phone: normalizedPhone,
    }, 201);
  } catch (err) {
    next(err);
  }
};

// ─── VERIFY OTP ───────────────────────────────────────────────────────────────

export const verifyOtp = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone, otp } = req.body;
    const normalizedPhone = normalizePhone(phone);

    const record = await Otp.findOne({ phone: normalizedPhone, isUsed: false })
      .sort({ createdAt: -1 });

    if (!record) {
      sendError(res, 'No OTP found. Please request a new one.', 400);
      return;
    }
    if (record.expiresAt < new Date()) {
      sendError(res, 'OTP has expired. Please request a new one.', 400);
      return;
    }
    if (record.attempts >= 5) {
      sendError(res, 'Too many failed attempts. Please request a new OTP.', 429);
      return;
    }
    if (record.otp !== otp) {
      record.attempts += 1;
      await record.save();
      sendError(res, 'Invalid OTP. Please try again.', 400);
      return;
    }

    record.isUsed = true;
    await record.save();

    const user = await User.findOneAndUpdate(
      { phone: normalizedPhone },
      { isPhoneVerified: true },
      { new: true }
    );

    if (!user) {
      sendError(res, 'User not found.', 404);
      return;
    }

    const payload = {
      userId: user._id.toString(),
      tenantId: user.tenantId?.toString() ?? null,
      role: user.role,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await User.findByIdAndUpdate(user._id, {
      $push: { refreshTokens: refreshToken },
      lastLoginAt: new Date(),
    });

    sendSuccess(res, 'Phone verified. Welcome to Dwelly Homes!', {
      accessToken,
      refreshToken,
      user: { id: user._id, fullName: user.fullName, role: user.role, tenantId: user.tenantId },
    });
  } catch (err) {
    next(err);
  }
};

// ─── RESEND OTP ───────────────────────────────────────────────────────────────

export const resendOtp = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone } = req.body;
    const normalizedPhone = normalizePhone(phone);

    const user = await User.findOne({ phone: normalizedPhone });
    if (!user) {
      sendError(res, 'No account found with this phone number.', 404);
      return;
    }

    const otp = generateOTP();
    await Otp.create({
      phone: normalizedPhone,
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    await Promise.all([
      sendOtpEmail(user.email, user.fullName, otp),
      sendOtpSms(normalizedPhone, otp),
    ]);

    sendSuccess(res, 'New OTP sent to your phone and email.');
  } catch (err) {
    next(err);
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────

export const login = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { identifier, password } = req.body;

    // Detect email or phone
    const isPhone = /^(\+254|07|01)\d+/.test(identifier);
    const query = isPhone
      ? { phone: normalizePhone(identifier) }
      : { email: identifier.toLowerCase() };

    const user = await User.findOne(query).select('+password +refreshTokens');
    if (!user || !(await user.comparePassword(password))) {
      sendError(res, 'Invalid credentials. Please check and try again.', 401);
      return;
    }

    if (!user.isActive) {
      sendError(res, 'Your account has been deactivated. Contact support.', 403);
      return;
    }

    const payload = {
      userId: user._id.toString(),
      tenantId: user.tenantId?.toString() ?? null,
      role: user.role,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // Keep max 5 refresh tokens per user (rotate old ones out)
    const tokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
    await User.findByIdAndUpdate(user._id, { refreshTokens: tokens, lastLoginAt: new Date() });

    await createAuditLog({
      action: AuditAction.USER_LOGIN,
      resourceType: 'User',
      resourceId: user._id.toString(),
      req, actor: payload,
    });

    sendSuccess(res, 'Login successful.', {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        accountType: user.accountType,
        tenantId: user.tenantId,
        isPhoneVerified: user.isPhoneVerified,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────

export const refreshToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      sendError(res, 'Refresh token required.', 400);
      return;
    }

    const payload = verifyRefreshToken(token);

    const user = await User.findById(payload.userId).select('+refreshTokens');
    if (!user || !user.refreshTokens?.includes(token)) {
      sendError(res, 'Invalid refresh token.', 401);
      return;
    }

    const newPayload = {
      userId: user._id.toString(),
      tenantId: user.tenantId?.toString() ?? null,
      role: user.role,
    };

    const newAccessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    // Rotate: remove old, add new
    const updatedTokens = user.refreshTokens.filter((t) => t !== token);
    updatedTokens.push(newRefreshToken);
    await User.findByIdAndUpdate(user._id, { refreshTokens: updatedTokens });

    sendSuccess(res, 'Token refreshed.', { accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
};

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

export const logout = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;
    if (req.user && token) {
      await User.findByIdAndUpdate(req.user.userId, {
        $pull: { refreshTokens: token },
      });
    }

    await createAuditLog({
      action: AuditAction.USER_LOGOUT,
      resourceType: 'User',
      resourceId: req.user?.userId,
      req, actor: req.user,
    });

    sendSuccess(res, 'Logged out successfully.');
  } catch (err) {
    next(err);
  }
};

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────

export const forgotPassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { identifier } = req.body;
    const isPhone = /^(\+254|07|01)\d+/.test(identifier);
    const query = isPhone ? { phone: normalizePhone(identifier) } : { email: identifier.toLowerCase() };

    const user = await User.findOne(query);

    // Always return success to prevent user enumeration
    const MSG = 'If an account exists, a reset link has been sent.';

    if (!user) {
      sendSuccess(res, MSG);
      return;
    }

    const token = generateToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await User.findByIdAndUpdate(user._id, {
      passwordResetToken: crypto.createHash('sha256').update(token).digest('hex'),
      passwordResetExpires: expires,
    });

    const resetUrl = `${config.clientUrl}/auth/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, user.fullName, resetUrl);

    sendSuccess(res, MSG);
  } catch (err) {
    next(err);
  }
};

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────

export const resetPassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, newPassword } = req.body;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select('+password +passwordResetToken +passwordResetExpires');

    if (!user) {
      sendError(res, 'Reset link is invalid or has expired. Please request a new one.', 400);
      return;
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    sendSuccess(res, 'Password reset successfully. You can now log in with your new password.');
  } catch (err) {
    next(err);
  }
};

// ─── GET MY PROFILE ───────────────────────────────────────────────────────────

export const getMe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.userId);
    if (!user) { sendError(res, 'User not found.', 404); return; }
    sendSuccess(res, 'Profile fetched.', user);
  } catch (err) { next(err); }
};

// ─── UPDATE MY PROFILE ────────────────────────────────────────────────────────

export const updateMe = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const allowed = ['fullName', 'occupation', 'employer', 'bio'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const user = await User.findByIdAndUpdate(req.user!.userId, updates, { new: true });
    if (!user) { sendError(res, 'User not found.', 404); return; }
    sendSuccess(res, 'Profile updated.', user);
  } catch (err) { next(err); }
};

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────

export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) { sendError(res, 'currentPassword and newPassword are required.', 400); return; }
    if (newPassword.length < 8) { sendError(res, 'New password must be at least 8 characters.', 400); return; }
    const user = await User.findById(req.user!.userId).select('+password');
    if (!user) { sendError(res, 'User not found.', 404); return; }
    const valid = await user.comparePassword(currentPassword);
    if (!valid) { sendError(res, 'Current password is incorrect.', 400); return; }
    user.password = newPassword;
    await user.save();
    sendSuccess(res, 'Password changed successfully.');
  } catch (err) { next(err); }
};

// ─── VALIDATE RESET TOKEN ─────────────────────────────────────────────────────

export const validateResetToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token } = req.query as { token: string };
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      sendError(res, 'This reset link is invalid or has expired.', 400);
      return;
    }

    sendSuccess(res, 'Token is valid.');
  } catch (err) {
    next(err);
  }
};
