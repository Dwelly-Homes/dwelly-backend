import mongoose, { Document, Schema, Types } from 'mongoose';
import { AccountType, TenantStatus, VerificationStatus, SubscriptionPlan } from '../types';

export interface ITenant extends Document {
  _id: Types.ObjectId;
  businessName: string;
  slug: string;
  accountType: AccountType;
  ownerId: Types.ObjectId;
  contactEmail: string;
  contactPhone: string;
  physicalAddress: string;
  county: string;
  bio: string;
  logo: { url: string; publicId: string } | null;
  status: TenantStatus;
  verificationStatus: VerificationStatus;
  adminNotes: string | null;

  // EARB
  earbNumber: string | null;
  earbExpiryDate: Date | null;
  earbLastNotifiedAt: Date | null;

  // Subscription
  subscriptionPlan: SubscriptionPlan;
  subscriptionExpiresAt: Date | null;
  mpesaPhone: string | null;

  // Stats
  totalListings: number;
  activeListings: number;

  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema = new Schema<ITenant>(
  {
    businessName: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    accountType: { type: String, enum: Object.values(AccountType), required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    contactPhone: { type: String, required: true },
    physicalAddress: { type: String, default: '' },
    county: { type: String, default: '' },
    bio: { type: String, default: '', maxlength: 500 },
    logo: {
      type: { url: String, publicId: String },
      default: null,
    },
    status: {
      type: String, enum: Object.values(TenantStatus),
      default: TenantStatus.PENDING_VERIFICATION,
    },
    verificationStatus: {
      type: String, enum: Object.values(VerificationStatus),
      default: VerificationStatus.NOT_SUBMITTED,
    },
    adminNotes: { type: String, default: null },

    earbNumber: { type: String, default: null },
    earbExpiryDate: { type: Date, default: null },
    earbLastNotifiedAt: { type: Date, default: null },

    subscriptionPlan: {
      type: String, enum: Object.values(SubscriptionPlan),
      default: SubscriptionPlan.STARTER,
    },
    subscriptionExpiresAt: { type: Date, default: null },
    mpesaPhone: { type: String, default: null },

    totalListings: { type: Number, default: 0 },
    activeListings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TenantSchema.index({ status: 1 });
TenantSchema.index({ verificationStatus: 1 });
TenantSchema.index({ earbExpiryDate: 1 });
TenantSchema.index({ county: 1 });

export const Tenant = mongoose.model<ITenant>('Tenant', TenantSchema);
