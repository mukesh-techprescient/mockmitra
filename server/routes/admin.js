import { Router } from 'express';
import { z } from 'zod';
import Category from '../models/Category.js';
import Test from '../models/Test.js';
import Attempt from '../models/Attempt.js';
import Asset from '../models/Asset.js';
import User from '../models/User.js';
import AnalysisReport from '../models/AnalysisReport.js';
import { exportPerformance } from '../lib/exportPerformance.js';
import { saveReport } from '../lib/saveReport.js';
import { requireAdmin, ah } from '../lib/auth.js';
import { importTest, validateTestFile, ImportError } from '../lib/importTest.js';

const r = Router();
r.use(requireAdmin);

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- categories
r.get('/categories', ah(async (_req, res) => {
  const cats = await Category.find().sort({ order: 1, name: 1 }).lean();
  const counts = await Test.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }]);
  const n = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({ categories: cats.map((c) => ({ ...c, testCount: n.get(String(c._id)) || 0 })) });
}));

const catBody = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  description: z.string().optional(),
  order: z.number().optional(),
});

r.post('/categories', ah(async (req, res) => {
  const b = catBody.parse(req.body);
  const slug = slugify(b.slug || b.name);
  if (await Category.exists({ slug })) return res.status(409).json({ error: `Slug "${slug}" already exists` });
  res.status(201).json({ category: await Category.create({ ...b, slug }) });
}));

r.put('/categories/:id', ah(async (req, res) => {
  const b = catBody.partial().parse(req.body);
  if (b.slug) b.slug = slugify(b.slug);
  const c = await Category.findByIdAndUpdate(req.params.id, b, { new: true });
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json({ category: c });
}));

r.delete('/categories/:id', ah(async (req, res) => {
  if (await Test.exists({ category: req.params.id }))
    return res.status(409).json({ error: 'Move or delete the tests in this category first' });
  await Category.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

// ---- tests
r.get('/tests', ah(async (_req, res) => {
  const tests = await Test.find().select('-questions').populate('category', 'name slug').sort({ createdAt: -1 }).lean();
  const counts = await Attempt.aggregate([{ $match: { status: 'submitted' } }, { $group: { _id: '$test', n: { $sum: 1 } } }]);
  const n = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({ tests: tests.map((t) => ({ ...t, attemptCount: n.get(String(t._id)) || 0 })) });
}));

r.get('/tests/:id', ah(async (req, res) => {
  const test = await Test.findById(req.params.id).populate('category', 'name slug').lean();
  if (!test) return res.status(404).json({ error: 'Not found' });
  res.json({ test });
}));

// Dry run: validate JSON and return a summary without saving.
r.post('/tests/validate', ah(async (req, res) => {
  const d = validateTestFile(req.body);
  const perSection = Object.fromEntries(d.sections.map((s) => [s.name, d.questions.filter((q) => q.section === s.id).length]));
  res.json({
    ok: true,
    summary: {
      title: d.title, category: d.category, year: d.year, durationMinutes: d.durationMinutes,
      questions: d.questions.length, perSection,
      withImages: d.questions.filter((q) => q.image).length,
      missingExplanations: d.questions.filter((q) => !q.explanation).length,
      categoryExists: !!(await Category.exists({ slug: d.category })),
    },
  });
}));

r.post('/tests', ah(async (req, res) => {
  const test = await importTest(req.body, { userId: req.user.id });
  res.status(201).json({ test: { _id: test._id, title: test.title, questionCount: test.questionCount } });
}));

// Replace questions/metadata of an existing test from a new JSON (keeps id, attempts).
r.put('/tests/:id/content', ah(async (req, res) => {
  const test = await importTest(req.body, { userId: req.user.id, replaceTestId: req.params.id });
  res.json({ test: { _id: test._id, title: test.title, questionCount: test.questionCount } });
}));

r.patch('/tests/:id', ah(async (req, res) => {
  const b = z.object({
    published: z.boolean().optional(),
    title: z.string().min(1).optional(),
    category: z.string().optional(),
    durationMinutes: z.number().positive().optional(),
    description: z.string().optional(),
  }).parse(req.body);
  const t = await Test.findByIdAndUpdate(req.params.id, b, { new: true }).select('-questions');
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({ test: t });
}));

r.delete('/tests/:id', ah(async (req, res) => {
  await Promise.all([
    Test.findByIdAndDelete(req.params.id),
    Asset.deleteMany({ test: req.params.id }),
    Attempt.deleteMany({ test: req.params.id }),
  ]);
  res.json({ ok: true });
}));

// ---- students & offline analysis
r.get('/students', ah(async (_req, res) => {
  const [users, attempts, reports] = await Promise.all([
    User.find({ role: 'student' }).select('name email createdAt').sort({ createdAt: -1 }).lean(),
    Attempt.aggregate([{ $match: { status: 'submitted' } }, { $group: { _id: '$user', n: { $sum: 1 }, last: { $max: '$submittedAt' } } }]),
    AnalysisReport.aggregate([{ $group: { _id: '$user', n: { $sum: 1 }, last: { $max: '$createdAt' } } }]),
  ]);
  const a = new Map(attempts.map((x) => [String(x._id), x]));
  const rp = new Map(reports.map((x) => [String(x._id), x]));
  res.json({ students: users.map((u) => ({
    ...u,
    attempts: a.get(String(u._id))?.n || 0, lastAttempt: a.get(String(u._id))?.last || null,
    reports: rp.get(String(u._id))?.n || 0, lastReport: rp.get(String(u._id))?.last || null,
  })) });
}));

// Full performance export for offline analysis (same as `npm run analysis:export`).
r.get('/students/:id/export', ah(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.set('Content-Disposition', `attachment; filename="performance-${user.email.replace(/[^\w.-]/g, '_')}.json"`);
  res.json(await exportPerformance(user));
}));

r.get('/students/:id/reports', ah(async (req, res) => {
  res.json({ reports: await AnalysisReport.find({ user: req.params.id }).sort({ createdAt: -1 }).lean() });
}));

r.post('/analysis', ah(async (req, res) => {
  const report = await saveReport(req.body);
  res.status(201).json({ report: { _id: report._id, title: report.title } });
}));

r.delete('/analysis/:id', ah(async (req, res) => {
  await AnalysisReport.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

// ---- overview
r.get('/stats', ah(async (_req, res) => {
  const [users, tests, attempts] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    Test.countDocuments(),
    Attempt.countDocuments({ status: 'submitted' }),
  ]);
  res.json({ users, tests, attempts });
}));

export { ImportError };
export default r;
