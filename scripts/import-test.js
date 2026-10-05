// Import a test JSON straight into MongoDB (bypasses the 6MB upload limit):
//   npm run import -- samples/mht-cet-2025.json [--publish]
import 'dotenv/config';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { connectDB } from '../server/db.js';
import { importTest, ImportError } from '../server/lib/importTest.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: npm run import -- <file.json> [--publish]');
  process.exit(1);
}
await connectDB();
try {
  const test = await importTest(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (process.argv.includes('--publish')) {
    test.published = true;
    await test.save();
  }
  console.log(`Imported "${test.title}" (${test.questionCount} questions) id=${test._id}${test.published ? ' [published]' : ''}`);
} catch (e) {
  if (e instanceof ImportError) console.error(e.message, '\n ', (e.details || []).join('\n  '));
  else throw e;
  process.exitCode = 1;
}
await mongoose.disconnect();
