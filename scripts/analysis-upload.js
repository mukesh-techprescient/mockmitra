// Upload an offline coaching report: npm run analysis:upload -- analysis/out/<file>.json
import 'dotenv/config';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { connectDB } from '../server/db.js';
import { saveReport } from '../server/lib/saveReport.js';
import { ImportError } from '../server/lib/importTest.js';

const file = process.argv[2];
if (!file) { console.error('usage: npm run analysis:upload -- <report.json>'); process.exit(1); }
await connectDB();
try {
  const report = await saveReport(JSON.parse(fs.readFileSync(file, 'utf8')));
  console.log(`Uploaded "${report.title}" (${report._id})`);
} catch (e) {
  if (e instanceof ImportError) { console.error(e.message, '\n ', (e.details || []).join('\n  ')); process.exitCode = 1; }
  else throw e;
}
await mongoose.disconnect();
