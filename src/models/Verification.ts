import mongoose, { Document, Schema, Types } from 'mongoose';
import { VerificationStatus } from '../types';

export type DocumentType = 'national_id_front' | 'national_id_back' | 'kra_pin' | 'business_registration' | 'earb_certificate';

export interface IVerificationDocument {
  documentType: DocumentType;
  url: string;
  publicId: string;
  uploadedAt: Date;
  status: 'pending' | 'approved' | 'rejected';
}

export interface IVerification extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  submittedBy: Types.ObjectId;
  status: VerificationStatus;
  documents: IVerificationDocument[];
  earbNumber: string | null;
  earbExpiryDate: Date | null;
  adminNotes: string | null;
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const VerificationDocumentSchema = new Schema<IVerificationDocument>({
  documentType: {
    type: String,
    enum: ['national_id_front', 'national_id_back', 'kra_pin', 'business_registration', 'earb_certificate'],
    required: true,
  },
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, { _id: false });

const VerificationSchema = new Schema<IVerification>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String, enum: Object.values(VerificationStatus),
      default: VerificationStatus.NOT_SUBMITTED,
    },
    documents: { type: [VerificationDocumentSchema], default: [] },
    earbNumber: { type: String, default: null },
    earbExpiryDate: { type: Date, default: null },
    adminNotes: { type: String, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

VerificationSchema.index({ tenantId: 1 });
VerificationSchema.index({ status: 1 });

export const Verification = mongoose.model<IVerification>('Verification', VerificationSchema);
