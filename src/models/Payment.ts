import mongoose, { Document, Schema, Types } from 'mongoose';
import { PaymentType, PaymentStatus, SubscriptionPlan } from '../types';

export interface IPayment extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  paymentType: PaymentType;
  status: PaymentStatus;
  amount: number;           // KES
  phone: string;            // M-Pesa number used

  // Subscription fields
  plan: SubscriptionPlan | null;
  billingPeriod: 'monthly' | 'annual' | null;

  // Commission fields
  propertyId: Types.ObjectId | null;
  commissionRate: number | null;

  // M-Pesa Daraja fields
  checkoutRequestId: string | null;
  merchantRequestId: string | null;
  mpesaReceiptNumber: string | null;
  mpesaTransactionDate: string | null;

  description: string;
  failureReason: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    tenantId:    { type: Schema.Types.ObjectId, ref: 'Tenant',   required: true },
    paymentType: { type: String, enum: Object.values(PaymentType), required: true },
    status:      { type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING },
    amount:      { type: Number, required: true, min: 0 },
    phone:       { type: String, required: true },

    plan:          { type: String, enum: Object.values(SubscriptionPlan), default: null },
    billingPeriod: { type: String, enum: ['monthly', 'annual', null], default: null },

    propertyId:     { type: Schema.Types.ObjectId, ref: 'Property', default: null },
    commissionRate: { type: Number, default: null },

    checkoutRequestId:    { type: String, default: null },
    merchantRequestId:    { type: String, default: null },
    mpesaReceiptNumber:   { type: String, default: null },
    mpesaTransactionDate: { type: String, default: null },

    description:   { type: String, required: true },
    failureReason: { type: String, default: null },
  },
  { timestamps: true }
);

PaymentSchema.index({ tenantId: 1, createdAt: -1 });
PaymentSchema.index({ checkoutRequestId: 1 }, { sparse: true });
PaymentSchema.index({ mpesaReceiptNumber: 1 }, { sparse: true, unique: true });
PaymentSchema.index({ status: 1 });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
