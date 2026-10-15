import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import AnalysisReport from '../models/AnalysisReport.js';
import Attempt from '../models/Attempt.js';
import CoachChat from '../models/CoachChat.js';
import { requireAuth, ah } from '../lib/auth.js';
import { loadSubmitted } from '../lib/performance.js';
import { topicStats } from '../lib/topicStats.js';
import { aiEnabled, answerChat, friendlyError } from '../lib/coachAI.js';
import { dispatchReportJob } from '../lib/aiJobs.js';

const r = Router();
r.use(requireAuth);

const DAY = 24 * 60 * 60 * 1000;
const STALE_MS = 16 * 60 * 1000; // background jobs stop after 15 min
const limits = () => ({
  reports: Number(process.env.AI_DAILY_REPORTS) || 6,
  messages: Number(process.env.AI_DAILY_MESSAGES) || 60,
});
const overallScope = { scope: { $ne: 'attempt' } }; // older reports have no scope field

// A job that never finished (crashed or timed out) is shown as failed so it can be retried.
async function expireStale(userId) {
  await AnalysisReport.updateMany(
    { user: userId, status: 'pending', createdAt: { $lt: new Date(Date.now() - STALE_MS) } },
    { $set: { status: 'failed', error: 'The AI coach took too long. Please try again.' } },
  );
}

async function usage(userId) {
  const since = new Date(Date.now() - DAY);
  const [reports, msgs] = await Promise.all([
    AnalysisReport.countDocuments({ user: userId, source: 'ai', createdAt: { $gte: since } }),
    CoachChat.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$askedAt' },
      { $match: { askedAt: { $gte: since } } },
      { $count: 'n' },
    ]),
  ]);
  const l = limits();
  return { reportsLeft: Math.max(0, l.reports - reports), messagesLeft: Math.max(0, l.messages - (msgs[0]?.n || 0)) };
}

const aiInfo = async (userId) => (aiEnabled() ? { enabled: true, ...(await usage(userId)) } : { enabled: false });

// Statistical weak-topic analysis across all of the student's submitted tests + their coach reports.
r.get('/', ah(async (req, res) => {
  await expireStale(req.user.id);
  const [items, reports, ai] = await Promise.all([
    loadSubmitted(req.user.id),
    AnalysisReport.find({ user: req.user.id, ...overallScope }).sort({ createdAt: -1 }).limit(10).lean(),
    aiInfo(req.user.id),
  ]);
  const { topics, sections } = topicStats(items);
  const totals = items.reduce((t, { attempt: { result: x } }) => ({
    score: t.score + x.score, maxScore: t.maxScore + x.maxScore,
    correct: t.correct + x.correct, incorrect: t.incorrect + x.incorrect, unattempted: t.unattempted + x.unattempted,
  }), { score: 0, maxScore: 0, correct: 0, incorrect: 0, unattempted: 0 });
  res.json({
    overall: { attempts: items.length, ...totals },
    sections,
    topics,
    trend: items.map(({ attempt, test }) => ({
      attemptId: attempt._id, title: test.title, submittedAt: attempt.submittedAt,
      score: attempt.result.score, maxScore: attempt.result.maxScore,
    })),
    reports,
    ai,
  });
}));

// ---------- AI reports ----------

async function startReport(req, res, { scope, attempt }) {
  if (!aiEnabled()) return res.status(503).json({ error: 'The AI coach is not set up on this server.' });
  await expireStale(req.user.id);
  const busy = await AnalysisReport.findOne({ user: req.user.id, status: 'pending', scope, attempt: attempt || null });
  if (busy) return res.json({ report: busy });
  if ((await usage(req.user.id)).reportsLeft <= 0) {
    return res.status(429).json({ error: `You can request ${limits().reports} AI reports a day. Please try again tomorrow.` });
  }
  const report = await AnalysisReport.create({
    user: req.user.id, scope, attempt: attempt || null, source: 'ai', status: 'pending',
    title: scope === 'attempt' ? 'Analysing this paper…' : 'Writing your coach report…', author: 'MockMitra AI coach',
  });
  try {
    await dispatchReportJob(req, report._id);
  } catch (e) {
    report.set({ status: 'failed', error: friendlyError(e) });
    await report.save();
  }
  res.status(202).json({ report });
}

r.post('/coach', ah(async (req, res) => {
  if (!(await Attempt.exists({ user: req.user.id, status: 'submitted' }))) {
    return res.status(400).json({ error: 'Finish a test first, then the coach can analyse it.' });
  }
  return startReport(req, res, { scope: 'overall' });
}));

const ownAttempt = (req) => Attempt.findOne({ _id: req.params.attemptId, user: req.user.id, status: 'submitted' }).select('_id').lean();

r.post('/papers/:attemptId/report', ah(async (req, res) => {
  const attempt = await ownAttempt(req);
  if (!attempt) return res.status(404).json({ error: 'Test result not found' });
  return startReport(req, res, { scope: 'attempt', attempt: attempt._id });
}));

// Latest AI/offline report for one paper, plus AI availability.
r.get('/papers/:attemptId', ah(async (req, res) => {
  const attempt = await ownAttempt(req);
  if (!attempt) return res.status(404).json({ error: 'Test result not found' });
  await expireStale(req.user.id);
  const [report, ai] = await Promise.all([
    AnalysisReport.findOne({ user: req.user.id, scope: 'attempt', attempt: attempt._id }).sort({ createdAt: -1 }).lean(),
    aiInfo(req.user.id),
  ]);
  res.json({ report, ai });
}));

// Poll one report while it is being written.
r.get('/reports/:id', ah(async (req, res) => {
  await expireStale(req.user.id);
  const report = await AnalysisReport.findOne({ _id: req.params.id, user: req.user.id }).lean();
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json({ report });
}));

// ---------- Q&A ----------

const HISTORY = 20; // messages sent back to the model as conversation history
const KEEP = 100; // messages stored per thread

async function chatAttempt(req, attemptId) {
  if (!attemptId) return null;
  if (!mongoose.isValidObjectId(attemptId)) return undefined;
  const a = await Attempt.findOne({ _id: attemptId, user: req.user.id, status: 'submitted' }).select('_id').lean();
  return a ? a._id : undefined;
}

r.get('/chat', ah(async (req, res) => {
  const attempt = await chatAttempt(req, req.query.attempt);
  if (attempt === undefined) return res.status(404).json({ error: 'Test result not found' });
  const [chat, ai] = await Promise.all([CoachChat.findOne({ user: req.user.id, attempt }).lean(), aiInfo(req.user.id)]);
  res.json({ messages: chat?.messages || [], ai });
}));

const askSchema = z.object({ message: z.string().trim().min(1).max(2000), attemptId: z.string().optional().nullable() });

r.post('/chat', ah(async (req, res) => {
  if (!aiEnabled()) return res.status(503).json({ error: 'The AI coach is not set up on this server.' });
  const { message, attemptId } = askSchema.parse(req.body);
  const attempt = await chatAttempt(req, attemptId);
  if (attempt === undefined) return res.status(404).json({ error: 'Test result not found' });
  if (!attempt && !(await Attempt.exists({ user: req.user.id, status: 'submitted' }))) {
    return res.status(400).json({ error: 'Finish a test first, then you can ask the coach about it.' });
  }
  const { messagesLeft } = await usage(req.user.id);
  if (messagesLeft <= 0) return res.status(429).json({ error: `You can ask ${limits().messages} questions a day. Please try again tomorrow.` });

  const chat = await CoachChat.findOne({ user: req.user.id, attempt }).lean();
  const history = (chat?.messages || []).slice(-HISTORY);
  while (history.length && history[0].role !== 'user') history.shift(); // the API needs a user turn first
  let answer;
  try {
    answer = await answerChat({ userId: req.user.id, attemptId: attempt, history, question: message });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: e.message });
    console.error('coach chat failed', e);
    return res.status(502).json({ error: friendlyError(e) });
  }
  const now = new Date();
  const updated = await CoachChat.findOneAndUpdate(
    { user: req.user.id, attempt },
    { $push: {
      messages: { $each: [{ role: 'user', content: message, at: now }, { role: 'assistant', content: answer, at: new Date() }], $slice: -KEEP },
      askedAt: { $each: [now], $slice: -500 },
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  res.json({ messages: updated.messages, ai: await aiInfo(req.user.id) });
}));

// Start a new conversation.
r.delete('/chat', ah(async (req, res) => {
  const attempt = await chatAttempt(req, req.query.attempt);
  if (attempt === undefined) return res.status(404).json({ error: 'Test result not found' });
  await CoachChat.updateOne({ user: req.user.id, attempt }, { $set: { messages: [] } });
  res.json({ ok: true });
}));

export default r;
