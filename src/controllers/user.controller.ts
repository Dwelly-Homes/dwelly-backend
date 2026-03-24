import { Response, NextFunction } from 'express';
import { User } from '../models/User';
import { Invitation } from '../models/Invitation';
import { Tenant } from '../models/Tenant';
import { AuthRequest, UserRole } from '../types';
import { sendSuccess, sendError } from '../utils/response';
import { generateToken, normalizePhone } from '../utils/helpers';
import { sendInvitationEmail } from '../services/email';
import { config } from '../config';

export const getTeamMembers = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const users = await User.find({ tenantId: req.user!.tenantId }).select('fullName email phone role isActive createdAt lastLoginAt');
    sendSuccess(res, 'Team members fetched.', users);
  } catch (err) { next(err); }
};

export const inviteTeamMember = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, fullName, role } = req.body as { email: string; fullName: string; role: UserRole };
    if (![UserRole.AGENT_STAFF, UserRole.CARETAKER].includes(role)) { sendError(res, 'Invalid role.', 400); return; }
    const existing = await User.findOne({ email, tenantId: req.user!.tenantId });
    if (existing) { sendError(res, 'A team member with this email already exists.', 409); return; }
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) { sendError(res, 'Tenant not found.', 404); return; }
    const token = generateToken();
    await Invitation.create({ tenantId: req.user!.tenantId!, invitedBy: req.user!.userId, email, fullName, role, token, expiresAt: new Date(Date.now() + 48*60*60*1000) });
    await sendInvitationEmail(email, fullName, tenant.businessName, role, `${config.clientUrl}/invite/accept?token=${token}`);
    sendSuccess(res, `Invitation sent to ${email}.`, { email, role }, 201);
  } catch (err) { next(err); }
};

export const validateInvitation = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token } = req.query as { token: string };
    const invitation = await Invitation.findOne({ token, acceptedAt: null }).populate('tenantId','businessName');
    if (!invitation || invitation.expiresAt < new Date()) { sendError(res, 'Invitation is invalid or has expired.', 400); return; }
    sendSuccess(res, 'Invitation is valid.', { email: invitation.email, fullName: invitation.fullName, role: invitation.role, organization: (invitation.tenantId as unknown as { businessName: string }).businessName });
  } catch (err) { next(err); }
};

export const acceptInvitation = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, fullName, password, phone } = req.body as { token: string; fullName: string; password: string; phone: string };
    const invitation = await Invitation.findOne({ token, acceptedAt: null });
    if (!invitation || invitation.expiresAt < new Date()) { sendError(res, 'Invitation is invalid or has expired.', 400); return; }
    const normalizedPhone = normalizePhone(phone);
    const existing = await User.findOne({ $or: [{ email: invitation.email }, { phone: normalizedPhone }] });
    if (existing) { sendError(res, 'An account with this email or phone already exists.', 409); return; }
    const user = await User.create({ fullName, email: invitation.email, phone: normalizedPhone, password, role: invitation.role, accountType: 'estate_agent', tenantId: invitation.tenantId, isPhoneVerified: true });
    invitation.acceptedAt = new Date();
    await invitation.save();
    sendSuccess(res, 'Account created. You can now log in.', { userId: user._id, email: user.email }, 201);
  } catch (err) { next(err); }
};

export const updateTeamMemberRole = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role } = req.body as { role: UserRole };
    if (![UserRole.AGENT_STAFF, UserRole.CARETAKER].includes(role)) { sendError(res, 'Invalid role.', 400); return; }
    const user = await User.findOneAndUpdate({ _id: req.params.id, tenantId: req.user!.tenantId }, { role }, { new: true });
    if (!user) { sendError(res, 'Team member not found.', 404); return; }
    sendSuccess(res, 'Role updated.', user);
  } catch (err) { next(err); }
};

export const toggleTeamMemberStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.params.id === req.user!.userId) { sendError(res, 'Cannot suspend your own account.', 400); return; }
    const user = await User.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!user) { sendError(res, 'Team member not found.', 404); return; }
    user.isActive = !user.isActive;
    await user.save();
    sendSuccess(res, `Team member ${user.isActive ? 'reactivated' : 'suspended'}.`, user);
  } catch (err) { next(err); }
};

export const removeTeamMember = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.params.id === req.user!.userId) { sendError(res, 'Cannot remove yourself.', 400); return; }
    const user = await User.findOneAndDelete({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!user) { sendError(res, 'Team member not found.', 404); return; }
    sendSuccess(res, 'Team member removed.');
  } catch (err) { next(err); }
};
