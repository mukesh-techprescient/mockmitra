import { Router } from 'express';
import { z } from 'zod';
import Notebook from '../models/Notebook.js';
import Attempt from '../models/Attempt.js';
import Test from '../models/Test.js';
import { requireAuth, ah } from '../lib/auth.js';

const r = Router();
r.use(requireAuth);

const MAX_ITEMS = 1000;
const meta = z.object({ name: z.string().trim().min(1).max(80), description: z.string().max(500).optional() });

const summary = (nb) => ({
  _id: nb._id, name: nb.name, description: nb.description, createdAt: nb.createdAt, updatedAt: nb.updatedAt,
  count: nb.items.length, mastered: nb.items.filter((i) => i.mastered).length,
});

async function own(req, res) {
  const nb = await Notebook.findOne({ _id: req.params.id, user: req.user.id });
  if (!nb) res.status(404).json({ error: 'Notebook not found' });
  return nb;
}

// Answers are only visible after submitting, so questions can only be saved from submitted attempts.
async function submittedAttempt(userId, testId, attemptId) {
  const q = { user: userId, test: testId, status: 'submitted' };
  if (attemptId) q._id = attemptId;
  return Attempt.findOne(q).sort({ submittedAt: -1 }).lean();
}

r.get('/', ah(async (req, res) => {
  const nbs = await Notebook.find({ user: req.user.id }).sort({ updatedAt: -1 }).lean();
  res.json({ notebooks: nbs.map(summary) });
}));

r.post('/', ah(async (req, res) => {
  const b = meta.parse(req.body);
  if ((await Notebook.countDocuments({ user: req.user.id })) >= 50) return res.status(400).json({ error: 'You can have at most 50 notebooks' });
  const nb = await Notebook.create({ ...b, user: req.user.id });
  res.status(201).json({ notebook: summary(nb) });
}));

// Which of my notebooks contain each question of a test (for the review page buttons).
r.get('/membership', ah(async (req, res) => {
  const testId = String(req.query.testId || '');
  const nbs = await Notebook.find({ user: req.user.id, 'items.test': testId }).select('name items.test items.qid').lean();
  const map = {};
  for (const nb of nbs) for (const it of nb.items) if (String(it.test) === testId) (map[it.qid] ||= []).push(String(nb._id));
  res.json({ membership: map });
}));

r.patch('/:id', ah(async (req, res) => {
  const nb = await own(req, res); if (!nb) return;
  nb.set(meta.partial().parse(req.body));
  await nb.save();
  res.json({ notebook: summary(nb) });
}));

r.delete('/:id', ah(async (req, res) => {
  await Notebook.deleteOne({ _id: req.params.id, user: req.user.id });
  res.json({ ok: true });
}));

// Notebook with each item hydrated with its question, answer and explanation.
r.get('/:id', ah(async (req, res) => {
  const nb = await own(req, res); if (!nb) return;
  const testIds = [...new Set(nb.items.map((i) => String(i.test)))];
  const tests = await Test.find({ _id: { $in: testIds } }).select('title sections questions').lean();
  const byTest = new Map(tests.map((t) => [String(t._id), t]));
  const items = nb.items.map((it) => {
    const t = byTest.get(String(it.test));
    const q = t?.questions.find((x) => x.qid === it.qid);
    if (!q) return { ...it.toObject(), missing: true };
    return {
      ...it.toObject(),
      testTitle: t.title,
      sectionName: t.sections.find((s) => s.id === q.section)?.name,
      question: { qid: q.qid, number: q.number, topic: q.topic, difficulty: q.difficulty, text: q.text, image: q.image, options: q.options, answer: q.answer, explanation: q.explanation, explanationImage: q.explanationImage },
    };
  });
  res.json({ notebook: { ...summary(nb), items } });
}));

const addBody = z.object({ testId: z.string(), qid: z.string(), attemptId: z.string().optional(), note: z.string().max(2000).optional() });

r.post('/:id/items', ah(async (req, res) => {
  const nb = await own(req, res); if (!nb) return;
  const b = addBody.parse(req.body);
  const attempt = await submittedAttempt(req.user.id, b.testId, b.attemptId);
  if (!attempt) return res.status(403).json({ error: 'Submit this test before saving its questions' });
  if (!attempt.answers.some((a) => a.qid === b.qid)) return res.status(404).json({ error: 'Question not found in this test' });
  if (nb.items.some((i) => String(i.test) === b.testId && i.qid === b.qid)) return res.json({ added: 0, notebook: summary(nb) });
  if (nb.items.length >= MAX_ITEMS) return res.status(400).json({ error: `A notebook can hold at most ${MAX_ITEMS} questions` });
  nb.items.push({ test: b.testId, qid: b.qid, attempt: attempt._id, yourAnswer: attempt.answers.find((a) => a.qid === b.qid)?.selected || null, note: b.note || '' });
  await nb.save();
  res.status(201).json({ added: 1, notebook: summary(nb) });
}));

// Bulk-add from one attempt: wrong answers, skipped questions, or both.
r.post('/:id/items/bulk', ah(async (req, res) => {
  const nb = await own(req, res); if (!nb) return;
  const b = z.object({ attemptId: z.string(), include: z.array(z.enum(['incorrect', 'unattempted', 'flagged'])).min(1) }).parse(req.body);
  const attempt = await Attempt.findOne({ _id: b.attemptId, user: req.user.id, status: 'submitted' }).lean();
  if (!attempt) return res.status(403).json({ error: 'Submit this test before saving its questions' });
  const test = await Test.findById(attempt.test).select('questions.qid questions.answer').lean();
  const answerOf = new Map(test.questions.map((q) => [q.qid, q.answer]));
  const have = new Set(nb.items.filter((i) => String(i.test) === String(attempt.test)).map((i) => i.qid));
  let added = 0;
  for (const a of attempt.answers) {
    const st = !a.selected ? 'unattempted' : a.selected === answerOf.get(a.qid) ? 'correct' : 'incorrect';
    const want = b.include.includes(st) || (b.include.includes('flagged') && a.flagged);
    if (!want || have.has(a.qid) || !answerOf.has(a.qid)) continue;
    if (nb.items.length >= MAX_ITEMS) break;
    nb.items.push({ test: attempt.test, qid: a.qid, attempt: attempt._id, yourAnswer: a.selected || null });
    have.add(a.qid);
    added++;
  }
  await nb.save();
  res.json({ added, notebook: summary(nb) });
}));

r.patch('/:id/items/:itemId', ah(async (req, res) => {
  const nb = await own(req, res); if (!nb) return;
  const it = nb.items.id(req.params.itemId);
  if (!it) return res.status(404).json({ error: 'Item not found' });
  const b = z.object({ note: z.string().max(2000).optional(), mastered: z.boolean().optional(), review: z.enum(['correct', 'incorrect']).optional() }).parse(req.body);
  if (b.note !== undefined) it.note = b.note;
  if (b.mastered !== undefined) it.mastered = b.mastered;
  if (b.review) { it.reviews += 1; it.lastResult = b.review; it.lastReviewedAt = new Date(); }
  await nb.save();
  res.json({ item: it });
}));

r.delete('/:id/items/:itemId', ah(async (req, res) => {
  const nb = await own(req, res); if (!nb) return;
  nb.items.pull(req.params.itemId);
  await nb.save();
  res.json({ notebook: summary(nb) });
}));

export default r;
