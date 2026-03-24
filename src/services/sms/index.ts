import AfricasTalking from 'africastalking';
import { config } from '../../config';

const at = AfricasTalking({
  apiKey:   config.sms.apiKey,
  username: config.sms.username,
});

const sms = at.SMS;

const sendSms = async (to: string | string[], message: string): Promise<void> => {
  try {
    const recipients = Array.isArray(to) ? to : [to];
    await sms.send({
      to: recipients,
      message,
      from: config.sms.senderId,
    });
  } catch (error) {
    console.error('SMS send failed:', error);
    // Do not re-throw — SMS failure must not crash the request
  }
};

// ─── SMS TEMPLATES ────────────────────────────────────────────────────────────

export const sendOtpSms = async (phone: string, otp: string): Promise<void> => {
  await sendSms(phone, `${otp} is your Dwelly Homes verification code. Expires in 10 minutes. Do not share it.`);
};

export const sendInquiryAlertSms = async (phone: string, senderName: string, propertyTitle: string): Promise<void> => {
  await sendSms(phone, `Dwelly: New inquiry from ${senderName} for "${propertyTitle}". Log in to respond: dwellyhomes.co.ke`);
};

export const sendViewingConfirmationSms = async (phone: string, propertyTitle: string, date: string): Promise<void> => {
  await sendSms(phone, `Dwelly: Your viewing for "${propertyTitle}" on ${date} is confirmed. The agent will contact you shortly.`);
};

export const sendEarbExpirySms = async (phone: string, daysRemaining: number): Promise<void> => {
  await sendSms(phone, `Dwelly ALERT: Your EARB certificate expires in ${daysRemaining} days. Upload renewal at dwellyhomes.co.ke/dashboard/verification`);
};

export const sendPaymentSuccessSms = async (phone: string, amount: number, receiptNo: string): Promise<void> => {
  await sendSms(phone, `Dwelly: Payment of KES ${amount.toLocaleString()} confirmed. M-Pesa receipt: ${receiptNo}. Thank you!`);
};
