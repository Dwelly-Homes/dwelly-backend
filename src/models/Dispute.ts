import mongoose, { Document, Schema, Types } from 'mongoose';

export enum DisputeStatus {
  OPEN             = 'open',
  UNDER_REVIEW     = 'under_review',
  RESOLVED_REFUND  = 'resolved_refund',  // Admin decided: refund tenant
  RESOLVED_RELEASE = 'resolved_release', // Admin decided: release to landlord
}

export interface IDispute extends Document {
  _id: Types.ObjectId;

  rentPaymentId:  Types.ObjectId;
  leaseId:        Types.ObjectId;
  propertyId:     Types.ObjectId;
  organizationId: Types.ObjectId;
  raisedByUserId: Types.ObjectId; // The tenant who raised the dispute

  reason:   string;
  evidence: string | null; // Optional additional context

  status: DisputeStatus;

  adminNote:      string | null;
  resolvedByUserId: Types.ObjectId | null;
  resolvedAt:     Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const DisputeSchema = new Schema<IDispute>(
  {
    rentPaymentId:  { type: Schema.Types.ObjectId, ref: 'RentPayment', required: true },
    leaseId:        { type: Schema.Types.ObjectId, ref: 'Lease',       required: true },
    propertyId:     { type: Schema.Types.ObjectId, ref: 'Property',    required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Tenant',      required: true },
    raisedByUserId: { type: Schema.Types.ObjectId, ref: 'User',        required: true },

    reason:   { type: String, required: true, trim: true, maxlength: 1000 },
    evidence: { type: String, default: null, trim: true, maxlength: 2000 },

    status: {
      type:    String,
      enum:    Object.values(DisputeStatus),
      default: DisputeStatus.OPEN,
    },

    adminNote:         { type: String, default: null },
    resolvedByUserId:  { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt:        { type: Date, default: null },
  },
  { timestamps: true }
);

DisputeSchema.index({ status: 1, createdAt: -1 });
DisputeSchema.index({ rentPaymentId: 1 }, { unique: true }); // one dispute per payment
DisputeSchema.index({ organizationId: 1, status: 1 });
DisputeSchema.index({ raisedByUserId: 1 });

export const Dispute = mongoose.model<IDispute>('Dispute', DisputeSchema);
