import mongoose, { Document, Schema, Types } from 'mongoose';
import { UserRole } from '../types';

export interface IInvitation extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  invitedBy: Types.ObjectId;
  email: string;
  fullName: string;
  role: UserRole;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    invitedBy:  { type: Schema.Types.ObjectId, ref: 'User',   required: true },
    email:      { type: String, required: true, lowercase: true, trim: true },
    fullName:   { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: [UserRole.AGENT_STAFF, UserRole.CARETAKER],
      required: true,
    },
    token:      { type: String, required: true, unique: true },
    expiresAt:  { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

InvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invitation = mongoose.model<IInvitation>('Invitation', InvitationSchema);
