import { Response, NextFunction } from 'express';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { AuthRequest } from '../types';
import { sendSuccess, sendError } from '../utils/response';
import { getPagination } from '../utils/helpers';

// ─── GET MY CONVERSATIONS ──────────────────────────────────────────────────────

export const getConversations = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const conversations = await Conversation.find({ participants: userId })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .populate('participants', 'fullName email role')
      .populate('propertyId', 'title images');

    // Attach unread count per conversation
    const withUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unread = await Message.countDocuments({
          conversationId: conv._id,
          senderId: { $ne: userId },
          isRead: false,
        });
        return { ...conv.toObject(), unread };
      })
    );

    sendSuccess(res, 'Conversations fetched.', withUnread);
  } catch (err) { next(err); }
};

// ─── GET OR CREATE CONVERSATION ───────────────────────────────────────────────

export const getOrCreateConversation = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const myId = req.user!.userId;
    const { recipientId, propertyId } = req.body as { recipientId: string; propertyId?: string };

    if (!recipientId) { sendError(res, 'recipientId is required.', 400); return; }
    if (recipientId === myId) { sendError(res, 'Cannot start a conversation with yourself.', 400); return; }

    const recipient = await User.findById(recipientId).select('_id fullName');
    if (!recipient) { sendError(res, 'Recipient not found.', 404); return; }

    // Find existing conversation between these two users (optionally same property)
    const filter: Record<string, unknown> = {
      participants: { $all: [myId, recipientId], $size: 2 },
    };
    if (propertyId) filter.propertyId = propertyId;

    let conversation = await Conversation.findOne(filter)
      .populate('participants', 'fullName email role')
      .populate('propertyId', 'title images');

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [myId, recipientId],
        propertyId: propertyId || null,
      });
      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'fullName email role')
        .populate('propertyId', 'title images') as typeof conversation;
    }

    sendSuccess(res, 'Conversation ready.', conversation, 200);
  } catch (err) { next(err); }
};

// ─── GET MESSAGES FOR A CONVERSATION ─────────────────────────────────────────

export const getMessages = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { page, limit: lim } = req.query as Record<string, string>;
    const { page: p, limit: l, skip } = getPagination(page, lim || '30');

    const conversation = await Conversation.findOne({ _id: id, participants: userId });
    if (!conversation) { sendError(res, 'Conversation not found.', 404); return; }

    const [messages, total] = await Promise.all([
      Message.find({ conversationId: id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .populate('senderId', 'fullName'),
      Message.countDocuments({ conversationId: id }),
    ]);

    // Mark messages from the other participant as read
    await Message.updateMany(
      { conversationId: id, senderId: { $ne: userId }, isRead: false },
      { isRead: true }
    );

    sendSuccess(res, 'Messages fetched.', messages.reverse(), 200, {
      page: p, limit: l, total, totalPages: Math.ceil(total / l),
    });
  } catch (err) { next(err); }
};

// ─── SEND MESSAGE (REST FALLBACK) ─────────────────────────────────────────────

export const sendMessage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { body } = req.body as { body: string };

    if (!body?.trim()) { sendError(res, 'Message body cannot be empty.', 400); return; }

    const conversation = await Conversation.findOne({ _id: id, participants: userId });
    if (!conversation) { sendError(res, 'Conversation not found.', 404); return; }

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: userId,
      body: body.trim(),
    });

    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: body.trim().slice(0, 100),
      lastMessageAt: new Date(),
    });

    const populated = await Message.findById(message._id).populate('senderId', 'fullName');
    sendSuccess(res, 'Message sent.', populated, 201);
  } catch (err) { next(err); }
};
