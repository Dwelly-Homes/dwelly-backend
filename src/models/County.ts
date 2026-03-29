import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICounty extends Document {
  _id: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const CountySchema = new Schema<ICounty>(
  {
    name: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

export const County = mongoose.model<ICounty>('County', CountySchema);
