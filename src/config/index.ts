import dotenv from 'dotenv';
dotenv.config();

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',

  db: {
    uri: requireEnv('MONGODB_URI'),
  },

  jwt: {
    accessSecret: requireEnv('JWT_ACCESS_SECRET'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  cloudinary: {
    cloudName: requireEnv('CLOUDINARY_CLOUD_NAME'),
    apiKey: requireEnv('CLOUDINARY_API_KEY'),
    apiSecret: requireEnv('CLOUDINARY_API_SECRET'),
  },

  email: {
    host: process.env.EMAIL_HOST || 'smtp.sendgrid.net',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    user: requireEnv('EMAIL_USER'),
    pass: requireEnv('EMAIL_PASS'),
    from: process.env.EMAIL_FROM || 'noreply@dwellyhomes.co.ke',
    fromName: process.env.EMAIL_FROM_NAME || 'Dwelly Homes',
  },

  sms: {
    apiKey: requireEnv('AT_API_KEY'),
    username: requireEnv('AT_USERNAME'),
    senderId: process.env.AT_SENDER_ID || 'DWELLY',
  },

  mpesa: {
    consumerKey: requireEnv('MPESA_CONSUMER_KEY'),
    consumerSecret: requireEnv('MPESA_CONSUMER_SECRET'),
    shortcode: requireEnv('MPESA_SHORTCODE'),
    passkey: requireEnv('MPESA_PASSKEY'),
    callbackUrl: requireEnv('MPESA_CALLBACK_URL'),
    env: (process.env.MPESA_ENV || 'sandbox') as 'sandbox' | 'production',
  },
};
