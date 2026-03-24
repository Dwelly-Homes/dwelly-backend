import mongoose from 'mongoose';
import { config } from './index';

export const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(config.db.uri, {
      autoIndex: true,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected. Reconnecting...');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});
