/**
 * Dwelly Homes — Large Seed Script
 * Creates hundreds of records across all collections for pagination testing.
 *
 * Run: npx ts-node -r tsconfig-paths/register src/seed.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { User } from './models/User';
import { Tenant } from './models/Tenant';
import { Property } from './models/Property';
import { Inquiry } from './models/Inquiry';
import { Notification } from './models/Notification';
import { Verification } from './models/Verification';
import { Payment } from './models/Payment';
import { Commission } from './models/Commission';
import { AuditLog } from './models/AuditLog';
import { County } from './models/County';
import { KENYAN_COUNTIES, mockPropertiesFront } from './seedData';
import { config } from './config';
import {
  AuditAction,
  PaymentType,
  PaymentStatus,
  SubscriptionPlan,
  VerificationStatus,
} from './types';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000);
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000);

// ─── STATIC DATA POOLS ────────────────────────────────────────────────────────

const NAIROBI_HOODS = [
  'Westlands', 'Kilimani', 'Lavington', 'Karen', 'Parklands', 'Kasarani',
  'Embakasi', 'Ngara', 'South B', 'South C', 'Ruaka', 'Gigiri', 'Runda',
  'Muthaiga', 'Upperhill', 'Kileleshwa', 'Hurlingham', 'Syokimau', 'Rongai',
];
const PROPERTY_TYPES = [
  'bedsitter', 'studio', '1_bedroom', '2_bedroom', '3_bedroom',
  '4_plus_bedroom', 'maisonette', 'bungalow', 'townhouse', 'commercial',
];
const AMENITY_SETS = [
  ['water', 'security', 'parking'],
  ['water', 'electricity', 'security', 'wifi'],
  ['water', 'security', 'parking', 'gym', 'pool'],
  ['water', 'electricity', 'parking', 'security', 'cctv', 'wifi'],
  ['water', 'electricity', 'parking', 'security', 'garden', 'dsq'],
  ['water', 'security', 'borehole', 'backup_generator'],
  ['water', 'electricity', 'parking', 'gym', 'pool', 'security', 'wifi', 'cctv'],
];
const INQUIRY_MESSAGES = [
  'I am interested in this property. Is it still available?',
  'Could you share more details about the amenities and service charge?',
  'I would like to schedule a viewing at your earliest convenience.',
  'Is there any flexibility on the rent? We are a family of four.',
  'Does the property allow pets? We have a small dog.',
  'What is the lease term? We prefer a 12-month contract.',
  'Is the property furnished or unfurnished?',
  'Are utilities included in the monthly rent?',
  'I would like to book this property for next month. What is the process?',
  'Is the neighborhood safe? Are there security guards at night?',
  'Do you accept M-Pesa for rent payment?',
  'Is there a standby generator for backup power?',
];
const SENDER_NAMES = [
  'Brian Omondi', 'Grace Wanjiku', 'Kevin Mutua', 'Esther Achieng',
  'Samuel Kimani', 'Mercy Njuguna', 'Daniel Otieno', 'Faith Mwangi',
  'Patrick Kariuki', 'Joyce Adhiambo', 'Stephen Ndirangu', 'Anne Wairimu',
  'Collins Odhiambo', 'Lydia Kamau', 'Victor Njoroge', 'Ruth Muthoni',
  'Alex Kipkoech', 'Tabitha Njeri', 'Dennis Waweru', 'Cynthia Atieno',
];
const AUDIT_ACTORS = [
  { email: 'admin@dwellyhomes.co.ke', role: 'platform_admin' },
  { email: 'james.mwangi@nairobilrealty.co.ke', role: 'tenant_admin' },
  { email: 'sarah.ochieng@primehomes.co.ke', role: 'tenant_admin' },
  { email: 'agent.staff@agency.co.ke', role: 'agent_staff' },
];
const AUDIT_ACTIONS = Object.values(AuditAction);
const RESOURCE_TYPES = ['User', 'Property', 'Tenant', 'Payment', 'Verification', 'Inquiry'];
const NOTIFICATION_TITLES = [
  ['New Viewing Request', 'inquiry'],
  ['New General Inquiry', 'inquiry'],
  ['Verification Approved', 'verification'],
  ['Verification Rejected', 'verification'],
  ['Subscription Renewed', 'payment'],
  ['Payment Successful', 'payment'],
  ['Property Listing Expiring', 'property'],
  ['EARB Certificate Expiring', 'earb'],
  ['New Team Member Added', 'system'],
  ['Welcome to Dwelly Homes!', 'system'],
];

// ─── AGENT TENANT DATA ────────────────────────────────────────────────────────

const AGENT_TENANTS = [
  { name: 'Nairobi Realty Ltd', slug: 'nairobi-realty-ltd', county: 'Nairobi', earbNo: 'EARB/2024/001', plan: 'professional' },
  { name: 'Prime Homes Kenya', slug: 'prime-homes-kenya', county: 'Nairobi', earbNo: 'EARB/2024/002', plan: 'starter' },
  { name: 'Savanna Properties', slug: 'savanna-properties', county: 'Nairobi', earbNo: 'EARB/2024/003', plan: 'enterprise' },
  { name: 'Coastal Realty Group', slug: 'coastal-realty-group', county: 'Mombasa', earbNo: 'EARB/2024/004', plan: 'professional' },
  { name: 'Rift Valley Homes', slug: 'rift-valley-homes', county: 'Nakuru', earbNo: 'EARB/2024/005', plan: 'starter' },
  { name: 'Lakeside Properties', slug: 'lakeside-properties', county: 'Kisumu', earbNo: 'EARB/2024/006', plan: 'professional' },
  { name: 'Metro Real Estate', slug: 'metro-real-estate', county: 'Nairobi', earbNo: 'EARB/2024/007', plan: 'enterprise' },
  { name: 'Greenfields Agency', slug: 'greenfields-agency', county: 'Kiambu', earbNo: 'EARB/2024/008', plan: 'starter' },
  { name: 'Capital City Homes', slug: 'capital-city-homes', county: 'Nairobi', earbNo: 'EARB/2024/009', plan: 'professional' },
  { name: 'Highlands Realty', slug: 'highlands-realty', county: 'Uasin Gishu', earbNo: 'EARB/2024/010', plan: 'starter' },
];

const LANDLORD_TENANTS = [
  { name: 'Peter Kamau Properties', slug: 'peter-kamau', county: 'Kiambu', email: 'peter.kamau@landlord.co.ke', phone: '+254734567890' },
  { name: 'Mary Wangari Rentals', slug: 'mary-wangari', county: 'Nairobi', email: 'mary.wangari@landlord.co.ke', phone: '+254734567891' },
  { name: 'Joseph Mutua Estates', slug: 'joseph-mutua', county: 'Machakos', email: 'joseph.mutua@landlord.co.ke', phone: '+254734567892' },
  { name: 'Elizabeth Atieno Homes', slug: 'elizabeth-atieno', county: 'Kisumu', email: 'elizabeth.atieno@landlord.co.ke', phone: '+254734567893' },
  { name: 'Robert Njoroge Properties', slug: 'robert-njoroge', county: 'Nairobi', email: 'robert.njoroge@landlord.co.ke', phone: '+254734567894' },
];

// ─── SEED EMAILS (for cleanup) ────────────────────────────────────────────────

function agentEmail(i: number) { return `agent.admin.${i}@dwellyhomes-seed.co.ke`; }
function staffEmail(tenantIdx: number, staffIdx: number) { return `staff${staffIdx}.t${tenantIdx}@dwellyhomes-seed.co.ke`; }
function landlordEmail(i: number) { return LANDLORD_TENANTS[i].email; }
function searcherEmail(i: number) { return `searcher${i}@dwellyhomes-seed.co.ke`; }

async function seed() {
  console.log('🌱 Connecting to MongoDB…');
  await mongoose.connect(config.db.uri);
  console.log('✅ Connected');

  // ─── CLEAN ──────────────────────────────────────────────────────────────────
  console.log('🧹 Cleaning previous seed data…');

  const coreEmails = [
    'admin@dwellyhomes.co.ke',
    'james.mwangi@nairobilrealty.co.ke',
    'agent1@nairobilrealty.co.ke',
    'sarah.ochieng@primehomes.co.ke',
    'peter.kamau@landlord.co.ke',
    'alice.njeri@gmail.com',
  ];
  const generatedEmails = [
    ...Array.from({ length: AGENT_TENANTS.length }, (_, i) => agentEmail(i)),
    ...Array.from({ length: AGENT_TENANTS.length }, (_, ti) =>
      Array.from({ length: 3 }, (_, si) => staffEmail(ti, si))
    ).flat(),
    ...Array.from({ length: LANDLORD_TENANTS.length }, (_, i) => landlordEmail(i)),
    ...Array.from({ length: 30 }, (_, i) => searcherEmail(i)),
  ];
  const allSeedEmails = [...coreEmails, ...generatedEmails];

  const oldUsers = await User.find({ email: { $in: allSeedEmails } });
  const oldUserIds = oldUsers.map((u) => u._id);
  const oldTenantIds = oldUsers.map((u) => u.tenantId).filter(Boolean);

  // Also delete by slug
  const slugs = [...AGENT_TENANTS.map((a) => a.slug), ...LANDLORD_TENANTS.map((l) => l.slug)];
  const oldTenantsBySlug = await Tenant.find({ slug: { $in: slugs } });
  const allOldTenantIds = [
    ...oldTenantIds,
    ...oldTenantsBySlug.map((t) => t._id),
  ];

  if (allOldTenantIds.length) {
    await Property.deleteMany({ tenantId: { $in: allOldTenantIds } });
    await Inquiry.deleteMany({ tenantId: { $in: allOldTenantIds } });
    await Commission.deleteMany({ tenantId: { $in: allOldTenantIds } });
    await Payment.deleteMany({ tenantId: { $in: allOldTenantIds } });
    await Verification.deleteMany({ tenantId: { $in: allOldTenantIds } });
    await AuditLog.deleteMany({ tenantId: { $in: allOldTenantIds } });
    await Tenant.deleteMany({ _id: { $in: allOldTenantIds } });
  }
  if (oldUserIds.length) {
    await Notification.deleteMany({ userId: { $in: oldUserIds } });
    await User.deleteMany({ _id: { $in: oldUserIds } });
  }
  // Clean searcher-specific audit logs / notifications by email
  await AuditLog.deleteMany({ actorEmail: { $in: allSeedEmails } });
  await County.deleteMany({});
  console.log('  ✅ Cleanup done');

  // ─── COUNTIES ──────────────────────────────────────────────────────────────
  console.log('🌍 Seeding counties…');
  const mappedCounties = KENYAN_COUNTIES.map(name => ({ name }));
  await County.insertMany(mappedCounties);
  console.log(`  ✅ Created ${KENYAN_COUNTIES.length} counties`);

  // ─── PLATFORM ADMIN ───────────────────────────────────────────────────────
  console.log('👑 Creating platform admin…');
  const adminUser = await User.create({
    fullName: 'Dwelly Admin',
    email: 'admin@dwellyhomes.co.ke',
    phone: '+254700000001',
    password: 'Admin@1234',
    accountType: 'estate_agent',
    role: 'platform_admin',
    isPhoneVerified: true,
    isActive: true,
    tenantId: null,
  });
  console.log('  ✅ admin@dwellyhomes.co.ke / Admin@1234');

  // ─── ESTATE AGENT TENANTS ─────────────────────────────────────────────────
  console.log(`🏢 Creating ${AGENT_TENANTS.length} estate agent tenants…`);
  const agentAdminUsers: mongoose.Document[] = [];
  const agentTenants: mongoose.Document[] = [];

  const verificationStatuses: VerificationStatus[] = [
    VerificationStatus.APPROVED,
    VerificationStatus.UNDER_REVIEW,
    VerificationStatus.DOCUMENTS_UPLOADED,
    VerificationStatus.INFORMATION_REQUESTED,
    VerificationStatus.REJECTED,
    VerificationStatus.NOT_SUBMITTED,
  ];

  for (let i = 0; i < AGENT_TENANTS.length; i++) {
    const td = AGENT_TENANTS[i];
    const adminU = await User.create({
      fullName: `Agent Admin ${i + 1}`,
      email: agentEmail(i),
      phone: `+25471${String(i).padStart(7, '0')}`,
      password: 'Agent@1234',
      accountType: 'estate_agent',
      role: 'tenant_admin',
      isPhoneVerified: true,
      isActive: true,
      tenantId: null,
    });
    const vStatus = verificationStatuses[i % verificationStatuses.length];
    const tenant = await Tenant.create({
      businessName: td.name,
      slug: td.slug,
      accountType: 'estate_agent',
      ownerId: (adminU as any)._id,
      contactEmail: agentEmail(i),
      contactPhone: `+25471${String(i).padStart(7, '0')}`,
      physicalAddress: `${td.county} Business District`,
      county: td.county,
      bio: `Leading real estate agency in ${td.county} with professional listings.`,
      status: i < 8 ? 'active' : 'suspended',
      verificationStatus: vStatus,
      earbNumber: vStatus === VerificationStatus.APPROVED ? td.earbNo : null,
      earbExpiryDate: vStatus === VerificationStatus.APPROVED
        ? (i % 3 === 0 ? daysFromNow(30) : daysFromNow(365))
        : null,
      subscriptionPlan: td.plan,
      subscriptionExpiresAt: daysFromNow(randInt(30, 365)),
      totalListings: 0,
      activeListings: 0,
    });
    (adminU as any).tenantId = (tenant as any)._id;
    await (adminU as any).save();
    agentAdminUsers.push(adminU);
    agentTenants.push(tenant);
  }
  console.log(`  ✅ Created ${AGENT_TENANTS.length} estate agent tenants`);

  // ─── AGENT STAFF ──────────────────────────────────────────────────────────
  console.log('👤 Creating agent staff…');
  const allStaffUsers: mongoose.Document[] = [];
  for (let ti = 0; ti < AGENT_TENANTS.length; ti++) {
    const tenantDoc = agentTenants[ti] as any;
    for (let si = 0; si < 3; si++) {
      const staffU = await User.create({
        fullName: `Staff ${si + 1} of ${AGENT_TENANTS[ti].name}`,
        email: staffEmail(ti, si),
        phone: `+25472${String(ti * 3 + si).padStart(7, '0')}`,
        password: 'Staff@1234',
        accountType: 'estate_agent',
        role: 'agent_staff',
        isPhoneVerified: true,
        isActive: si < 2,
        tenantId: tenantDoc._id,
      });
      allStaffUsers.push(staffU);
    }
  }
  console.log(`  ✅ Created ${allStaffUsers.length} staff users`);

  // ─── LANDLORD TENANTS ─────────────────────────────────────────────────────
  console.log('🏡 Creating landlord tenants…');
  const landlordUsers: mongoose.Document[] = [];
  const landlordTenants: mongoose.Document[] = [];
  for (let i = 0; i < LANDLORD_TENANTS.length; i++) {
    const ld = LANDLORD_TENANTS[i];
    const lu = await User.create({
      fullName: ld.name.replace(' Properties', '').replace(' Rentals', '').replace(' Estates', '').replace(' Homes', ''),
      email: ld.email,
      phone: ld.phone,
      password: 'Landlord@1234',
      accountType: 'landlord',
      role: 'tenant_admin',
      isPhoneVerified: true,
      isActive: true,
      tenantId: null,
    });
    const lt = await Tenant.create({
      businessName: ld.name,
      slug: ld.slug,
      accountType: 'landlord',
      ownerId: (lu as any)._id,
      contactEmail: ld.email,
      contactPhone: ld.phone,
      county: ld.county,
      status: 'active',
      verificationStatus: i < 2 ? 'approved' : 'not_submitted',
      subscriptionPlan: 'starter',
      subscriptionExpiresAt: daysFromNow(180),
      totalListings: 0,
      activeListings: 0,
    });
    (lu as any).tenantId = (lt as any)._id;
    await (lu as any).save();
    landlordUsers.push(lu);
    landlordTenants.push(lt);
  }
  console.log(`  ✅ Created ${LANDLORD_TENANTS.length} landlord tenants`);

  // ─── SEARCHERS ────────────────────────────────────────────────────────────
  console.log('🔍 Creating 30 searchers…');
  const searchers: mongoose.Document[] = [];
  for (let i = 0; i < 30; i++) {
    const su = await User.create({
      fullName: SENDER_NAMES[i % SENDER_NAMES.length],
      email: searcherEmail(i),
      phone: `+25474${String(i).padStart(7, '0')}`,
      password: 'Searcher@1234',
      accountType: 'searcher',
      role: 'searcher',
      isPhoneVerified: true,
      isActive: true,
      tenantId: null,
    });
    searchers.push(su);
  }
  // Also create the original Alice
  const aliceUser = await User.create({
    fullName: 'Alice Njeri',
    email: 'alice.njeri@gmail.com',
    phone: '+254745678901',
    password: 'Searcher@1234',
    accountType: 'searcher',
    role: 'searcher',
    isPhoneVerified: true,
    isActive: true,
    tenantId: null,
  });
  searchers.push(aliceUser);
  console.log(`  ✅ Created ${searchers.length} searchers`);

  // ─── PROPERTIES ────────────────────────────────────────────────────────────
  console.log('🏠 Creating ~200 properties…');
  const allProperties: mongoose.Document[] = [];
  const propertyStatuses = ['available', 'available', 'available', 'occupied', 'draft', 'under_maintenance'];
  const rentRanges: Record<string, [number, number]> = {
    bedsitter: [8000, 18000], studio: [20000, 50000], '1_bedroom': [20000, 60000],
    '2_bedroom': [35000, 120000], '3_bedroom': [60000, 200000], '4_plus_bedroom': [150000, 400000],
    maisonette: [80000, 250000], bungalow: [70000, 200000], townhouse: [100000, 350000],
    commercial: [50000, 500000],
  };

  for (let ti = 0; ti < agentTenants.length; ti++) {
    const tenant = agentTenants[ti] as any;
    const adminUser_ = agentAdminUsers[ti] as any;
    const staff = allStaffUsers.filter((s: any) => String(s.tenantId) === String(tenant._id));
    const propCount = randInt(15, 22);
    const tenantProps: mongoose.Document[] = [];

    for (let pi = 0; pi < propCount; pi++) {
      const pType = PROPERTY_TYPES[pi % PROPERTY_TYPES.length];
      const hood = pick(NAIROBI_HOODS);
      const [minR, maxR] = rentRanges[pType] || [20000, 80000];
      const rent = randInt(minR, maxR);
      const status = propertyStatuses[pi % propertyStatuses.length];
      const agentForProp = pi % 3 === 0 ? adminUser_ : (staff.length > 0 ? (staff[pi % staff.length] as any) : adminUser_);

      const prop = await Property.create({
        title: `${pType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} – ${hood}, ${AGENT_TENANTS[ti].county}`,
        description: `Beautiful ${pType.replace(/_/g, ' ')} located in ${hood}. ${pi % 2 === 0 ? 'Fully furnished with modern appliances.' : 'Spacious rooms with natural lighting.'} Ideal for ${pi % 3 === 0 ? 'professionals' : pi % 3 === 1 ? 'families' : 'students'}.`,
        propertyType: pType,
        monthlyRent: rent,
        serviceCharge: Math.round(rent * 0.05),
        status,
        county: AGENT_TENANTS[ti].county,
        constituency: hood,
        neighborhood: hood,
        streetEstate: `${hood} ${pi % 2 === 0 ? 'Apartments' : 'Estate'} Block ${pi + 1}`,
        amenities: AMENITY_SETS[pi % AMENITY_SETS.length],
        tenantId: tenant._id,
        agentId: agentForProp._id,
        availableFrom: status === 'available' ? new Date() : daysFromNow(randInt(7, 60)),
        expiresAt: daysFromNow(randInt(30, 120)),
        viewCount: randInt(0, 250),
        isHiddenByAdmin: false,
      });
      tenantProps.push(prop);
      allProperties.push(prop);
    }
    await Tenant.findByIdAndUpdate(tenant._id, {
      totalListings: tenantProps.length,
      activeListings: tenantProps.filter((p: any) => p.status === 'available').length,
    });
  }

  // Landlord properties (5-8 each)
  for (let li = 0; li < landlordTenants.length; li++) {
    const lt = landlordTenants[li] as any;
    const lu = landlordUsers[li] as any;
    const count = randInt(5, 8);
    const ltProps: mongoose.Document[] = [];
    for (let pi = 0; pi < count; pi++) {
      const pType = pick(['1_bedroom', '2_bedroom', '3_bedroom', 'bedsitter', 'studio']);
      const hood = pick(NAIROBI_HOODS);
      const [minR, maxR] = rentRanges[pType];
      const prop = await Property.create({
        title: `${pType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} – ${hood}`,
        description: `Affordable ${pType.replace(/_/g, ' ')} in ${hood}. Direct from landlord, no agency fees.`,
        propertyType: pType,
        monthlyRent: randInt(minR, maxR),
        serviceCharge: 2000,
        status: pi < 3 ? 'available' : 'occupied',
        county: lt.county || 'Nairobi',
        constituency: hood,
        neighborhood: hood,
        streetEstate: `${hood} Road`,
        amenities: AMENITY_SETS[pi % AMENITY_SETS.length],
        tenantId: lt._id,
        agentId: lu._id,
        availableFrom: new Date(),
        expiresAt: daysFromNow(90),
        viewCount: randInt(0, 80),
        isHiddenByAdmin: false,
      });
      ltProps.push(prop);
      allProperties.push(prop);
    }
    await Tenant.findByIdAndUpdate(lt._id, {
      totalListings: ltProps.length,
      activeListings: ltProps.filter((p: any) => p.status === 'available').length,
    });
  }

  // Insert mockProperties from frontend
  console.log('🏠 Seeding frontend mock properties…');
  const mappedMockProps: mongoose.Document[] = [];
  const propertyTypesMap: Record<string, string> = {
    'Bedsitter': 'bedsitter',
    'Studio': 'studio',
    '1 Bedroom': '1_bedroom',
    '2 Bedroom': '2_bedroom',
    '3 Bedroom': '3_bedroom',
    '4+ Bedroom': '4_plus_bedroom',
    'Maisonette': 'maisonette',
    'Bungalow': 'bungalow',
    'Townhouse': 'townhouse',
  };

  for (const mp of mockPropertiesFront) {
    // Find tenant by slug
    const tenant = agentTenants.concat(landlordTenants).find((t: any) => t.slug === mp.agent.slug) as any;
    if (!tenant) continue;
    
    // Find an agent/user who owns this tenant or works for them
    const agent = agentAdminUsers.concat(landlordUsers).find((u: any) => String(u.tenantId) === String(tenant._id)) as any;
    
    const prop = await Property.create({
      title: mp.title,
      description: mp.description,
      propertyType: propertyTypesMap[mp.type] || '2_bedroom',
      monthlyRent: mp.price,
      serviceCharge: Math.round(mp.price * 0.05),
      status: mp.status === 'under-maintenance' ? 'under_maintenance' : mp.status,
      county: mp.location.county,
      constituency: mp.location.neighborhood,
      neighborhood: mp.location.neighborhood,
      streetEstate: mp.location.neighborhood,
      coordinates: { lat: mp.location.lat, lng: mp.location.lng },
      amenities: mp.amenities,
      tenantId: tenant._id,
      agentId: agent ? agent._id : tenant.ownerId,
      availableFrom: new Date(),
      expiresAt: daysFromNow(90),
      viewCount: randInt(50, 200),
      isHiddenByAdmin: false,
      images: mp.images.map((img, idx) => ({
        url: `/assets/${img}`,
        publicId: `seed/${img}`,
        isCover: idx === 0,
        order: idx,
      })),
    });
    mappedMockProps.push(prop);
    allProperties.push(prop);
  }
  console.log(`  ✅ Created ${mappedMockProps.length} frontend mock properties`);

  console.log(`  ✅ Created ${allProperties.length} total properties`);

  // ─── INQUIRIES ─────────────────────────────────────────────────────────────
  console.log('📬 Creating ~300 inquiries…');
  const inquiryTypes = ['general', 'viewing_request', 'booking_intent'];
  const inquiryStatuses = ['new', 'new', 'responded', 'closed'];
  const timeSlots = ['morning', 'afternoon', 'evening'];
  const inquiryBatch: object[] = [];

  for (let i = 0; i < 300; i++) {
    const prop = allProperties[i % allProperties.length] as any;
    const sender = SENDER_NAMES[i % SENDER_NAMES.length];
    const iType = inquiryTypes[i % inquiryTypes.length];
    const iStatus = inquiryStatuses[i % inquiryStatuses.length];
    const senderIdx = i % 30;

    inquiryBatch.push({
      propertyId: prop._id,
      tenantId: prop.tenantId,
      agentId: prop.agentId,
      inquiryType: iType,
      status: iStatus,
      senderName: sender,
      senderPhone: `+25475${String(senderIdx).padStart(7, '0')}`,
      senderEmail: `${sender.toLowerCase().replace(/ /g, '.')}${senderIdx}@gmail.com`,
      message: INQUIRY_MESSAGES[i % INQUIRY_MESSAGES.length],
      requestedDate: iType === 'viewing_request' ? daysFromNow(randInt(1, 14)) : undefined,
      requestedTimeSlot: iType === 'viewing_request' ? pick(timeSlots) : undefined,
      isRead: iStatus !== 'new',
      createdAt: daysAgo(randInt(0, 90)),
    });
  }
  await Inquiry.insertMany(inquiryBatch);
  console.log(`  ✅ Created ${inquiryBatch.length} inquiries`);

  // ─── NOTIFICATIONS ─────────────────────────────────────────────────────────
  console.log('🔔 Creating ~300 notifications…');
  const allAgentUsers = [...agentAdminUsers, ...allStaffUsers];
  const notifBatch: object[] = [];

  for (let i = 0; i < 300; i++) {
    const user = allAgentUsers[i % allAgentUsers.length] as any;
    const [title, type] = NOTIFICATION_TITLES[i % NOTIFICATION_TITLES.length];
    notifBatch.push({
      userId: user._id,
      tenantId: user.tenantId,
      type,
      title,
      body: `${title} — action required. Please check your dashboard.`,
      link: type === 'inquiry' ? '/dashboard/inquiries'
        : type === 'verification' ? '/admin/verifications'
        : type === 'payment' ? '/dashboard/billing'
        : '/dashboard',
      isRead: i % 3 !== 0,
      createdAt: daysAgo(randInt(0, 120)),
    });
  }
  // Add admin notifications
  for (let i = 0; i < 50; i++) {
    const [title, type] = NOTIFICATION_TITLES[i % NOTIFICATION_TITLES.length];
    notifBatch.push({
      userId: adminUser._id,
      tenantId: null,
      type,
      title,
      body: `Admin notification: ${title}`,
      link: '/admin/verifications',
      isRead: i % 2 === 0,
      createdAt: daysAgo(randInt(0, 120)),
    });
  }
  await Notification.insertMany(notifBatch);
  console.log(`  ✅ Created ${notifBatch.length} notifications`);

  // ─── VERIFICATIONS ─────────────────────────────────────────────────────────
  console.log('📋 Creating verifications for estate agent tenants…');
  const docTypes = ['national_id_front', 'national_id_back', 'kra_pin', 'business_registration', 'earb_certificate'];
  const verificationBatch: object[] = [];

  for (let i = 0; i < agentTenants.length; i++) {
    const tenant = agentTenants[i] as any;
    const adminU = agentAdminUsers[i] as any;
    const vStatus = tenant.verificationStatus;

    const hasDocuments = vStatus !== 'not_submitted';
    const documents = hasDocuments
      ? docTypes.slice(0, i % 2 === 0 ? 5 : 3).map((dt) => ({
          documentType: dt,
          url: `https://res.cloudinary.com/dwelly/image/upload/v1/seed/doc_${i}_${dt}.pdf`,
          publicId: `seed/doc_${i}_${dt}`,
          uploadedAt: daysAgo(randInt(5, 30)),
          status: vStatus === 'approved' ? 'approved' : vStatus === 'rejected' ? 'rejected' : 'pending',
        }))
      : [];

    verificationBatch.push({
      tenantId: tenant._id,
      submittedBy: adminU._id,
      status: vStatus,
      documents,
      earbNumber: vStatus === 'approved' ? AGENT_TENANTS[i].earbNo : null,
      earbExpiryDate: vStatus === 'approved'
        ? (i % 3 === 0 ? daysFromNow(30) : daysFromNow(365))
        : null,
      adminNotes: vStatus === 'rejected' ? 'Documents were invalid. Please resubmit with clear scans.'
        : vStatus === 'information_requested' ? 'Please provide a clearer copy of the KRA PIN certificate.'
        : null,
      reviewedBy: ['approved', 'rejected', 'information_requested'].includes(vStatus) ? adminUser._id : null,
      reviewedAt: ['approved', 'rejected', 'information_requested'].includes(vStatus) ? daysAgo(randInt(1, 10)) : null,
      submittedAt: hasDocuments ? daysAgo(randInt(10, 40)) : null,
    });
  }
  await Verification.insertMany(verificationBatch);
  console.log(`  ✅ Created ${verificationBatch.length} verifications`);

  // ─── PAYMENTS ──────────────────────────────────────────────────────────────
  console.log('💳 Creating ~120 payment records…');
  const paymentBatch: object[] = [];
  const planPrices: Record<string, number> = { starter: 5000, professional: 15000, enterprise: 35000 };
  let receiptCounter = 1000;

  for (let i = 0; i < 120; i++) {
    const tenantIdx = i % agentTenants.length;
    const tenant = agentTenants[tenantIdx] as any;
    const plan = AGENT_TENANTS[tenantIdx].plan as keyof typeof planPrices;
    const isSuccess = i % 5 !== 0; // 80% success
    const pStatus = isSuccess ? 'success' : (i % 10 === 0 ? 'failed' : 'cancelled');

    paymentBatch.push({
      tenantId: tenant._id,
      paymentType: 'subscription',
      status: pStatus,
      amount: planPrices[plan] || 5000,
      phone: `+25471${String(tenantIdx).padStart(7, '0')}`,
      plan,
      billingPeriod: 'monthly',
      propertyId: null,
      commissionRate: null,
      checkoutRequestId: `ws_CO_${Date.now()}_${i}`,
      merchantRequestId: `${Date.now()}-${i}`,
      // Omit mpesaReceiptNumber for non-success (sparse unique index rejects multiple nulls)
      ...(isSuccess ? {
        mpesaReceiptNumber: `QJL${String(receiptCounter++).padStart(7, '0')}`,
        mpesaTransactionDate: new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14),
      } : {}),
      description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan — Monthly Subscription`,
      failureReason: pStatus === 'failed' ? 'Insufficient funds' : null,
      createdAt: daysAgo(randInt(0, 365)),
    });
  }
  // Use raw collection to bypass Mongoose defaults (avoids sparse-unique null conflict)
  await Payment.collection.insertMany(paymentBatch.map((doc) => ({
    ...doc,
    updatedAt: new Date(),
    __v: 0,
  })));
  console.log(`  ✅ Created ${paymentBatch.length} payments`);

  // ─── COMMISSIONS ───────────────────────────────────────────────────────────
  console.log('💰 Creating ~80 commission records…');
  const commissionBatch: object[] = [];
  const commissionStatuses: Array<'pending_payment' | 'paid' | 'waived'> = ['pending_payment', 'paid', 'waived'];
  const availableProps = allProperties.filter((p: any) => p.status === 'available' || p.status === 'occupied');

  for (let i = 0; i < 80; i++) {
    const prop = availableProps[i % availableProps.length] as any;
    const rent = prop.monthlyRent || 50000;
    const rate = pick([5, 7.5, 10]);
    const amount = Math.round(rent * rate / 100);
    const cStatus = commissionStatuses[i % commissionStatuses.length];

    commissionBatch.push({
      tenantId: prop.tenantId,
      propertyId: prop._id,
      agentId: prop.agentId,
      monthlyRent: rent,
      commissionRate: rate,
      commissionAmount: amount,
      moveInDate: daysAgo(randInt(0, 180)),
      status: cStatus,
      paymentId: null,
      createdAt: daysAgo(randInt(0, 180)),
    });
  }
  await Commission.insertMany(commissionBatch);
  console.log(`  ✅ Created ${commissionBatch.length} commissions`);

  // ─── AUDIT LOGS ─────────────────────────────────────────────────────────────
  console.log('📜 Creating ~200 audit log entries…');
  const auditBatch: object[] = [];

  for (let i = 0; i < 200; i++) {
    const actor = AUDIT_ACTORS[i % AUDIT_ACTORS.length];
    const action = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length];
    const resourceType = RESOURCE_TYPES[i % RESOURCE_TYPES.length];
    const tenantIdx = i % agentTenants.length;

    auditBatch.push({
      actorId: agentAdminUsers[tenantIdx] ? (agentAdminUsers[tenantIdx] as any)._id : null,
      actorEmail: actor.email,
      actorRole: actor.role,
      tenantId: agentTenants[tenantIdx] ? (agentTenants[tenantIdx] as any)._id : null,
      action,
      resourceType,
      resourceId: new mongoose.Types.ObjectId().toString(),
      ipAddress: `41.${randInt(100, 220)}.${randInt(1, 254)}.${randInt(1, 254)}`,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      payload: { note: `Seeded audit entry #${i + 1}` },
      createdAt: daysAgo(randInt(0, 180)),
    });
  }
  // Admin-only audit entries
  for (let i = 0; i < 50; i++) {
    auditBatch.push({
      actorId: adminUser._id,
      actorEmail: 'admin@dwellyhomes.co.ke',
      actorRole: 'platform_admin',
      tenantId: null,
      action: pick([AuditAction.VERIFICATION_APPROVE, AuditAction.VERIFICATION_REJECT, AuditAction.ACCOUNT_SUSPEND, AuditAction.ADMIN_ACTION]),
      resourceType: pick(['Verification', 'Tenant', 'User']),
      resourceId: new mongoose.Types.ObjectId().toString(),
      ipAddress: `197.${randInt(100, 220)}.${randInt(1, 254)}.${randInt(1, 254)}`,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      payload: null,
      createdAt: daysAgo(randInt(0, 90)),
    });
  }
  await AuditLog.insertMany(auditBatch);
  console.log(`  ✅ Created ${auditBatch.length} audit log entries`);

  // ─── SUMMARY ──────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    User.countDocuments(),
    Tenant.countDocuments(),
    Property.countDocuments(),
    Inquiry.countDocuments(),
    Notification.countDocuments(),
    Verification.countDocuments(),
    Payment.countDocuments(),
    Commission.countDocuments(),
    AuditLog.countDocuments(),
  ]);

  console.log('\n🎉 Seed complete!\n');
  console.log('📊 Collection counts:');
  console.log(`  Users:         ${counts[0]}`);
  console.log(`  Tenants:       ${counts[1]}`);
  console.log(`  Properties:    ${counts[2]}`);
  console.log(`  Inquiries:     ${counts[3]}`);
  console.log(`  Notifications: ${counts[4]}`);
  console.log(`  Verifications: ${counts[5]}`);
  console.log(`  Payments:      ${counts[6]}`);
  console.log(`  Commissions:   ${counts[7]}`);
  console.log(`  Audit Logs:    ${counts[8]}`);

  console.log('\n🔑 Primary test accounts:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Platform Admin:  admin@dwellyhomes.co.ke          / Admin@1234');
  console.log('Estate Agent 0:  agent.admin.0@dwellyhomes-seed.co.ke / Agent@1234');
  console.log('Estate Agent 1:  agent.admin.1@dwellyhomes-seed.co.ke / Agent@1234');
  console.log('Landlord 0:      peter.kamau@landlord.co.ke       / Landlord@1234');
  console.log('Searcher 0:      searcher0@dwellyhomes-seed.co.ke / Searcher@1234');
  console.log('Searcher (orig): alice.njeri@gmail.com            / Searcher@1234');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await mongoose.disconnect();
  console.log('\n✅ Disconnected');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
