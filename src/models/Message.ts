import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IMessage extends Document {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  body: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body:           { type: String, required: true, trim: true, maxlength: 4000 },
    isRead:         { type: Boolean, default: false },
  },
  { timestamps: true }
);

MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
