import { Router } from 'express';
import Category from '../models/Category.js';
import Test from '../models/Test.js';
import Attempt from '../models/Attempt.js';
import Asset from '../models/Asset.js';
import { requireAuth, ah } from '../lib/auth.js';

const r = Router();

// All published tests grouped by category, with the user's best/last attempt.
r.get('/catalog', requireAuth, ah(async (req, res) => {
  const [categories, tests, attempts] = await Promise.all([
    Category.find().sort({ order: 1, name: 1 }).lean(),
    Test.find({ published: true }).select('-questions').sort({ year: -1, createdAt: -1 }).lean(),
    Attempt.find({ user: req.user.id }).select('test status pausedAt result.score result.maxScore submittedAt').lean(),
  ]);
  const byTest = new Map();
  for (const a of attempts) {
    const k = String(a.test);
    const e = byTest.get(k) || { attempts: 0, best: null, inProgress: null, paused: false };
    if (a.status === 'submitted') {
      e.attempts += 1;
      if (!e.best || a.result.score > e.best.score) e.best = { score: a.result.score, maxScore: a.result.maxScore };
    } else {
      e.inProgress = a._id;
      e.paused = !!a.pausedAt;
    }
    byTest.set(k, e);
  }
  res.json({
    categories: categories
      .map((c) => ({
        ...c,
        tests: tests
          .filter((t) => String(t.category) === String(c._id))
          .map((t) => ({ ...t, mine: byTest.get(String(t._id)) || { attempts: 0, best: null, inProgress: null, paused: false } })),
      }))
      .filter((c) => c.tests.length),
  });
}));

// Test metadata for the instructions screen (no questions).
r.get('/tests/:id', requireAuth, ah(async (req, res) => {
  const test = await Test.findOne({ _id: req.params.id, published: true }).select('-questions').populate('category', 'name slug').lean();
  if (!test) return res.status(404).json({ error: 'Test not found' });
  res.json({ test });
}));

r.get('/assets/:id', ah(async (req, res) => {
  const a = await Asset.findById(req.params.id).lean();
  if (!a) return res.status(404).end();
  res.set('Content-Type', a.contentType).set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(a.data.buffer ?? a.data));
}));

export default r;
