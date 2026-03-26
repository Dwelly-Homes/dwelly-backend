import 'dotenv/config';
import http from 'http';
import app from './app';
import { connectDB } from './config/database';
import { config } from './config';
import { initSocket } from './sockets/chat.socket';

const start = async (): Promise<void> => {
  await connectDB();

  // Wrap Express app in a raw HTTP server so Socket.IO can share the same port
  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║           🏠  DWELLY HOMES API                       ║
║──────────────────────────────────────────────────────║
║  Environment : ${config.env.padEnd(36)}║
║  Port        : ${String(config.port).padEnd(36)}║
║  API Prefix  : ${config.apiPrefix.padEnd(36)}║
║  Health      : http://localhost:${config.port}/health${' '.repeat(Math.max(0, 19 - String(config.port).length))}║
║  WebSocket   : ws://localhost:${config.port}/socket.io${' '.repeat(Math.max(0, 16 - String(config.port).length))}║
╚══════════════════════════════════════════════════════╝
    `);
  });

  // ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);
    httpServer.close(() => {
      console.log('✅ HTTP server closed.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    shutdown('uncaughtException');
  });
};

start();
