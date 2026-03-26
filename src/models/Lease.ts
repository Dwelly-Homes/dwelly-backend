import mongoose, { Document, Schema, Types } from 'mongoose';

export type LeaseStatus = 'active' | 'expired' | 'terminated';

export interface ILease extends Document {
  _id: Types.ObjectId;
  propertyId: Types.ObjectId;
  tenantId: Types.ObjectId;       // property-management company
  agentId: Types.ObjectId;        // agent staff who created the lease
  occupantUserId: Types.ObjectId | null; // searcher user account (if exists)
  occupantName: string;
  occupantPhone: string;
  occupantEmail: string | null;
  monthlyRent: number;
  depositAmount: number;
  leaseStart: Date;
  leaseEnd: Date | null;
  status: LeaseStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const LeaseSchema = new Schema<ILease>(
  {
    propertyId:       { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    tenantId:         { type: Schema.Types.ObjectId, ref: 'Tenant',   required: true },
    agentId:          { type: Schema.Types.ObjectId, ref: 'User',     required: true },
    occupantUserId:   { type: Schema.Types.ObjectId, ref: 'User',     default: null },
    occupantName:     { type: String, required: true, trim: true },
    occupantPhone:    { type: String, required: true },
    occupantEmail:    { type: String, default: null, lowercase: true, trim: true },
    monthlyRent:      { type: Number, required: true, min: 0 },
    depositAmount:    { type: Number, required: true, min: 0, default: 0 },
    leaseStart:       { type: Date, required: true },
    leaseEnd:         { type: Date, default: null },
    status:           { type: String, enum: ['active', 'expired', 'terminated'], default: 'active' },
    notes:            { type: String, default: null, maxlength: 1000, trim: true },
  },
  { timestamps: true }
);

LeaseSchema.index({ tenantId: 1, status: 1 });
LeaseSchema.index({ propertyId: 1 });
LeaseSchema.index({ occupantUserId: 1 });

export const Lease = mongoose.model<ILease>('Lease', LeaseSchema);
