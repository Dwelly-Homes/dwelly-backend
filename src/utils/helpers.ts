import crypto from 'crypto';

// ─── PAGINATION ───────────────────────────────────────────────────────────────

export const getPagination = (page?: string, limit?: string) => {
  const p = Math.max(1, parseInt(page || '1', 10));
  const l = Math.min(100, Math.max(1, parseInt(limit || '12', 10)));
  return { page: p, limit: l, skip: (p - 1) * l };
};

// ─── SLUG ─────────────────────────────────────────────────────────────────────

export const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

export const generateUniqueSlug = async (
  base: string,
  checkExists: (slug: string) => Promise<boolean>
): Promise<string> => {
  let slug = generateSlug(base);
  let exists = await checkExists(slug);
  let counter = 1;
  while (exists) {
    slug = `${generateSlug(base)}-${counter++}`;
    exists = await checkExists(slug);
  }
  return slug;
};

// ─── OTP ──────────────────────────────────────────────────────────────────────

export const generateOTP = (length = 6): string => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
};

export const generateToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// ─── PHONE ────────────────────────────────────────────────────────────────────

export const normalizePhone = (phone: string): string => {
  // Convert 07XXXXXXXX or 01XXXXXXXX → +2547XXXXXXXX or +2541XXXXXXXX
  const cleaned = phone.replace(/\s+/g, '');

  if (/^0[17]\d{8}$/.test(cleaned)) {
    return cleaned.replace(/^0/, '+254');
  }

  if (/^\+254[17]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^254[17]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  return cleaned;
};

// ─── SUBSCRIPTION PLAN LIMITS ─────────────────────────────────────────────────

export const PLAN_LIMITS = {
  starter: { listings: 5, users: 1, commissionRate: 5 },
  professional: { listings: 50, users: 10, commissionRate: 3 },
  enterprise: { listings: Infinity, users: Infinity, commissionRate: 0 },
} as const;

export const SUBSCRIPTION_PRICES = {
  starter:      { monthly: 1500,  annual: 15000 },
  professional: { monthly: 4500,  annual: 45000 },
  enterprise:   { monthly: 0,     annual: 0 },   // negotiated
} as const;
