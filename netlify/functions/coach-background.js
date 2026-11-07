import { connectDB } from '../../server/db.js';
import { runReportJob } from '../../server/lib/coachAI.js';
import { verifyJob } from '../../server/lib/aiJobs.js';

// Background function (the "-background" suffix gives it a 15-minute limit; the caller gets 202 at
// once). Generates one pending AI coach report; started by server/lib/aiJobs.js.
export const handler = async (event) => {
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { /* ignore */ }
  if (!body.id || !verifyJob(body.id, body.sig)) {
    console.warn('coach-background: rejected job', body.id);
    return { statusCode: 403 };
  }
  await connectDB();
  await runReportJob(body.id);
  return { statusCode: 200 };
};
