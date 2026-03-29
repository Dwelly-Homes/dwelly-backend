import mongoose, { Document, Schema, Types } from 'mongoose';

// ─── ENUMS ────────────────────────────────────────────────────────────────────

export enum RentPaymentStatus {
  PENDING   = 'pending',
  SUCCESS   = 'success',
  FAILED    = 'failed',
  CANCELLED = 'cancelled',
}

export enum EscrowStatus {
  PENDING_PAYMENT = 'pending_payment', // M-Pesa not yet confirmed
  HELD            = 'held',            // Confirmed, funds held for 24h
  RELEASED        = 'released',        // Released to landlord
  REFUNDED        = 'refunded',        // Refunded to tenant
  DISPUTED        = 'disputed',        // Dispute raised, pending admin review
}

export enum ReleaseReason {
  TENANT_CONFIRMED = 'tenant_confirmed', // Tenant clicked confirm move-in
  AUTO_RELEASED    = 'auto_released',    // 24h window expired
  ADMIN_DECISION   = 'admin_decision',   // Admin resolved in landlord's favor
}

// ─── EMBEDDED EVENT LOG ───────────────────────────────────────────────────────

export interface IPaymentEvent {
  action: string;
  actorId: string | null;
  note: string;
  timestamp: Date;
}

const PaymentEventSchema = new Schema<IPaymentEvent>(
  {
    action:    { type: String, required: true },
    actorId:   { type: String, default: null },
    note:      { type: String, required: true },
    timestamp: { type: Date,   default: () => new Date() },
  },
  { _id: false }
);

// ─── MAIN INTERFACE ───────────────────────────────────────────────────────────

export interface IRentPayment extends Document {
  _id: Types.ObjectId;

  // Relationships
  leaseId:        Types.ObjectId;
  propertyId:     Types.ObjectId;
  organizationId: Types.ObjectId; // Tenant org (property mgmt company / landlord org)
  occupantUserId: Types.ObjectId; // The searcher/tenant user who paid

  // Period
  periodMonth: number; // 1–12
  periodYear:  number;

  // Payment details
  amount:  number; // KES
  phone:   string; // M-Pesa number used

  // M-Pesa Daraja fields
  checkoutRequestId:    string | null;
  merchantRequestId:    string | null;
  mpesaReceiptNumber:   string | null;
  mpesaTransactionDate: string | null;

  // Idempotency
  idempotencyKey:    string; // `${leaseId}_${periodYear}_${periodMonth}`
  callbackProcessed: boolean;

  // Status
  paymentStatus: RentPaymentStatus;
  escrowStatus:  EscrowStatus;

  // Timestamps for escrow lifecycle
  paidAt:             Date | null; // When M-Pesa confirmed payment
  heldUntil:          Date | null; // paidAt + 24h (auto-release deadline)
  tenantConfirmedAt:  Date | null; // When tenant confirmed move-in
  releasedAt:         Date | null;
  refundedAt:         Date | null;

  // Release tracking
  releaseReason: ReleaseReason | null;
  disputeId:     Types.ObjectId | null;

  // Failure
  failureReason: string | null;

  // B2C transfer tracking (for actual fund movement)
  b2cConversationId:     string | null; // M-Pesa B2C reference
  b2cTransactionStatus:  'not_initiated' | 'pending' | 'completed' | 'failed';

  // Embedded audit trail
  events: IPaymentEvent[];

  createdAt: Date;
  updatedAt: Date;
}

// ─── SCHEMA ───────────────────────────────────────────────────────────────────

const RentPaymentSchema = new Schema<IRentPayment>(
  {
    leaseId:        { type: Schema.Types.ObjectId, ref: 'Lease',    required: true },
    propertyId:     { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Tenant',   required: true },
    occupantUserId: { type: Schema.Types.ObjectId, ref: 'User',     required: true },

    periodMonth: { type: Number, required: true, min: 1, max: 12 },
    periodYear:  { type: Number, required: true },

    amount: { type: Number, required: true, min: 1 },
    phone:  { type: String, required: true },

    checkoutRequestId:    { type: String, default: null },
    merchantRequestId:    { type: String, default: null },
    mpesaReceiptNumber:   { type: String, default: null },
    mpesaTransactionDate: { type: String, default: null },

    idempotencyKey:    { type: String, required: true },
    callbackProcessed: { type: Boolean, default: false },

    paymentStatus: { type: String, enum: Object.values(RentPaymentStatus), default: RentPaymentStatus.PENDING },
    escrowStatus:  { type: String, enum: Object.values(EscrowStatus),      default: EscrowStatus.PENDING_PAYMENT },

    paidAt:            { type: Date, default: null },
    heldUntil:         { type: Date, default: null },
    tenantConfirmedAt: { type: Date, default: null },
    releasedAt:        { type: Date, default: null },
    refundedAt:        { type: Date, default: null },

    releaseReason: { type: String, enum: [...Object.values(ReleaseReason), null], default: null },
    disputeId:     { type: Schema.Types.ObjectId, ref: 'Dispute', default: null },

    failureReason: { type: String, default: null },

    b2cConversationId:    { type: String, default: null },
    b2cTransactionStatus: {
      type: String,
      enum: ['not_initiated', 'pending', 'completed', 'failed'],
      default: 'not_initiated',
    },

    events: { type: [PaymentEventSchema], default: [] },
  },
  { timestamps: true }
);

// ─── INDEXES ──────────────────────────────────────────────────────────────────

RentPaymentSchema.index({ leaseId: 1, periodYear: 1, periodMonth: 1 });
RentPaymentSchema.index({ occupantUserId: 1, createdAt: -1 });
RentPaymentSchema.index({ organizationId: 1, createdAt: -1 });
RentPaymentSchema.index({ escrowStatus: 1 });
RentPaymentSchema.index({ heldUntil: 1, escrowStatus: 1 }); // for auto-release scheduler
RentPaymentSchema.index({ checkoutRequestId: 1 }, { sparse: true });
RentPaymentSchema.index({ mpesaReceiptNumber: 1 }, { sparse: true, unique: true });
RentPaymentSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      escrowStatus: { $in: ['pending_payment', 'held', 'disputed'] },
    },
  }
);

export const RentPayment = mongoose.model<IRentPayment>('RentPayment', RentPaymentSchema);
