import 'dotenv/config';
import app from './app';
import { connectDB } from './config/database';
import { config } from './config';

const start = async (): Promise<void> => {
  await connectDB();

  const server = app.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║           🏠  DWELLY HOMES API                       ║
║──────────────────────────────────────────────────────║
║  Environment : ${config.env.padEnd(36)}║
║  Port        : ${String(config.port).padEnd(36)}║
║  API Prefix  : ${config.apiPrefix.padEnd(36)}║
║  Health      : http://localhost:${config.port}/health${' '.repeat(Math.max(0, 19 - String(config.port).length))}║
╚══════════════════════════════════════════════════════╝
    `);
  });

  // ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('✅ HTTP server closed.');
      process.exit(0);
    });

    // Force exit after 10s if graceful shutdown stalls
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
