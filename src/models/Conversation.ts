import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IConversation extends Document {
  _id: Types.ObjectId;
  participants: Types.ObjectId[];   // exactly 2 user IDs
  propertyId: Types.ObjectId | null;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    participants:   { type: [Schema.Types.ObjectId], ref: 'User', required: true },
    propertyId:     { type: Schema.Types.ObjectId, ref: 'Property', default: null },
    lastMessage:    { type: String, default: null },
    lastMessageAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);
