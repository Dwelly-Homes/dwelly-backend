import mongoose, { Document, Schema, Types } from 'mongoose';

export type CommissionStatus = 'pending_payment' | 'paid' | 'waived';

export interface ICommission extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  propertyId: Types.ObjectId;
  agentId: Types.ObjectId;
  monthlyRent: number;
  commissionRate: number;   // percentage e.g. 5
  commissionAmount: number; // calculated KES
  moveInDate: Date;
  status: CommissionStatus;
  paymentId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const CommissionSchema = new Schema<ICommission>(
  {
    tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant',   required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    agentId:    { type: Schema.Types.ObjectId, ref: 'User',     required: true },
    monthlyRent:      { type: Number, required: true },
    commissionRate:   { type: Number, required: true },
    commissionAmount: { type: Number, required: true },
    moveInDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending_payment', 'paid', 'waived'],
      default: 'pending_payment',
    },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
  },
  { timestamps: true }
);

CommissionSchema.index({ tenantId: 1 });
CommissionSchema.index({ propertyId: 1 });
CommissionSchema.index({ status: 1 });

export const Commission = mongoose.model<ICommission>('Commission', CommissionSchema);
