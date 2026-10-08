// Export a student's performance for offline analysis:
//   npm run analysis:export -- student@example.com [--out analysis/in/<email>.json]
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../server/db.js';
import User from '../server/models/User.js';
import { exportPerformance } from '../server/lib/exportPerformance.js';

const email = process.argv[2];
if (!email) { console.error('usage: npm run analysis:export -- <student email> [--out file.json]'); process.exit(1); }
const outArg = process.argv.indexOf('--out');
await connectDB();
const user = await User.findOne({ email: email.toLowerCase() });
if (!user) { console.error(`No user ${email}`); process.exitCode = 1; }
else {
  const data = await exportPerformance(user);
  const out = outArg > 0 ? process.argv[outArg + 1] : path.join('analysis', 'in', `${email.replace(/[^\w.-]/g, '_')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 2));
  const weak = data.statistical.topics.filter((t) => t.verdict === 'weak').map((t) => `${t.subject}: ${t.topic}`);
  console.log(`Wrote ${out} — ${data.attempts.length} attempts, ${data.statistical.topics.length} topics; statistically weak: ${weak.join('; ') || 'none'}`);
}
await mongoose.disconnect();
