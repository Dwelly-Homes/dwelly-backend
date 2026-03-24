import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../../config';

let transporter: Transporter;

const getTransporter = (): Transporter => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: { user: config.email.user, pass: config.email.pass },
    });
  }
  return transporter;
};

// ─── BASE HTML WRAPPER ────────────────────────────────────────────────────────

const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
    .header { background: #1A3C5E; padding: 24px 32px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
    .body { padding: 32px; color: #1A1A2E; line-height: 1.6; }
    .btn { display: inline-block; background: #E67E22; color: #fff; padding: 12px 28px;
           border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0; }
    .footer { background: #f4f4f4; padding: 16px 32px; color: #6B7280; font-size: 12px; text-align: center; }
    .otp { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1A3C5E;
           background: #EBF2FA; padding: 16px 24px; border-radius: 8px; display: inline-block; margin: 16px 0; }
    .info-box { background: #EBF2FA; border-left: 4px solid #1A3C5E; padding: 12px 16px; border-radius: 4px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>🏠 Dwelly Homes</h1></div>
    <div class="body">${content}</div>
    <div class="footer">© ${new Date().getFullYear()} Dwelly Homes · Kenya's Trusted Property Marketplace<br/>
    This email was sent to you because you have an account on Dwelly Homes.</div>
  </div>
</body>
</html>`;

// ─── SEND HELPER ─────────────────────────────────────────────────────────────

const sendEmail = async (to: string, subject: string, html: string): Promise<void> => {
  try {
    await getTransporter().sendMail({
      from: `"${config.email.fromName}" <${config.email.from}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error('Email send failed:', error);
    // Do not re-throw — email failure should not crash the request
  }
};

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────────────────

export const sendOtpEmail = async (to: string, name: string, otp: string): Promise<void> => {
  const html = baseTemplate(`
    <p>Hello <strong>${name}</strong>,</p>
    <p>Use the verification code below to complete your registration on Dwelly Homes.</p>
    <div class="otp">${otp}</div>
    <p>This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
    <p>If you did not request this, please ignore this email.</p>
  `);
  await sendEmail(to, 'Your Dwelly Homes Verification Code', html);
};

export const sendPasswordResetEmail = async (to: string, name: string, resetUrl: string): Promise<void> => {
  const html = baseTemplate(`
    <p>Hello <strong>${name}</strong>,</p>
    <p>We received a request to reset your Dwelly Homes password. Click the button below to set a new password.</p>
    <a href="${resetUrl}" class="btn">Reset My Password</a>
    <p>This link expires in <strong>1 hour</strong>.</p>
    <div class="info-box">If you did not request a password reset, please ignore this email. Your password will remain unchanged.</div>
  `);
  await sendEmail(to, 'Reset Your Dwelly Homes Password', html);
};

export const sendVerificationApprovedEmail = async (to: string, name: string): Promise<void> => {
  const html = baseTemplate(`
    <p>Hello <strong>${name}</strong>,</p>
    <p>🎉 Great news! Your Dwelly Homes account has been <strong>verified and approved</strong>.</p>
    <p>You can now start listing properties on Kenya's trusted property marketplace.</p>
    <a href="${config.clientUrl}/dashboard/properties/new" class="btn">Add Your First Listing</a>
    <div class="info-box">Your Verified Agent or Verified Landlord badge is now active on your profile and all your listings.</div>
  `);
  await sendEmail(to, '✅ Your Dwelly Homes Account is Verified!', html);
};

export const sendVerificationRejectedEmail = async (to: string, name: string, reason: string): Promise<void> => {
  const html = baseTemplate(`
    <p>Hello <strong>${name}</strong>,</p>
    <p>We have reviewed your submitted documents and unfortunately we were unable to complete your verification at this time.</p>
    <div class="info-box"><strong>Reason:</strong> ${reason}</div>
    <p>You are welcome to resubmit your documents after addressing the issue above.</p>
    <a href="${config.clientUrl}/dashboard/verification" class="btn">Resubmit Documents</a>
  `);
  await sendEmail(to, 'Dwelly Homes — Verification Update', html);
};

export const sendVerificationInfoRequestEmail = async (to: string, name: string, notes: string): Promise<void> => {
  const html = baseTemplate(`
    <p>Hello <strong>${name}</strong>,</p>
    <p>Our verification team is reviewing your documents and needs some additional information from you.</p>
    <div class="info-box"><strong>What is needed:</strong><br/>${notes}</div>
    <a href="${config.clientUrl}/dashboard/verification" class="btn">Update My Documents</a>
  `);
  await sendEmail(to, 'Action Required — Dwelly Homes Verification', html);
};

export const sendEarbExpiryReminderEmail = async (
  to: string, name: string, expiryDate: string, daysRemaining: number
): Promise<void> => {
  const urgency = daysRemaining <= 7 ? '⚠️ URGENT: ' : '';
  const html = baseTemplate(`
    <p>Hello <strong>${name}</strong>,</p>
    <p>Your EARB Annual Practicing Certificate is expiring in <strong>${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</strong> (on ${expiryDate}).</p>
    <div class="info-box">Once your EARB certificate expires, your property listings will be automatically hidden from the Dwelly marketplace until a renewed certificate is uploaded.</div>
    <a href="${config.clientUrl}/dashboard/verification" class="btn">Upload Renewed Certificate</a>
    <p>To renew your certificate, visit the <a href="https://www.estateagentsboard.or.ke">EARB website</a>.</p>
  `);
  await sendEmail(to, `${urgency}Your EARB Certificate Expires in ${daysRemaining} Days`, html);
};

export const sendInvitationEmail = async (
  to: string, inviteeName: string, orgName: string, role: string, inviteUrl: string
): Promise<void> => {
  const html = baseTemplate(`
    <p>Hello <strong>${inviteeName}</strong>,</p>
    <p>You have been invited to join <strong>${orgName}</strong> on Dwelly Homes as <strong>${role}</strong>.</p>
    <a href="${inviteUrl}" class="btn">Accept Invitation</a>
    <div class="info-box">This invitation link expires in <strong>48 hours</strong>. If you did not expect this invitation, you can safely ignore this email.</div>
  `);
  await sendEmail(to, `You're invited to join ${orgName} on Dwelly Homes`, html);
};

export const sendNewInquiryEmail = async (
  to: string, agentName: string, senderName: string, propertyTitle: string, inquiryUrl: string
): Promise<void> => {
  const html = baseTemplate(`
    <p>Hello <strong>${agentName}</strong>,</p>
    <p>You have received a new inquiry for <strong>${propertyTitle}</strong> from <strong>${senderName}</strong>.</p>
    <a href="${inquiryUrl}" class="btn">View Inquiry</a>
    <p>Respond quickly — tenants who don't hear back within hours often move on to the next listing.</p>
  `);
  await sendEmail(to, `New Inquiry — ${propertyTitle}`, html);
};

export const sendSubscriptionConfirmationEmail = async (
  to: string, name: string, plan: string, expiresAt: string, receiptNo: string
): Promise<void> => {
  const html = baseTemplate(`
    <p>Hello <strong>${name}</strong>,</p>
    <p>Your <strong>${plan}</strong> subscription has been activated successfully via M-Pesa.</p>
    <div class="info-box">
      <strong>Receipt Number:</strong> ${receiptNo}<br/>
      <strong>Plan:</strong> ${plan}<br/>
      <strong>Valid Until:</strong> ${expiresAt}
    </div>
    <a href="${config.clientUrl}/dashboard/billing" class="btn">View Billing Details</a>
  `);
  await sendEmail(to, 'Dwelly Homes — Subscription Confirmed', html);
};
