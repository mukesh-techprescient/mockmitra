import { Router } from 'express';
import Test from '../models/Test.js';
import Attempt from '../models/Attempt.js';
import { requireAuth, ah } from '../lib/auth.js';
import { scoreAttempt } from '../lib/scoring.js';

const r = Router();
r.use(requireAuth);

const GRACE_MS = 30_000; // allow for network lag on auto-submit

// Test metadata only; sent while paused so questions stay hidden.
const metaView = (test) => ({
  _id: test._id,
  title: test.title,
  durationMinutes: test.durationMinutes,
  sections: test.sections,
  questionCount: test.questions.length,
});

// Questions without answers/explanations, for taking the exam.
const examView = (test) => ({
  _id: test._id,
  title: test.title,
  durationMinutes: test.durationMinutes,
  marking: test.marking,
  sections: test.sections,
  questions: test.questions.map(({ qid, number, section, text, image, options }) => ({ qid, number, section, text, image, options })),
});

const isExpired = (a) => !a.pausedAt && Date.now() > a.deadline.getTime() + GRACE_MS;

// Stop the clock: the remaining time is frozen at deadline - pausedAt.
function resumeClock(attempt) {
  if (!attempt.pausedAt) return;
  const away = Date.now() - attempt.pausedAt.getTime();
  attempt.deadline = new Date(attempt.deadline.getTime() + away);
  attempt.pausedMs = (attempt.pausedMs || 0) + away;
  attempt.pausedAt = null;
}

async function finalize(attempt, test) {
  resumeClock(attempt); // submitting from the paused screen
  attempt.status = 'submitted';
  attempt.submittedAt = new Date(Math.min(Date.now(), attempt.deadline.getTime()));
  const s = scoreAttempt(test, attempt.answers);
  attempt.result = { ...s, timeTakenSec: Math.round((attempt.submittedAt - attempt.startedAt - (attempt.pausedMs || 0)) / 1000) };
  return attempt.save();
}

// Start a test, or resume the in-progress attempt.
r.post('/', ah(async (req, res) => {
  const test = await Test.findOne({ _id: req.body.testId, published: true }).lean();
  if (!test) return res.status(404).json({ error: 'Test not found' });
  const open = { user: req.user.id, test: test._id, status: 'in_progress' };
  const existing = await Attempt.findOne(open);
  if (existing && isExpired(existing)) await finalize(existing, test);
  // Atomic find-or-create, so concurrent starts (double click, two tabs) share one attempt.
  const startedAt = new Date();
  let attempt;
  try {
    attempt = await Attempt.findOneAndUpdate(
      open,
      {
        $setOnInsert: {
          startedAt,
          deadline: new Date(startedAt.getTime() + test.durationMinutes * 60_000),
          answers: test.questions.map((q) => ({ qid: q.qid })),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (e) {
    if (e.code !== 11000) throw e; // lost the race to the unique index: use the winner's attempt
    attempt = await Attempt.findOne(open);
  }
  res.json(examPayload(attempt, test));
}));

const attemptState = (a) => ({
  _id: a._id,
  status: a.status,
  startedAt: a.startedAt,
  deadline: a.deadline,
  paused: !!a.pausedAt,
  lastQid: a.lastQid,
  remainingMs: Math.max(0, a.deadline.getTime() - (a.pausedAt ? a.pausedAt.getTime() : Date.now())),
  answers: a.answers,
});

const examPayload = (attempt, test) => ({
  attempt: attemptState(attempt),
  test: attempt.pausedAt ? metaView(test) : examView(test),
  serverNow: Date.now(),
});

async function loadOpenAttempt(req, res) {
  const attempt = await Attempt.findOne({ _id: req.params.id, user: req.user.id });
  if (!attempt) return void res.status(404).json({ error: 'Attempt not found' });
  if (attempt.status !== 'in_progress') return void res.status(409).json({ error: 'Attempt already submitted' });
  return attempt;
}

// Pause: freeze the clock and hide the questions until resumed (survives logout).
r.post('/:id/pause', ah(async (req, res) => {
  const attempt = await loadOpenAttempt(req, res);
  if (!attempt) return;
  if (isExpired(attempt)) return res.status(409).json({ error: 'Time is up' });
  if (typeof req.body?.qid === 'string') attempt.lastQid = req.body.qid.slice(0, 64);
  if (!attempt.pausedAt) attempt.pausedAt = new Date(Math.min(Date.now(), attempt.deadline.getTime()));
  await attempt.save();
  res.json({ attempt: attemptState(attempt), serverNow: Date.now() });
}));

r.post('/:id/resume', ah(async (req, res) => {
  const attempt = await loadOpenAttempt(req, res);
  if (!attempt) return;
  resumeClock(attempt);
  await attempt.save();
  const test = await Test.findById(attempt.test).lean();
  res.json(examPayload(attempt, test));
}));

// Autosave: patch a batch of answers.
r.patch('/:id/answers', ah(async (req, res) => {
  const attempt = await loadOpenAttempt(req, res);
  if (!attempt) return;
  if (attempt.pausedAt) return res.status(409).json({ error: 'Test is paused' });
  if (isExpired(attempt)) return res.status(409).json({ error: 'Time is up' });
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
