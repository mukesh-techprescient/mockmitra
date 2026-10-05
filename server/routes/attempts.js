import { Router } from 'express';
import Test from '../models/Test.js';
import Attempt from '../models/Attempt.js';
import { requireAuth, ah } from '../lib/auth.js';
import { scoreAttempt } from '../lib/scoring.js';

const r = Router();
r.use(requireAuth);

const GRACE_MS = 30_000; // allow for network lag on auto-submit

// Questions without answers/explanations, for taking the exam.
const examView = (test) => ({
  _id: test._id,
  title: test.title,
  durationMinutes: test.durationMinutes,
  marking: test.marking,
  sections: test.sections,
  questions: test.questions.map(({ qid, number, section, text, image, options }) => ({ qid, number, section, text, image, options })),
});

async function finalize(attempt, test) {
  attempt.status = 'submitted';
  attempt.submittedAt = new Date(Math.min(Date.now(), attempt.deadline.getTime()));
  const s = scoreAttempt(test, attempt.answers);
  attempt.result = { ...s, timeTakenSec: Math.round((attempt.submittedAt - attempt.startedAt) / 1000) };
  return attempt.save();
}

// Start a test, or resume the in-progress attempt.
r.post('/', ah(async (req, res) => {
  const test = await Test.findOne({ _id: req.body.testId, published: true }).lean();
  if (!test) return res.status(404).json({ error: 'Test not found' });
  let attempt = await Attempt.findOne({ user: req.user.id, test: test._id, status: 'in_progress' });
  if (attempt && Date.now() > attempt.deadline.getTime() + GRACE_MS) {
    await finalize(attempt, test);
    attempt = null;
  }
  if (!attempt) {
    const startedAt = new Date();
    attempt = await Attempt.create({
      user: req.user.id,
      test: test._id,
      startedAt,
      deadline: new Date(startedAt.getTime() + test.durationMinutes * 60_000),
      answers: test.questions.map((q) => ({ qid: q.qid })),
    });
  }
  res.json({ attempt: attemptState(attempt), test: examView(test), serverNow: Date.now() });
}));

const attemptState = (a) => ({ _id: a._id, status: a.status, startedAt: a.startedAt, deadline: a.deadline, answers: a.answers });

// Autosave: patch a batch of answers.
r.patch('/:id/answers', ah(async (req, res) => {
  const attempt = await Attempt.findOne({ _id: req.params.id, user: req.user.id });
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (attempt.status !== 'in_progress') return res.status(409).json({ error: 'Attempt already submitted' });
  if (Date.now() > attempt.deadline.getTime() + GRACE_MS) return res.status(409).json({ error: 'Time is up' });
  const byQid = new Map(attempt.answers.map((a) => [a.qid, a]));
  for (const u of req.body.answers || []) {
    const a = byQid.get(u.qid);
    if (!a) continue;
    if ('selected' in u) a.selected = u.selected || null;
    if ('flagged' in u) a.flagged = !!u.flagged;
    if (Number.isFinite(u.timeSpentSec)) a.timeSpentSec = Math.max(0, Math.round(u.timeSpentSec));
  }
  await attempt.save();
  res.json({ ok: true });
}));

r.post('/:id/submit', ah(async (req, res) => {
  const attempt = await Attempt.findOne({ _id: req.params.id, user: req.user.id });
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (attempt.status === 'in_progress') {
    const test = await Test.findById(attempt.test).lean();
    await finalize(attempt, test);
  }
  res.json({ attemptId: attempt._id });
}));

// History list.
r.get('/', ah(async (req, res) => {
  const attempts = await Attempt.find({ user: req.user.id, status: 'submitted' })
    .select('-answers')
    .sort({ submittedAt: -1 })
    .populate({ path: 'test', select: 'title year category questionCount', populate: { path: 'category', select: 'name' } })
    .lean();
  res.json({ attempts });
}));

// Full review: questions + correct answers + explanations + user's answers. Only after submit.
r.get('/:id', ah(async (req, res) => {
  const attempt = await Attempt.findOne({ _id: req.params.id, user: req.user.id }).lean();
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (attempt.status !== 'submitted') return res.status(409).json({ error: 'Submit the test to see the review' });
  const test = await Test.findById(attempt.test).populate('category', 'name').lean();
  res.json({ attempt, test });
}));

export default r;
