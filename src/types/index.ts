import { Request } from 'express';
import { Types } from 'mongoose';

// ─── ENUMS ─────────────────────────────────────────────────────────────────────

export enum UserRole {
  TENANT_ADMIN = 'tenant_admin',
  AGENT_STAFF  = 'agent_staff',
  CARETAKER    = 'caretaker',
  PLATFORM_ADMIN = 'platform_admin',
  SEARCHER     = 'searcher', // Public tenants looking for houses
}

export enum AccountType {
  ESTATE_AGENT = 'estate_agent',
  LANDLORD     = 'landlord',
  SEARCHER     = 'searcher',
}

export enum TenantStatus {
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE               = 'active',
  SUSPENDED            = 'suspended',
  DEACTIVATED          = 'deactivated',
}

export enum VerificationStatus {
  NOT_SUBMITTED        = 'not_submitted',
  DOCUMENTS_UPLOADED   = 'documents_uploaded',
  UNDER_REVIEW         = 'under_review',
  INFORMATION_REQUESTED = 'information_requested',
  APPROVED             = 'approved',
  REJECTED             = 'rejected',
  SUSPENDED            = 'suspended',
}

export enum PropertyStatus {
  AVAILABLE        = 'available',
  OCCUPIED         = 'occupied',
  UNDER_MAINTENANCE = 'under_maintenance',
  DRAFT            = 'draft',
  EXPIRED          = 'expired',
  HIDDEN           = 'hidden',
}

export enum PropertyType {
  BEDSITTER   = 'bedsitter',
  STUDIO      = 'studio',
  ONE_BEDROOM = '1_bedroom',
  TWO_BEDROOM = '2_bedroom',
  THREE_BEDROOM = '3_bedroom',
  FOUR_PLUS   = '4_plus_bedroom',
  MAISONETTE  = 'maisonette',
  BUNGALOW    = 'bungalow',
  TOWNHOUSE   = 'townhouse',
  COMMERCIAL  = 'commercial',
}

export enum InquiryStatus {
  NEW        = 'new',
  RESPONDED  = 'responded',
  CLOSED     = 'closed',
}

export enum InquiryType {
  GENERAL    = 'general',
  VIEWING    = 'viewing_request',
  BOOKING    = 'booking_intent',
}

export enum ViewingStatus {
  PENDING   = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum PaymentType {
  SUBSCRIPTION = 'subscription',
  COMMISSION   = 'commission',
}

export enum PaymentStatus {
  PENDING   = 'pending',
  SUCCESS   = 'success',
  FAILED    = 'failed',
  CANCELLED = 'cancelled',
}

export enum SubscriptionPlan {
  STARTER      = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE   = 'enterprise',
}

export enum NotificationType {
  VERIFICATION  = 'verification',
  PROPERTY      = 'property',
  INQUIRY       = 'inquiry',
  PAYMENT       = 'payment',
  EARB          = 'earb',
  SYSTEM        = 'system',
}

export enum AuditAction {
  USER_REGISTER     = 'user.register',
  USER_LOGIN        = 'user.login',
  USER_LOGOUT       = 'user.logout',
  VERIFICATION_SUBMIT   = 'verification.submit',
  VERIFICATION_APPROVE  = 'verification.approve',
  VERIFICATION_REJECT   = 'verification.reject',
  PROPERTY_CREATE   = 'property.create',
  PROPERTY_UPDATE   = 'property.update',
  PROPERTY_DELETE   = 'property.delete',
  PAYMENT_INITIATED = 'payment.initiated',
  PAYMENT_SUCCESS   = 'payment.success',
  PAYMENT_FAILED    = 'payment.failed',
  ACCOUNT_SUSPEND   = 'account.suspend',
  ACCOUNT_REACTIVATE = 'account.reactivate',
  ADMIN_ACTION      = 'admin.action',
}

// ─── AUTH CONTEXT ──────────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  tenantId: string | null;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// ─── API RESPONSE ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// ─── PAGINATION ───────────────────────────────────────────────────────────────

export interface PaginationQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}
