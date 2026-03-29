/**
 * M-Pesa B2C (Business-to-Customer) Service
 *
 * Used to transfer funds from the business shortcode to a customer's M-Pesa.
 * Required for: releasing escrowed rent to landlords and refunding tenants.
 *
 * ⚠️  PRODUCTION SETUP REQUIRED:
 *   1. Apply for B2C on the Safaricom Daraja portal (separate from STK Push)
 *   2. Configure environment variables:
 *      MPESA_B2C_INITIATOR_NAME     - Safaricom-assigned initiator name
 *      MPESA_B2C_SECURITY_CREDENTIAL - Base64-encoded encrypted initiator password
 *      MPESA_B2C_RESULT_URL         - HTTPS endpoint for B2C result callbacks
 *      MPESA_B2C_QUEUE_TIMEOUT_URL  - HTTPS endpoint for queue timeout callbacks
 *      MPESA_B2C_SHORTCODE          - B2C-specific shortcode (may differ from STK)
 *
 * Until B2C is configured, this service logs the intent and marks the record
 * for manual processing — the escrow state machine still advances correctly.
 */

import axios from 'axios';
import { config } from '../../config';
import { RentPayment } from '../../models/RentPayment';
import { getMpesaToken } from './index';

const BASE_URL =
  config.mpesa.env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

// ─── B2C CONFIG ───────────────────────────────────────────────────────────────

const b2cConfig = {
  initiatorName:       process.env.MPESA_B2C_INITIATOR_NAME       ?? '',
  securityCredential:  process.env.MPESA_B2C_SECURITY_CREDENTIAL  ?? '',
  resultUrl:           process.env.MPESA_B2C_RESULT_URL            ?? '',
  queueTimeoutUrl:     process.env.MPESA_B2C_QUEUE_TIMEOUT_URL    ?? '',
  shortcode:           process.env.MPESA_B2C_SHORTCODE             ?? config.mpesa.shortcode,
};

const isB2CConfigured = (): boolean =>
  !!(b2cConfig.initiatorName && b2cConfig.securityCredential && b2cConfig.resultUrl);

// ─── B2C TRANSFER ─────────────────────────────────────────────────────────────

export interface B2CTransferOptions {
  phone:     string; // Format: 254XXXXXXXXX
  amount:    number;
  reference: string; // OriginatorConversationID
  remarks:   string;
  paymentId: string; // Used in QueueTimeoutURL context
}

export interface B2CResult {
  ConversationID:          string;
  OriginatorConversationID: string;
  ResponseCode:            string;
  ResponseDescription:     string;
}

export const initiateB2CTransfer = async (opts: B2CTransferOptions): Promise<B2CResult | null> => {
  if (!isB2CConfigured()) {
    // B2C not yet configured — log and mark for manual processing
    console.warn(
      `[B2C] ⚠️  B2C not configured. Manual payout required for payment ${opts.paymentId}. ` +
      `Amount: KES ${opts.amount} → ${opts.phone}. Reference: ${opts.reference}`
    );
    // In development/staging: treat as pending and continue
    return null;
  }

  const normalizedPhone = opts.phone.replace(/^\+/, '');
  const token = await getMpesaToken();

  const payload = {
    InitiatorName:             b2cConfig.initiatorName,
    SecurityCredential:        b2cConfig.securityCredential,
    CommandID:                 'BusinessPayment',
    Amount:                    Math.ceil(opts.amount),
    PartyA:                    b2cConfig.shortcode,
    PartyB:                    normalizedPhone,
    Remarks:                   opts.remarks.slice(0, 100),
    QueueTimeOutURL:           b2cConfig.queueTimeoutUrl,
    ResultURL:                 b2cConfig.resultUrl,
    Occasion:                  opts.reference.slice(0, 100),
  };

  const response = await axios.post(
    `${BASE_URL}/mpesa/b2c/v3/paymentrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const result = response.data as B2CResult;
  console.log(`[B2C] Transfer initiated: ConvID=${result.ConversationID} for payment ${opts.paymentId}`);

  return result;
};

// ─── B2C CALLBACK PARSER ──────────────────────────────────────────────────────

export interface B2CCallbackData {
  conversationId:          string;
  originatorConversationId: string;
  resultCode:              number;
  resultDesc:              string;
  amount?:                 number;
  transactionId?:          string;
  phone?:                  string;
}

export const parseB2CCallback = (body: Record<string, unknown>): B2CCallbackData => {
  const result = (body?.Result as Record<string, unknown>) ?? {};
  const params = ((result.ResultParameters as Record<string, unknown>)
    ?.ResultParameter as Array<Record<string, unknown>>) ?? [];

  const getParam = (name: string) => params.find((p) => p.Key === name)?.Value;

  return {
    conversationId:           result.ConversationID as string,
    originatorConversationId: result.OriginatorConversationID as string,
    resultCode:               result.ResultCode as number,
    resultDesc:               result.ResultDesc as string,
    amount:                   getParam('TransactionAmount') as number | undefined,
    transactionId:            getParam('TransactionID') as string | undefined,
    phone:                    getParam('ReceiverPartyPublicName') as string | undefined,
  };
};

/**
 * Handle B2C result callback from Safaricom.
 * Called by POST /api/v1/rent-payments/b2c/callback
 */
export const handleB2CCallback = async (body: Record<string, unknown>): Promise<void> => {
  const data = parseB2CCallback(body);

  // Find payment by B2C conversation ID
  const payment = await RentPayment.findOne({ b2cConversationId: data.conversationId });
  if (!payment) {
    console.warn(`[B2C] Callback received for unknown conversationId: ${data.conversationId}`);
    return;
  }

  if (data.resultCode === 0) {
    payment.b2cTransactionStatus = 'completed';
    payment.events.push({
      action:    'b2c_completed',
      actorId:   null,
      note:      `B2C transfer confirmed. TxID: ${data.transactionId ?? 'N/A'}`,
      timestamp: new Date(),
    });
    console.log(`[B2C] Transfer completed for payment ${payment._id}`);
  } else {
    payment.b2cTransactionStatus = 'failed';
    payment.events.push({
      action:    'b2c_failed',
      actorId:   null,
      note:      `B2C transfer failed: ${data.resultDesc}`,
      timestamp: new Date(),
    });
    console.error(`[B2C] Transfer failed for payment ${payment._id}: ${data.resultDesc}`);
  }

  await payment.save();
};
