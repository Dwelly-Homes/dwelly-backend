/**
 * Seed script for Dwelly Homes backend
 * Creates: 1 platform admin, 2 estate agents (with active tenants + properties),
 * 1 landlord, 1 searcher, inquiries, notifications
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
import { config } from './config';

async function seed() {
  console.log('🌱 Connecting to MongoDB…');
  await mongoose.connect(config.db.uri);
  console.log('✅ Connected');

  // ─── CLEAN EXISTING SEED DATA ─────────────────────────────────────────────
  console.log('🧹 Cleaning old seed data…');
  const seedEmails = [
    'admin@dwellyhomes.co.ke',
    'james.mwangi@nairobilrealty.co.ke',
    'sarah.ochieng@primehomes.co.ke',
    'peter.kamau@landlord.co.ke',
    'alice.njeri@gmail.com',
    'agent1@nairobilrealty.co.ke',
  ];
  const oldUsers = await User.find({ email: { $in: seedEmails } });
  const oldUserIds = oldUsers.map((u) => u._id);
  const oldTenantIds = oldUsers.map((u) => u.tenantId).filter(Boolean);

  await Property.deleteMany({ tenantId: { $in: oldTenantIds } });
  await Inquiry.deleteMany({ tenantId: { $in: oldTenantIds } });
  await Notification.deleteMany({ userId: { $in: oldUserIds } });
  await Tenant.deleteMany({ _id: { $in: oldTenantIds } });
  await User.deleteMany({ email: { $in: seedEmails } });

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
  console.log(`  ✅ Admin: admin@dwellyhomes.co.ke / Admin@1234`);

  // ─── ESTATE AGENT 1: Nairobi Realty Ltd ───────────────────────────────────
  console.log('🏢 Creating Estate Agent 1 (Nairobi Realty Ltd)…');
  const agent1User = await User.create({
    fullName: 'James Mwangi',
    email: 'james.mwangi@nairobilrealty.co.ke',
    phone: '+254712345678',
    password: 'Agent@1234',
    accountType: 'estate_agent',
    role: 'tenant_admin',
    isPhoneVerified: true,
    isActive: true,
    tenantId: null,
  });

  const tenant1 = await Tenant.create({
    businessName: 'Nairobi Realty Ltd',
    slug: 'nairobi-realty-ltd',
    accountType: 'estate_agent',
    ownerId: agent1User._id,
    contactEmail: 'james.mwangi@nairobilrealty.co.ke',
    contactPhone: '+254712345678',
    physicalAddress: 'Westlands Square, 3rd Floor, Nairobi',
    county: 'Nairobi',
    bio: 'Premier real estate agency in Nairobi with over 10 years of experience.',
    status: 'active',
    verificationStatus: 'approved',
    earbNumber: 'EARB/2024/001',
    earbExpiryDate: new Date('2025-12-31'),
    subscriptionPlan: 'professional',
    subscriptionExpiresAt: new Date('2025-12-31'),
    totalListings: 0,
    activeListings: 0,
  });

  agent1User.tenantId = tenant1._id as mongoose.Types.ObjectId;
  await agent1User.save();
  console.log(`  ✅ Agent: james.mwangi@nairobilrealty.co.ke / Agent@1234 (tenant: ${tenant1._id})`);

  // Staff member for tenant1
  const staff1 = await User.create({
    fullName: 'Lucy Wanjiku',
    email: 'agent1@nairobilrealty.co.ke',
    phone: '+254712345679',
    password: 'Staff@1234',
    accountType: 'estate_agent',
    role: 'agent_staff',
    isPhoneVerified: true,
    isActive: true,
    tenantId: tenant1._id,
  });

  // ─── PROPERTIES FOR AGENT 1 ───────────────────────────────────────────────
  console.log('🏠 Creating properties for Nairobi Realty Ltd…');
  const propertyData = [
    {
      title: 'Modern 2-Bedroom in Westlands',
      description: 'A beautifully furnished 2-bedroom apartment in the heart of Westlands. Features open-plan living, modern kitchen with granite countertops, master en-suite, and balcony with city views.',
      propertyType: '2_bedroom',
      monthlyRent: 85000,
      serviceCharge: 5000,
      status: 'available',
      county: 'Nairobi',
      constituency: 'Westlands',
      neighborhood: 'Parklands',
      streetEstate: 'Westlands Square Apartments',
      amenities: ['parking', 'wifi', 'gym', 'security', 'water', 'borehole'],
    },
    {
      title: 'Executive Studio – Kilimani',
      description: 'Compact executive studio apartment in Kilimani. Perfect for professionals. DSQ included. Close to major shopping centers and restaurants.',
      propertyType: 'studio',
      monthlyRent: 45000,
      serviceCharge: 3000,
      status: 'available',
      county: 'Nairobi',
      constituency: 'Dagoretti North',
      neighborhood: 'Kilimani',
      streetEstate: 'Kilimani Heights',
      amenities: ['parking', 'security', 'water', 'wifi'],
    },
    {
      title: 'Spacious 3-Bedroom Maisonette – Karen',
      description: 'Stunning 3-bedroom maisonette in a quiet Karen neighbourhood. Private garden, double garage, servant quarters, and access to communal swimming pool.',
      propertyType: 'maisonette',
      monthlyRent: 180000,
      serviceCharge: 8000,
      status: 'available',
      county: 'Nairobi',
      constituency: 'Karen',
      neighborhood: 'Karen',
      streetEstate: 'Karen Estate Drive',
      amenities: ['parking', 'garden', 'swimming_pool', 'security', 'water', 'electricity', 'dsq'],
    },
    {
      title: 'Bedsitter in Ngara – Budget Friendly',
      description: 'Well-maintained bedsitter in Ngara. Ideal for students or single professionals. Walking distance to Ngara market and public transport.',
      propertyType: 'bedsitter',
      monthlyRent: 12000,
      serviceCharge: 1000,
      status: 'available',
      county: 'Nairobi',
      constituency: 'Starehe',
      neighborhood: 'Ngara',
      streetEstate: 'Ngara Road Flats',
      amenities: ['security', 'water'],
    },
    {
      title: '1-Bedroom Apartment – Ruaka',
      description: 'Modern 1-bedroom apartment in the fast-growing Ruaka area. Well-connected to Nairobi CBD and Gigiri. All rooms are spacious and well-lit.',
      propertyType: '1_bedroom',
      monthlyRent: 30000,
      serviceCharge: 2000,
      status: 'available',
      county: 'Kiambu',
      constituency: 'Limuru',
      neighborhood: 'Ruaka',
      streetEstate: 'Ruaka Ridge Apartments',
      amenities: ['parking', 'security', 'water', 'wifi'],
    },
  ];

  const properties: mongoose.Document[] = [];
  for (const p of propertyData) {
    const prop = await Property.create({
      ...p,
      tenantId: tenant1._id,
      agentId: agent1User._id,
      availableFrom: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    });
    properties.push(prop);
  }
  await Tenant.findByIdAndUpdate(tenant1._id, { totalListings: properties.length, activeListings: properties.length });
  console.log(`  ✅ Created ${properties.length} properties`);

  // ─── ESTATE AGENT 2: Prime Homes Kenya ────────────────────────────────────
  console.log('🏢 Creating Estate Agent 2 (Prime Homes Kenya)…');
  const agent2User = await User.create({
    fullName: 'Sarah Ochieng',
    email: 'sarah.ochieng@primehomes.co.ke',
    phone: '+254723456789',
    password: 'Agent@1234',
    accountType: 'estate_agent',
    role: 'tenant_admin',
    isPhoneVerified: true,
    isActive: true,
    tenantId: null,
  });

  const tenant2 = await Tenant.create({
    businessName: 'Prime Homes Kenya',
    slug: 'prime-homes-kenya',
    accountType: 'estate_agent',
    ownerId: agent2User._id,
    contactEmail: 'sarah.ochieng@primehomes.co.ke',
    contactPhone: '+254723456789',
    physicalAddress: 'Upper Hill, Nairobi',
    county: 'Nairobi',
    bio: 'Specializing in premium residential and commercial properties across Kenya.',
    status: 'active',
    verificationStatus: 'approved',
    earbNumber: 'EARB/2024/002',
    earbExpiryDate: new Date('2025-06-30'),
    subscriptionPlan: 'starter',
    subscriptionExpiresAt: new Date('2025-12-31'),
    totalListings: 0,
    activeListings: 0,
  });

  agent2User.tenantId = tenant2._id as mongoose.Types.ObjectId;
  await agent2User.save();
  console.log(`  ✅ Agent: sarah.ochieng@primehomes.co.ke / Agent@1234`);

  const properties2 = await Property.insertMany([
    {
      title: '4-Bedroom Townhouse – Lavington',
      description: 'Elegant 4-bedroom townhouse in Lavington. Master bedroom with walk-in closet and jacuzzi. Modern kitchen, family room, study, and 2-car garage.',
      propertyType: '4_plus_bedroom',
      monthlyRent: 280000,
      serviceCharge: 15000,
      status: 'available',
      county: 'Nairobi',
      constituency: 'Dagoretti South',
      neighborhood: 'Lavington',
      streetEstate: 'Lavington Close',
      amenities: ['parking', 'security', 'garden', 'gym', 'swimming_pool', 'water', 'backup_generator'],
      tenantId: tenant2._id,
      agentId: agent2User._id,
      availableFrom: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Modern 2-Bedroom – Kasarani',
      description: 'Brand new 2-bedroom apartment in Kasarani. Ceramic tile floors, fitted kitchen, and ample natural light. Near Kasarani Sports Complex.',
      propertyType: '2_bedroom',
      monthlyRent: 35000,
      serviceCharge: 2500,
      status: 'available',
      county: 'Nairobi',
      constituency: 'Kasarani',
      neighborhood: 'Kasarani',
      streetEstate: 'Kasarani Apartments',
      amenities: ['parking', 'security', 'water'],
      tenantId: tenant2._id,
      agentId: agent2User._id,
      availableFrom: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Office Space – Upperhill',
      description: 'Professional office space available in Upper Hill business district. 2 private offices, boardroom, reception area. Open plan option available.',
      propertyType: 'commercial',
      monthlyRent: 150000,
      serviceCharge: 20000,
      status: 'available',
      county: 'Nairobi',
      constituency: 'Nairobi West',
      neighborhood: 'Upper Hill',
      streetEstate: 'Upper Hill Square',
      amenities: ['parking', 'security', 'wifi', 'backup_generator', 'water'],
      tenantId: tenant2._id,
      agentId: agent2User._id,
      availableFrom: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  ]);
  await Tenant.findByIdAndUpdate(tenant2._id, { totalListings: properties2.length, activeListings: properties2.length });
  console.log(`  ✅ Created ${properties2.length} properties`);

  // ─── LANDLORD ─────────────────────────────────────────────────────────────
  console.log('🏡 Creating Landlord…');
  const landlordUser = await User.create({
    fullName: 'Peter Kamau',
    email: 'peter.kamau@landlord.co.ke',
    phone: '+254734567890',
    password: 'Landlord@1234',
    accountType: 'landlord',
    role: 'tenant_admin',
    isPhoneVerified: true,
    isActive: true,
    tenantId: null,
  });

  const landlordTenant = await Tenant.create({
    businessName: 'Peter Kamau',
    slug: 'peter-kamau',
    accountType: 'landlord',
    ownerId: landlordUser._id,
    contactEmail: 'peter.kamau@landlord.co.ke',
    contactPhone: '+254734567890',
    county: 'Kiambu',
    status: 'active',
    verificationStatus: 'not_submitted',
    subscriptionPlan: 'starter',
    subscriptionExpiresAt: new Date('2025-12-31'),
    totalListings: 0,
    activeListings: 0,
  });
  landlordUser.tenantId = landlordTenant._id as mongoose.Types.ObjectId;
  await landlordUser.save();
  console.log(`  ✅ Landlord: peter.kamau@landlord.co.ke / Landlord@1234`);

  // ─── SEARCHER (tenant user) ────────────────────────────────────────────────
  console.log('🔍 Creating Searcher…');
  const searcherUser = await User.create({
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
  console.log(`  ✅ Searcher: alice.njeri@gmail.com / Searcher@1234`);

  // ─── INQUIRIES ────────────────────────────────────────────────────────────
  console.log('📬 Creating inquiries…');
  const prop1 = properties[0] as any;
  const prop2 = properties[1] as any;
  await Inquiry.insertMany([
    {
      propertyId: prop1._id,
      tenantId: tenant1._id,
      agentId: agent1User._id,
      inquiryType: 'viewing_request',
      status: 'new',
      senderName: 'Alice Njeri',
      senderPhone: '+254745678901',
      senderEmail: 'alice.njeri@gmail.com',
      message: 'I am interested in viewing this property this weekend. Is it still available?',
      requestedDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      requestedTimeSlot: 'morning',
      isRead: false,
    },
    {
      propertyId: prop2._id,
      tenantId: tenant1._id,
      agentId: agent1User._id,
      inquiryType: 'general',
      status: 'responded',
      senderName: 'John Otieno',
      senderPhone: '+254756789012',
      senderEmail: 'john.otieno@gmail.com',
      message: 'Can you please share more details about parking and security?',
      isRead: true,
    },
    {
      propertyId: (properties2[0] as any)._id,
      tenantId: tenant2._id,
      agentId: agent2User._id,
      inquiryType: 'booking_intent',
      status: 'new',
      senderName: 'David Kipchoge',
      senderPhone: '+254767890123',
      senderEmail: 'david.kipchoge@gmail.com',
      message: 'I am ready to move in next month. What is the process for booking?',
      isRead: false,
    },
  ]);
  console.log('  ✅ Created 3 inquiries');

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────────
  console.log('🔔 Creating notifications…');
  await Notification.insertMany([
    {
      userId: agent1User._id,
      tenantId: tenant1._id,
      type: 'inquiry',
      title: 'New Viewing Request',
      body: 'Alice Njeri has requested a viewing for Modern 2-Bedroom in Westlands',
      link: '/dashboard/inquiries',
      isRead: false,
    },
    {
      userId: agent1User._id,
      tenantId: tenant1._id,
      type: 'system',
      title: 'Welcome to Dwelly Homes!',
      body: 'Your account is active and ready to use. Start by adding your properties.',
      link: '/dashboard',
      isRead: true,
    },
    {
      userId: agent2User._id,
      tenantId: tenant2._id,
      type: 'inquiry',
      title: 'New Booking Intent',
      body: 'David Kipchoge wants to book 4-Bedroom Townhouse in Lavington',
      link: '/dashboard/inquiries',
      isRead: false,
    },
    {
      userId: adminUser._id,
      tenantId: null,
      type: 'verification',
      title: 'Verification Pending',
      body: 'Nairobi Realty Ltd has submitted documents for review',
      link: '/admin/verifications',
      isRead: false,
    },
  ]);
  console.log('  ✅ Created 4 notifications');

  // ─── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed complete! Test accounts:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Platform Admin:  admin@dwellyhomes.co.ke       / Admin@1234');
  console.log('Estate Agent 1:  james.mwangi@nairobilrealty.co.ke / Agent@1234');
  console.log('Agent Staff:     agent1@nairobilrealty.co.ke   / Staff@1234');
  console.log('Estate Agent 2:  sarah.ochieng@primehomes.co.ke / Agent@1234');
  console.log('Landlord:        peter.kamau@landlord.co.ke    / Landlord@1234');
  console.log('Searcher:        alice.njeri@gmail.com         / Searcher@1234');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await mongoose.disconnect();
  console.log('✅ Disconnected');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
