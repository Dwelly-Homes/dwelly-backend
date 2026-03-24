import mongoose, { Document, Schema, Types } from 'mongoose';
import { AuditAction } from '../types';

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  actorId: Types.ObjectId | null;
  actorEmail: string | null;
  actorRole: string | null;
  tenantId: Types.ObjectId | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorEmail: { type: String, default: null },
    actorRole:  { type: String, default: null },
    tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    action:     { type: String, enum: Object.values(AuditAction), required: true },
    resourceType: { type: String, required: true },
    resourceId:   { type: String, default: null },
    ipAddress:    { type: String, default: null },
    userAgent:    { type: String, default: null },
    payload:      { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ tenantId: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
