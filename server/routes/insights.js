import { Router } from 'express';
import AnalysisReport from '../models/AnalysisReport.js';
import { requireAuth, ah } from '../lib/auth.js';
import { loadSubmitted } from '../lib/performance.js';
import { topicStats } from '../lib/topicStats.js';

const r = Router();

// Statistical weak-topic analysis across all of the student's submitted tests + their coach reports.
r.get('/', requireAuth, ah(async (req, res) => {
  const [items, reports] = await Promise.all([
    loadSubmitted(req.user.id),
    AnalysisReport.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(10).lean(),
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
  });
}));

export default r;
