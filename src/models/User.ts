import mongoose, { Document, Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole, AccountType } from '../types';

export interface INotificationPreferences {
  inquiry: boolean;
  verification: boolean;
  property: boolean;
  payment: boolean;
  earb: boolean;
  system: boolean;
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: UserRole;
  accountType: AccountType;
  tenantId: Types.ObjectId | null;
  isPhoneVerified: boolean;
  isActive: boolean;
  occupation: string | null;
  employer: string | null;
  bio: string | null;
  notificationPreferences: INotificationPreferences;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
  refreshTokens: string[];
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    fullName:    { type: String, required: true, trim: true },
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:       { type: String, required: true, unique: true },
    password:    { type: String, required: true, minlength: 8, select: false },
    role:        { type: String, enum: Object.values(UserRole), required: true },
    accountType: { type: String, enum: Object.values(AccountType), required: true },
    tenantId:    { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    isPhoneVerified: { type: Boolean, default: false },
    isActive:        { type: Boolean, default: true },
    notificationPreferences: {
      type: {
        inquiry:      { type: Boolean, default: true },
        verification: { type: Boolean, default: true },
        property:     { type: Boolean, default: true },
        payment:      { type: Boolean, default: true },
        earb:         { type: Boolean, default: true },
        system:       { type: Boolean, default: true },
      },
      default: () => ({ inquiry: true, verification: true, property: true, payment: true, earb: true, system: true }),
    },
    passwordResetToken:   { type: String,  default: null, select: false },
    passwordResetExpires: { type: Date,    default: null, select: false },
    refreshTokens: { type: [String], default: [], select: false },
    occupation:  { type: String, default: null, trim: true },
    employer:    { type: String, default: null, trim: true },
    bio:         { type: String, default: null, maxlength: 500, trim: true },
    lastLoginAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
UserSchema.pre('save', async function (this: any) {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

UserSchema.methods.toJSON = function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = (this as any).toObject() as Record<string, unknown>;
  delete obj['password'];
  delete obj['refreshTokens'];
  delete obj['passwordResetToken'];
  delete obj['passwordResetExpires'];
  return obj;
};

UserSchema.index({ tenantId: 1 });
UserSchema.index({ role: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
