import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { config } from '../config';

interface AuthSocket extends Socket {
  userId?: string;
  tenantId?: string | null;
}

export const initSocket = (httpServer: HttpServer): SocketIOServer => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  // ─── AUTH MIDDLEWARE ───────────────────────────────────────────────────────
  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      socket.userId = payload.userId;
      socket.tenantId = payload.tenantId;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ─── CONNECTION ────────────────────────────────────────────────────────────
  io.on('connection', (socket: AuthSocket) => {
    const userId = socket.userId!;
    console.log(`🔌 Socket connected: ${userId} (${socket.id})`);

    // Each user joins their own personal room so we can push events to them by userId
    socket.join(`user:${userId}`);

    // ─── JOIN CONVERSATION ROOM ──────────────────────────────────────────────
    socket.on('conversation:join', async (conversationId: string) => {
      try {
        const conv = await Conversation.findOne({ _id: conversationId, participants: userId });
        if (!conv) return;
        socket.join(`conv:${conversationId}`);
      } catch (err) {
        console.error('conversation:join error', err);
      }
    });

    // ─── LEAVE CONVERSATION ROOM ─────────────────────────────────────────────
    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(`conv:${conversationId}`);
    });

    // ─── SEND MESSAGE ────────────────────────────────────────────────────────
    socket.on('message:send', async (data: { conversationId: string; body: string }) => {
      try {
        const { conversationId, body } = data;
        if (!body?.trim()) return;

        const conv = await Conversation.findOne({ _id: conversationId, participants: userId });
        if (!conv) return;

        const message = await Message.create({
          conversationId,
          senderId: userId,
          body: body.trim(),
        });

        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: body.trim().slice(0, 100),
          lastMessageAt: new Date(),
        });

        const populated = await Message.findById(message._id).populate('senderId', 'fullName');

        // Emit to everyone in the conversation room (including sender)
        io.to(`conv:${conversationId}`).emit('message:new', {
          message: populated,
          conversationId,
        });

        // Also notify the OTHER participant's personal room so they get a badge update
        // even if they haven't joined the conversation room yet
        const otherParticipantId = conv.participants
          .find((p) => p.toString() !== userId)
          ?.toString();

        if (otherParticipantId) {
          io.to(`user:${otherParticipantId}`).emit('conversation:updated', {
            conversationId,
            lastMessage: body.trim().slice(0, 100),
            lastMessageAt: new Date(),
          });
        }
      } catch (err) {
        console.error('message:send error', err);
      }
    });

    // ─── TYPING INDICATORS ───────────────────────────────────────────────────
    socket.on('typing:start', (conversationId: string) => {
      socket.to(`conv:${conversationId}`).emit('typing:start', { userId, conversationId });
    });

    socket.on('typing:stop', (conversationId: string) => {
      socket.to(`conv:${conversationId}`).emit('typing:stop', { userId, conversationId });
    });

    // ─── MARK READ ───────────────────────────────────────────────────────────
    socket.on('messages:read', async (conversationId: string) => {
      try {
        await Message.updateMany(
          { conversationId, senderId: { $ne: userId }, isRead: false },
          { isRead: true }
        );
        // Let the other side know their messages were read
        const conv = await Conversation.findById(conversationId);
        const otherParticipantId = conv?.participants
          .find((p) => p.toString() !== userId)
          ?.toString();
        if (otherParticipantId) {
          io.to(`user:${otherParticipantId}`).emit('messages:read', { conversationId, byUserId: userId });
        }
      } catch (err) {
        console.error('messages:read error', err);
      }
    });

    // ─── DISCONNECT ──────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${userId} — ${reason}`);
    });
  });

  return io;
};
