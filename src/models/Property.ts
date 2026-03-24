import mongoose, { Document, Schema, Types } from 'mongoose';
import { PropertyStatus, PropertyType } from '../types';

export interface IPropertyImage {
  url: string;
  publicId: string;
  isCover: boolean;
  order: number;
}

export interface IProperty extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  agentId: Types.ObjectId;       // The specific agent staff member
  title: string;
  description: string;
  propertyType: PropertyType;
  monthlyRent: number;
  serviceCharge: number;
  status: PropertyStatus;
  isHiddenByAdmin: boolean;

  // Location
  county: string;
  constituency: string;
  neighborhood: string;
  streetEstate: string;
  coordinates: { lat: number; lng: number } | null;

  // Amenities
  amenities: string[];

  // Media
  images: IPropertyImage[];

  // Availability
  availableFrom: Date | null;
  expiresAt: Date;

  // Stats
  viewCount: number;
  inquiryCount: number;

  createdAt: Date;
  updatedAt: Date;
}

const PropertyImageSchema = new Schema<IPropertyImage>({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  isCover: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
}, { _id: false });

const PropertySchema = new Schema<IProperty>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, maxlength: 2000 },
    propertyType: { type: String, enum: Object.values(PropertyType), required: true },
    monthlyRent: { type: Number, required: true, min: 0 },
    serviceCharge: { type: Number, default: 0, min: 0 },
    status: {
      type: String, enum: Object.values(PropertyStatus),
      default: PropertyStatus.DRAFT,
    },
    isHiddenByAdmin: { type: Boolean, default: false },

    county: { type: String, required: true, trim: true },
    constituency: { type: String, default: '', trim: true },
    neighborhood: { type: String, required: true, trim: true },
    streetEstate: { type: String, default: '', trim: true },
    coordinates: {
      type: { lat: Number, lng: Number },
      default: null,
    },

    amenities: { type: [String], default: [] },
    images: { type: [PropertyImageSchema], default: [] },

    availableFrom: { type: Date, default: null },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    },

    viewCount: { type: Number, default: 0 },
    inquiryCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes for marketplace search performance
PropertySchema.index({ tenantId: 1 });
PropertySchema.index({ agentId: 1 });
PropertySchema.index({ county: 1 });
PropertySchema.index({ status: 1 });
PropertySchema.index({ monthlyRent: 1 });
PropertySchema.index({ propertyType: 1 });
PropertySchema.index({ expiresAt: 1 });
PropertySchema.index({ isHiddenByAdmin: 1 });
// Text search index
PropertySchema.index({ title: 'text', description: 'text', neighborhood: 'text', county: 'text' });

export const Property = mongoose.model<IProperty>('Property', PropertySchema);
