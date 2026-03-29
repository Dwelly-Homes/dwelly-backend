/**
 * Escrow-specific SMS notifications
 */

import AfricasTalking from 'africastalking';
import { config } from '../../config';

const at = AfricasTalking({ apiKey: config.sms.apiKey, username: config.sms.username });
const sms = at.SMS;

const sendSoft = async (to: string, message: string): Promise<void> => {
  try {
    await sms.send({ to: [to], message, from: config.sms.senderId });
  } catch (err) {
    console.error(`[EscrowSMS] Failed to send to ${to}:`, err);
  }
};

export const sendRentEscrowSms = async (
  phone: string,
  event: 'held' | 'released' | 'refunded' | 'disputed',
  amount: number,
  receipt: string | null
): Promise<void> => {
  const fmt = (n: number) => `KES ${n.toLocaleString()}`;
  const receiptStr = receipt ? ` Receipt: ${receipt}.` : '';

  const messages: Record<string, string> = {
    held:     `Dwelly: ${fmt(amount)} rent received & held in escrow.${receiptStr} Confirm move-in within 24hrs at dwellyhomes.co.ke/tenant/payments`,
    released: `Dwelly: Your ${fmt(amount)} rent payment has been released to the landlord. Thank you!`,
    refunded: `Dwelly: ${fmt(amount)} has been refunded to your M-Pesa. It should reflect within minutes.`,
    disputed: `Dwelly: Your dispute on ${fmt(amount)} rent payment has been received. We'll review and respond within 24hrs.`,
  };

  const msg = messages[event];
  if (msg) await sendSoft(phone, msg);
};
