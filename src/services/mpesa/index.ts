import axios from 'axios';
import { config } from '../../config';

const BASE_URL =
  config.mpesa.env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

// ─── AUTH TOKEN ───────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export const getMpesaToken = async (): Promise<string> => {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const credentials = Buffer.from(
    `${config.mpesa.consumerKey}:${config.mpesa.consumerSecret}`
  ).toString('base64');

  const response = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  cachedToken = response.data.access_token as string;
  tokenExpiresAt = Date.now() + (parseInt(response.data.expires_in, 10) - 60) * 1000;
  return cachedToken;
};

// ─── TIMESTAMP ────────────────────────────────────────────────────────────────

const getMpesaTimestamp = (): string => {
  return new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);
};

// ─── PASSWORD ─────────────────────────────────────────────────────────────────

const getMpesaPassword = (timestamp: string): string => {
  return Buffer.from(
    `${config.mpesa.shortcode}${config.mpesa.passkey}${timestamp}`
  ).toString('base64');
};

// ─── STK PUSH ─────────────────────────────────────────────────────────────────

export interface StkPushResult {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export const initiateStkPush = async (
  phone: string,       // format: 2547XXXXXXXX (no +)
  amount: number,
  accountReference: string,
  transactionDesc: string,
  callbackUrl?: string // override per-transaction (e.g. rent vs subscription callbacks)
): Promise<StkPushResult> => {
  const token = await getMpesaToken();
  const timestamp = getMpesaTimestamp();
  const password = getMpesaPassword(timestamp);

  // Normalize phone: remove + sign
  const normalizedPhone = phone.replace(/^\+/, '');

  const response = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: config.mpesa.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: normalizedPhone,
      PartyB: config.mpesa.shortcode,
      PhoneNumber: normalizedPhone,
      CallBackURL: callbackUrl ?? config.mpesa.callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return response.data as StkPushResult;
};

// ─── STK PUSH QUERY (check status) ───────────────────────────────────────────

export interface StkQueryResult {
  ResultCode: string;
  ResultDesc: string;
}

export const queryStkPush = async (checkoutRequestId: string): Promise<StkQueryResult> => {
  const token = await getMpesaToken();
  const timestamp = getMpesaTimestamp();
  const password = getMpesaPassword(timestamp);

  const response = await axios.post(
    `${BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: config.mpesa.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return response.data as StkQueryResult;
};

// ─── PARSE CALLBACK ───────────────────────────────────────────────────────────

export interface MpesaCallbackData {
  success: boolean;
  checkoutRequestId: string;
  merchantRequestId: string;
  resultCode: number;
  resultDesc: string;
  amount?: number;
  mpesaReceiptNumber?: string;
  transactionDate?: string;
  phoneNumber?: string;
}

export const parseMpesaCallback = (body: Record<string, unknown>): MpesaCallbackData => {
  const stkCallback = (body?.Body as Record<string, unknown>)
    ?.stkCallback as Record<string, unknown>;

  const resultCode = stkCallback?.ResultCode as number;
  const resultDesc = stkCallback?.ResultDesc as string;
  const checkoutRequestId = stkCallback?.CheckoutRequestID as string;
  const merchantRequestId = stkCallback?.MerchantRequestID as string;

  if (resultCode !== 0) {
    return { success: false, checkoutRequestId, merchantRequestId, resultCode, resultDesc };
  }

  // Extract metadata items
  const items = (
    (stkCallback?.CallbackMetadata as Record<string, unknown>)
      ?.Item as Array<Record<string, unknown>>
  ) ?? [];

  const getItem = (name: string) => items.find((i) => i.Name === name)?.Value;

  return {
    success: true,
    checkoutRequestId,
    merchantRequestId,
    resultCode,
    resultDesc,
    amount: getItem('Amount') as number,
    mpesaReceiptNumber: getItem('MpesaReceiptNumber') as string,
    transactionDate: String(getItem('TransactionDate')),
    phoneNumber: String(getItem('PhoneNumber')),
  };
};
