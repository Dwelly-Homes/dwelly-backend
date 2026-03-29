/**
 * Escrow-specific email templates
 */

import { config } from '../../config';

// Re-use the existing email infrastructure
import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:       config.email.host,
      port:       config.email.port,
      secure:     config.email.port === 465,
      requireTLS: config.email.port === 587,
      auth: { user: config.email.user, pass: config.email.pass.replace(/\s/g, '') },
      tls: { rejectUnauthorized: true },
    });
  }
  return transporter;
};

const baseTemplate = (content: string) => `
<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
.container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden}
.header{background:#1A3C5E;padding:24px 32px}
.header h1{color:#fff;margin:0;font-size:22px}
.body{padding:32px;color:#1A1A2E;line-height:1.6}
.btn{display:inline-block;background:#E67E22;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0}
.info-box{background:#EBF2FA;border-left:4px solid #1A3C5E;padding:12px 16px;border-radius:4px;margin:16px 0}
.success-box{background:#ECFDF5;border-left:4px solid #10B981;padding:12px 16px;border-radius:4px;margin:16px 0}
.warning-box{background:#FFFBEB;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:4px;margin:16px 0}
.footer{background:#f4f4f4;padding:16px 32px;color:#6B7280;font-size:12px;text-align:center}
</style></head>
<body><div class="container">
<div class="header"><h1>🏠 Dwelly Homes</h1></div>
<div class="body">${content}</div>
<div class="footer">© ${new Date().getFullYear()} Dwelly Homes · Kenya's Trusted Property Marketplace</div>
</div></body></html>`;

const sendSoft = async (to: string, subject: string, html: string): Promise<void> => {
  try {
    await getTransporter().sendMail({
      from: `"${config.email.fromName}" <${config.email.from}>`,
      to, subject, html,
    });
  } catch (err) {
    console.error(`[EscrowEmail] Failed to send to ${to}:`, err);
  }
};

export const sendRentEscrowEmail = async (
  to: string,
  name: string,
  event: 'held' | 'released' | 'refunded' | 'disputed',
  amount: number,
  receipt: string | null
): Promise<void> => {
  const fmt = (n: number) => `KES ${n.toLocaleString()}`;

  const templates: Record<string, { subject: string; body: string }> = {
    held: {
      subject: 'Your Rent Payment is in Escrow',
      body: baseTemplate(`
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your rent payment of <strong>${fmt(amount)}</strong> has been received and is being held in escrow.</p>
        <div class="info-box">
          ${receipt ? `<strong>M-Pesa Receipt:</strong> ${receipt}<br/>` : ''}
          <strong>What happens next:</strong><br/>
          You have <strong>24 hours</strong> to confirm your successful move-in.
          If confirmed, funds are immediately released to the landlord.
          If not confirmed within 24 hours, funds are automatically released.
          You may also raise a dispute if there is an issue.
        </div>
        <a href="${config.clientUrl}/tenant/payments" class="btn">View Payment Status</a>
      `),
    },
    released: {
      subject: 'Rent Payment Successfully Released',
      body: baseTemplate(`
        <p>Hello <strong>${name}</strong>,</p>
        <div class="success-box">Your rent payment of <strong>${fmt(amount)}</strong> has been successfully released to the landlord.</div>
        <p>Thank you for using Dwelly Homes for secure rent payments.</p>
        <a href="${config.clientUrl}/tenant/payments" class="btn">View Payment History</a>
      `),
    },
    refunded: {
      subject: 'Rent Payment Refunded',
      body: baseTemplate(`
        <p>Hello <strong>${name}</strong>,</p>
        <div class="success-box">Your rent payment of <strong>${fmt(amount)}</strong> has been refunded to your M-Pesa account.</div>
        <p>The refund should reflect in your M-Pesa within a few minutes.</p>
        <a href="${config.clientUrl}/tenant/payments" class="btn">View Payment History</a>
      `),
    },
    disputed: {
      subject: 'Rent Dispute Submitted — Under Review',
      body: baseTemplate(`
        <p>Hello <strong>${name}</strong>,</p>
        <div class="warning-box">Your dispute for <strong>${fmt(amount)}</strong> has been received and is under review.</div>
        <p>Our team will review your case and reach a decision within 24 hours.
        The funds are frozen until the dispute is resolved.</p>
        <a href="${config.clientUrl}/tenant/payments" class="btn">Track Dispute</a>
      `),
    },
  };

  const t = templates[event];
  if (!t) return;

  await sendSoft(to, t.subject, t.body);
};
