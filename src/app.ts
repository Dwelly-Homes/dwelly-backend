import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler, notFound } from './middleware/errorHandler';

// ─── ROUTES ───────────────────────────────────────────────────────────────────
import authRoutes         from './routes/auth.routes';
import tenantRoutes       from './routes/tenant.routes';
import userRoutes         from './routes/user.routes';
import propertyRoutes     from './routes/property.routes';
import inquiryRoutes      from './routes/inquiry.routes';
import verificationRoutes from './routes/verification.routes';
import paymentRoutes      from './routes/payment.routes';
import notificationRoutes from './routes/notification.routes';
import chatRoutes         from './routes/chat.routes';
import adminRoutes        from './routes/admin.routes';
import leaseRoutes        from './routes/lease.routes';

const app: Application = express();

// ─── SECURITY & PARSING ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// Trust proxy (needed for rate limiting behind nginx/load balancer)
app.set('trust proxy', 1);

// ─── GLOBAL RATE LIMIT ────────────────────────────────────────────────────────
app.use(config.apiPrefix, apiLimiter);

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Dwelly Homes API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── API ROUTES ───────────────────────────────────────────────────────────────
const api = config.apiPrefix;

app.use(`${api}/auth`,          authRoutes);
app.use(`${api}/tenants`,       tenantRoutes);
app.use(`${api}/users`,         userRoutes);
app.use(`${api}/properties`,    propertyRoutes);
app.use(`${api}/inquiries`,     inquiryRoutes);
app.use(`${api}/verification`,  verificationRoutes);
app.use(`${api}/payments`,      paymentRoutes);
app.use(`${api}/notifications`, notificationRoutes);
app.use(`${api}/chat`,          chatRoutes);
app.use(`${api}/admin`,         adminRoutes);
app.use(`${api}/leases`,        leaseRoutes);

// ─── ERROR HANDLING ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
