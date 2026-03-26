import mongoose, { Document, Schema, Types } from 'mongoose';
import { InquiryStatus, InquiryType } from '../types';

export interface IInquiry extends Document {
  _id: Types.ObjectId;
  propertyId: Types.ObjectId;
  tenantId: Types.ObjectId;     // The property owner's tenant
  agentId: Types.ObjectId;      // The assigned agent for this property
  inquiryType: InquiryType;
  status: InquiryStatus;

  // Contact info
  senderId: Types.ObjectId | null;   // populated if sender has a registered account
  senderName: string;
  senderPhone: string;
  senderEmail: string | null;
  message: string;

  // Viewing request fields
  requestedDate: Date | null;
  requestedTimeSlot: 'morning' | 'afternoon' | 'evening' | null;

  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const InquirySchema = new Schema<IInquiry>(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant',   required: true },
    agentId:    { type: Schema.Types.ObjectId, ref: 'User',     required: true },
    inquiryType: { type: String, enum: Object.values(InquiryType), default: InquiryType.GENERAL },
    status: { type: String, enum: Object.values(InquiryStatus), default: InquiryStatus.NEW },

    senderId:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    senderName: { type: String, required: true, trim: true },
    senderPhone: { type: String, required: true },
    senderEmail: { type: String, default: null, lowercase: true },
    message: { type: String, required: true, maxlength: 1000 },

    requestedDate: { type: Date, default: null },
    requestedTimeSlot: {
      type: String, enum: ['morning', 'afternoon', 'evening', null],
      default: null,
    },

    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

InquirySchema.index({ tenantId: 1, createdAt: -1 });
InquirySchema.index({ propertyId: 1 });
InquirySchema.index({ agentId: 1 });
InquirySchema.index({ status: 1 });
InquirySchema.index({ isRead: 1 });

export const Inquiry = mongoose.model<IInquiry>('Inquiry', InquirySchema);
