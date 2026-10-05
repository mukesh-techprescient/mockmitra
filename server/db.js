import mongoose from 'mongoose';

// Reuse the connection across warm serverless invocations.
let conn = globalThis.__mongoConn;

export async function connectDB() {
  if (conn) return conn;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  conn = globalThis.__mongoConn = await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
  });
  return conn;
}
