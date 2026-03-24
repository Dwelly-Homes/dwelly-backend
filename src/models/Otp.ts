import mongoose, { Document, Schema } from 'mongoose';

export interface IOtp extends Document {
  phone: string;
  otp: string;
  expiresAt: Date;
  attempts: number;
  isUsed: boolean;
}

const OtpSchema = new Schema<IOtp>({
  phone: { type: String, required: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  isUsed: { type: Boolean, default: false },
}, { timestamps: true });

// Auto-delete expired OTPs
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
OtpSchema.index({ phone: 1 });

export const Otp = mongoose.model<IOtp>('Otp', OtpSchema);
