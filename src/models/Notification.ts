import mongoose, { Document, Schema, Types } from 'mongoose';
import { NotificationType } from '../types';

export interface INotification extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tenantId: Types.ObjectId | null;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId:   { type: Schema.Types.ObjectId, ref: 'User',   required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    type: { type: String, enum: Object.values(NotificationType), required: true },
    title: { type: String, required: true },
    body:  { type: String, required: true },
    link:  { type: String, default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ tenantId: 1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
