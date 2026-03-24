# 🏠 Dwelly Homes — Backend API

Kenya's Trusted Property Marketplace · Express + MongoDB + TypeScript

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Getting Started](#getting-started)
4. [Environment Variables](#environment-variables)
5. [API Reference](#api-reference)
6. [Authentication Flow](#authentication-flow)
7. [M-Pesa Integration](#mpesa-integration)
8. [Verification System](#verification-system)
9. [Multi-Tenancy Architecture](#multi-tenancy-architecture)
10. [Deployment](#deployment)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript 5 |
| Framework | Express 4 |
| Database | MongoDB 7 via Mongoose 8 |
| Auth | JWT (access + refresh tokens) |
| File Storage | Cloudinary |
| Email | Nodemailer + SendGrid |
| SMS | Africa's Talking |
| Payments | M-Pesa Daraja API (STK Push) |
| Validation | express-validator |
| Rate Limiting | express-rate-limit |
| Security | Helmet, CORS |

---

## Project Structure

```
src/
├── config/
│   ├── index.ts            # Env config loader — fails fast on missing vars
│   └── database.ts         # MongoDB connection with reconnect handling
│
├── types/
│   ├── index.ts            # All enums + interfaces (UserRole, TenantStatus, etc.)
│   └── africastalking.d.ts # Type declaration for africastalking package
│
├── models/
│   ├── User.ts             # User account — all roles
│   ├── Otp.ts              # Phone OTP — TTL index auto-deletes expired
│   ├── Tenant.ts           # Organization (agency / landlord)
│   ├── Verification.ts     # Document verification per tenant
│   ├── Property.ts         # Property listing with embedded images
│   ├── Inquiry.ts          # Inbound inquiry from public searcher
│   ├── Payment.ts          # M-Pesa transaction record
│   ├── Commission.ts       # Commission per move-in event
│   ├── Notification.ts     # In-app notification per user
│   ├── AuditLog.ts         # Immutable audit trail
│   └── Invitation.ts       # Team member invite tokens
│
├── utils/
│   ├── response.ts         # sendSuccess / sendError / sendPaginated helpers
│   ├── jwt.ts              # Sign + verify access and refresh tokens
│   ├── helpers.ts          # Pagination, slug gen, OTP gen, phone normalizer
│   └── audit.ts            # createAuditLog — never throws, fire-and-forget
│
├── services/
│   ├── storage/
│   │   └── cloudinary.ts   # Multer-Cloudinary: property images, docs, logos
│   ├── email/
│   │   └── index.ts        # 10 email templates (OTP, verification, EARB, etc.)
│   ├── sms/
│   │   └── index.ts        # Africa's Talking SMS templates
│   └── mpesa/
│       └── index.ts        # STK Push, query, callback parser, token cache
│
├── middleware/
│   ├── auth.ts             # authenticate, requireRoles, requireTenantMatch
│   ├── errorHandler.ts     # Global error handler + AppError class
│   ├── validate.ts         # express-validator chain runner
│   └── rateLimiter.ts      # Auth, OTP, API, M-Pesa rate limiters
│
├── validators/
│   ├── auth.validator.ts   # Register, login, OTP, password reset chains
│   └── property.validator.ts # Create/update property + marketplace query chains
│
├── controllers/
│   ├── auth.controller.ts       # register, login, OTP, refresh, logout, reset
│   ├── tenant.controller.ts     # profile, logo, onboarding, admin CRUD
│   ├── user.controller.ts       # team members, invitations
│   ├── property.controller.ts   # CRUD, images, marketplace endpoints
│   ├── inquiry.controller.ts    # submit (public), inbox, status update
│   ├── verification.controller.ts # doc upload, submit, admin review
│   ├── payment.controller.ts    # STK push, callback, billing, commissions
│   ├── notification.controller.ts # fetch, mark read
│   └── admin.controller.ts      # stats, audit log, EARB tracker, tenant admin
│
├── routes/
│   ├── auth.routes.ts
│   ├── tenant.routes.ts
│   ├── user.routes.ts
│   ├── property.routes.ts
│   ├── inquiry.routes.ts
│   ├── verification.routes.ts
│   ├── payment.routes.ts
│   ├── notification.routes.ts
│   └── admin.routes.ts
│
├── app.ts                  # Express app — middleware + routes + error handlers
└── server.ts               # Entry point — DB connect + graceful shutdown
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB 7 (local or Atlas)
- Cloudinary account
- SendGrid account (or any SMTP provider)
- Africa's Talking account
- Safaricom Daraja developer account

### Installation

```bash
# 1. Clone and enter the project
cd dwelly-backend

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your credentials (see Environment Variables section)

# 4. Start development server (hot reload)
npm run dev

# 5. Build for production
npm run build

# 6. Start production server
npm start
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values.

```env
# Server
NODE_ENV=development
PORT=5000
API_PREFIX=/api/v1
CLIENT_URL=http://localhost:3000      # Your Nuxt frontend URL

# Database
MONGODB_URI=mongodb://localhost:27017/dwelly_homes

# JWT — use long random strings in production
JWT_ACCESS_SECRET=change_me_in_production_64_chars_min
JWT_REFRESH_SECRET=change_me_in_production_64_chars_min
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email (SendGrid example)
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=SG.your_sendgrid_key
EMAIL_FROM=noreply@dwellyhomes.co.ke
EMAIL_FROM_NAME=Dwelly Homes

# Africa's Talking SMS
AT_API_KEY=your_at_api_key
AT_USERNAME=your_at_username
AT_SENDER_ID=DWELLY

# M-Pesa Daraja
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=174379                # Use your actual shortcode in production
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=https://yourdomain.com/api/v1/payments/mpesa/callback
MPESA_ENV=sandbox                     # Change to 'production' when going live
```

---

## API Reference

Base URL: `http://localhost:5000/api/v1`

All protected endpoints require:
```
Authorization: Bearer <access_token>
```

---

### Authentication  `/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ❌ | Register new user (all account types) |
| POST | `/auth/login` | ❌ | Login with email/phone + password |
| POST | `/auth/verify-otp` | ❌ | Verify phone OTP, returns tokens |
| POST | `/auth/resend-otp` | ❌ | Resend OTP to phone + email |
| POST | `/auth/refresh-token` | ❌ | Exchange refresh token for new access token |
| POST | `/auth/logout` | ✅ | Invalidate refresh token |
| POST | `/auth/forgot-password` | ❌ | Send reset link to email/phone |
| PATCH | `/auth/reset-password` | ❌ | Set new password using reset token |
| GET | `/auth/validate-reset-token?token=` | ❌ | Validate reset token before showing form |

**Register body:**
```json
{
  "fullName": "Jane Wanjiku",
  "email": "jane@example.com",
  "phone": "+254712345678",
  "password": "SecurePass1!",
  "accountType": "estate_agent"
}
```
`accountType` values: `estate_agent` | `landlord` | `searcher`

---

### Tenants  `/tenants`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/tenants/me` | ✅ | Any | Get own tenant profile |
| PATCH | `/tenants/me/profile` | ✅ | tenant_admin | Update profile |
| POST | `/tenants/me/logo` | ✅ | tenant_admin | Upload logo (multipart) |
| POST | `/tenants/me/submit-onboarding` | ✅ | tenant_admin | Complete onboarding |
| GET | `/tenants` | ✅ | platform_admin | List all tenants |
| PATCH | `/tenants/:id/status` | ✅ | platform_admin | Suspend / reactivate |

---

### Users & Team  `/users`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/users` | ✅ | tenant_admin | List team members |
| POST | `/users/invite` | ✅ | tenant_admin | Send invitation email |
| PATCH | `/users/:id/role` | ✅ | tenant_admin | Change member role |
| PATCH | `/users/:id/toggle-status` | ✅ | tenant_admin | Suspend / reactivate |
| DELETE | `/users/:id` | ✅ | tenant_admin | Remove from team |
| GET | `/users/invitations/validate?token=` | ❌ | — | Validate invite link |
| POST | `/users/invitations/accept` | ❌ | — | Accept invite + create account |

---

### Properties  `/properties`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/properties/marketplace` | ❌ | Public listing search |
| GET | `/properties/marketplace/:id` | ❌ | Public property detail |
| GET | `/properties` | ✅ | My properties list |
| POST | `/properties` | ✅ | Create property (verified only) |
| GET | `/properties/:id` | ✅ | Property detail (dashboard) |
| PATCH | `/properties/:id` | ✅ | Update property |
| DELETE | `/properties/:id` | ✅ | Delete property + images |
| POST | `/properties/:id/images` | ✅ | Upload images (max 20, multipart) |
| DELETE | `/properties/:id/images/:imageId` | ✅ | Delete single image |
| PATCH | `/properties/:id/images/order` | ✅ | Reorder images |
| PATCH | `/properties/:id/images/:imageId/cover` | ✅ | Set cover image |
| PATCH | `/properties/:id/admin/visibility` | ✅ | Admin hide/show |

**Marketplace query params:**
```
?county=Nairobi&neighborhood=Westlands&propertyType=1_bedroom
&minPrice=15000&maxPrice=40000&search=modern&page=1&limit=12
```

---

### Inquiries  `/inquiries`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/inquiries` | ❌ | Submit inquiry (public, rate limited) |
| GET | `/inquiries` | ✅ | Tenant inbox |
| GET | `/inquiries/:id` | ✅ | Single inquiry (marks as read) |
| PATCH | `/inquiries/:id` | ✅ | Update status |
| GET | `/inquiries/property/:propertyId` | ✅ | Inquiries for a property |

**Submit inquiry body:**
```json
{
  "propertyId": "...",
  "senderName": "John Doe",
  "senderPhone": "+254700000000",
  "senderEmail": "john@example.com",
  "message": "I am interested in this property...",
  "inquiryType": "viewing_request",
  "requestedDate": "2025-09-01",
  "requestedTimeSlot": "morning"
}
```

---

### Verification  `/verification`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/verification/status` | ✅ | tenant_admin | My verification status + docs |
| POST | `/verification/documents/:type` | ✅ | tenant_admin | Upload document (multipart) |
| POST | `/verification/submit` | ✅ | tenant_admin | Submit for review |
| GET | `/verification/admin` | ✅ | platform_admin | Review queue |
| GET | `/verification/admin/earb-tracker` | ✅ | platform_admin | EARB expiry tracker |
| GET | `/verification/admin/:id` | ✅ | platform_admin | Single verification |
| PATCH | `/verification/admin/:id/review` | ✅ | platform_admin | Approve / reject / request info |

`documentType` values: `national_id_front` | `national_id_back` | `kra_pin` | `business_registration` | `earb_certificate`

**Review body:**
```json
{
  "status": "approved",
  "notes": "All documents verified. EARB number confirmed on register."
}
```
`status` values: `approved` | `rejected` | `information_requested` | `under_review`

---

### Payments  `/payments`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/payments/billing/overview` | ✅ | Current plan, usage, recent payments |
| GET | `/payments/billing/history` | ✅ | Full payment history |
| POST | `/payments/billing/subscribe` | ✅ | Initiate subscription STK push |
| GET | `/payments/billing/:checkoutRequestId/status` | ✅ | Poll payment status |
| POST | `/payments/mpesa/callback` | ❌ | Safaricom IPN webhook |
| GET | `/payments/commissions` | ✅ | Commission list |
| POST | `/payments/commissions/move-in` | ✅ | Record tenant move-in |
| POST | `/payments/commissions/pay` | ✅ | Pay commission via STK push |

**Subscribe body:**
```json
{
  "planId": "professional",
  "billingPeriod": "monthly",
  "phone": "+254712345678"
}
```

---

### Notifications  `/notifications`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/notifications` | ✅ | Get notifications + unread count |
| PATCH | `/notifications/read-all` | ✅ | Mark all as read |
| PATCH | `/notifications/:id/read` | ✅ | Mark single as read |

Query params: `?type=verification&page=1&limit=20`

---

### Admin  `/admin`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/admin/stats` | ✅ | Platform-wide stats |
| GET | `/admin/stats/registrations` | ✅ | 30-day registration trend |
| GET | `/admin/stats/listings-by-county` | ✅ | Top 10 counties by listings |
| GET | `/admin/activity-feed` | ✅ | Latest 20 audit events |
| GET | `/admin/audit-log` | ✅ | Full searchable audit log |
| GET | `/admin/tenants/:id` | ✅ | Full tenant detail (all tabs) |
| POST | `/admin/earb/send-reminders` | ✅ | Send EARB expiry reminders |
| PATCH | `/admin/earb/:tenantId/renew` | ✅ | Update EARB expiry date |
| POST | `/admin/notifications/send` | ✅ | Send notification to tenant users |

All `/admin` routes require `platform_admin` role.

---

## Authentication Flow

```
1. POST /auth/register
   → Creates User + Tenant (if agent/landlord)
   → Sends OTP via SMS + Email
   → Returns { userId, phone }

2. POST /auth/verify-otp  { phone, otp }
   → Marks phone verified
   → Returns { accessToken, refreshToken, user }

3. Every protected request:
   Authorization: Bearer <accessToken>

4. When accessToken expires (15min):
   POST /auth/refresh-token  { refreshToken }
   → Returns new { accessToken, refreshToken }
   → Old refresh token is rotated out (max 5 per user)

5. POST /auth/logout  { refreshToken }
   → Removes specific refresh token from user's list
```

---

## M-Pesa Integration

### STK Push Flow (Subscription)

```
1. POST /payments/billing/subscribe
   → Calls Daraja STK Push API
   → Returns checkoutRequestId

2. User sees M-Pesa prompt on phone, enters PIN

3. Safaricom calls POST /payments/mpesa/callback
   → Parses callback
   → Updates Payment status
   → If success: activates subscription on Tenant
   → Sends confirmation email + SMS

4. Frontend polls:
   GET /payments/billing/:checkoutRequestId/status
   → Returns { status: "pending" | "success" | "failed" }
```

### Important Daraja Notes

- `MPESA_ENV=sandbox` uses the Safaricom sandbox (`sandbox.safaricom.co.ke`)
- `MPESA_ENV=production` uses live API (`api.safaricom.co.ke`)
- The callback URL **must be HTTPS** and publicly reachable
- During development, use [ngrok](https://ngrok.com) to expose your local server:
  ```bash
  ngrok http 5000
  # Copy the https URL and set as MPESA_CALLBACK_URL in .env
  ```
- The callback endpoint (`/payments/mpesa/callback`) has no auth — Safaricom posts to it directly
- In production, whitelist Safaricom IP ranges at your nginx/load balancer level

---

## Verification System

```
Tenant submits documents
       ↓
POST /verification/documents/:type   (one per document type)
       ↓
POST /verification/submit            (triggers admin notification)
       ↓
Admin reviews at /admin/verifications
       ↓
PATCH /verification/admin/:id/review
   status: "approved"    → Tenant.status = "active", badge applied
   status: "rejected"    → Email sent with reason
   status: "information_requested" → Email sent with notes
```

### EARB Certificate Expiry

The platform tracks EARB expiry dates on every estate agent tenant.

Reminders are sent at **30 days**, **14 days**, and **7 days** before expiry via:
- `POST /admin/earb/send-reminders` (triggered manually or by a cron job)

On expiry, the agent's listings should be hidden. You can automate this with a daily cron:

```typescript
// Example cron job (run with node-cron or a separate worker)
import cron from 'node-cron';
import { Tenant } from './models/Tenant';
import { Property } from './models/Property';

cron.schedule('0 1 * * *', async () => {
  const expired = await Tenant.find({
    accountType: 'estate_agent',
    earbExpiryDate: { $lt: new Date() },
    status: 'active',
  });
  for (const tenant of expired) {
    await Property.updateMany({ tenantId: tenant._id }, { isHiddenByAdmin: true });
    await Tenant.findByIdAndUpdate(tenant._id, { status: 'suspended' });
  }
});
```

---

## Multi-Tenancy Architecture

Every query on the platform is **automatically scoped to the tenant** via the `tenantId` field.

```typescript
// Example: agents can ONLY see their own properties
Property.find({ tenantId: req.user.tenantId })

// Admin bypasses tenant scoping
if (req.user.role === 'platform_admin') {
  // No tenantId filter applied
}
```

Key rules:
- `tenantId` is included on every supply-side model
- No cross-tenant data leakage is possible via the API
- Marketplace endpoints aggregate across all tenants but expose **no management data**
- Cloudinary documents are stored in `private` type — only accessible via signed URLs

---

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use a strong random string for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (64+ chars)
- [ ] Use MongoDB Atlas with IP whitelist
- [ ] Set `MPESA_ENV=production` and use live Daraja credentials
- [ ] Ensure `MPESA_CALLBACK_URL` is an HTTPS URL reachable by Safaricom
- [ ] Configure nginx reverse proxy in front of Node.js
- [ ] Enable MongoDB auth and TLS
- [ ] Set up log rotation for morgan logs
- [ ] Configure a daily cron for EARB expiry checks

### Recommended PM2 setup

```bash
npm run build
pm2 start dist/server.js --name dwelly-api --instances 2 --exec-mode cluster
pm2 save
pm2 startup
```

### Environment structure for production

```
.env.production     # never commit this
dist/               # compiled output — deploy this
node_modules/       # install fresh on server with: npm ci --omit=dev
```

---

## Scripts

```bash
npm run dev     # Start development server with hot reload (ts-node-dev)
npm run build   # Compile TypeScript → dist/
npm start       # Run compiled production server
npm run lint    # TypeScript type check (no emit)
```

---

## License

Confidential — Dwelly Homes Internal Use Only
