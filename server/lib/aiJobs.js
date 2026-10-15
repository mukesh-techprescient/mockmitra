import crypto from 'node:crypto';
import { runReportJob } from './coachAI.js';

// AI reports can take longer than a normal function call is allowed (60 s on Netlify), so they run
// in the coach-background function (15 min limit). The API creates a pending report, then calls that
// function with a signed job id; the browser polls until the report is ready. Local dev runs the job
// in-process instead.

const onNetlify = () => !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

export const signJob = (id) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(`coach-job:${id}`).digest('hex');

export function verifyJob(id, sig) {
  const want = Buffer.from(signJob(String(id)));
  const got = Buffer.from(String(sig || ''));
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export async function dispatchReportJob(req, reportId) {
  const id = String(reportId);
  if (!onNetlify()) {
    setImmediate(() => runReportJob(id).catch((e) => console.error('coach job', id, e)));
    return;
  }
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const res = await fetch(`${proto}://${req.headers.host}/.netlify/functions/coach-background`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, sig: signJob(id) }),
  });
  if (res.status !== 202 && !res.ok) throw new Error(`Could not start the AI coach (HTTP ${res.status})`);
}
