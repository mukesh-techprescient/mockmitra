// Create or promote the admin account: npm run seed:admin
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../server/db.js';
import User from '../server/models/User.js';

const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env');
  process.exit(1);
}
await connectDB();
const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
await User.findOneAndUpdate(
  { email: ADMIN_EMAIL.toLowerCase() },
  { $set: { role: 'admin', passwordHash }, $setOnInsert: { name: 'Admin' } },
  { upsert: true }
);
console.log(`Admin ready: ${ADMIN_EMAIL}`);
await mongoose.disconnect();
