import { loadSubmitted } from './performance.js';
import { topicStats } from './topicStats.js';

const plain = (s = '', n = 220) => s.replace(/\s+/g, ' ').trim().slice(0, n);

// Everything an offline analyst needs about one student, in one JSON document.
export async function exportPerformance(user) {
  const items = await loadSubmitted(user._id);
  const stats = topicStats(items);
  return {
    schemaVersion: 1,
    kind: 'performance-export',
    generatedAt: new Date().toISOString(),
    user: { name: user.name, email: user.email },
    statistical: stats,
    attempts: items.map(({ attempt, test }) => {
      const byQid = new Map(attempt.answers.map((a) => [a.qid, a]));
      const sec = Object.fromEntries(test.sections.map((s) => [s.id, s.name]));
      return {
        attemptId: attempt._id,
        test: test.title,
        category: test.category?.name,
        submittedAt: attempt.submittedAt,
        durationMinutes: test.durationMinutes,
        timeTakenSec: attempt.result.timeTakenSec,
        marking: test.marking,
        result: { score: attempt.result.score, maxScore: attempt.result.maxScore, correct: attempt.result.correct, incorrect: attempt.result.incorrect, unattempted: attempt.result.unattempted, sections: attempt.result.sections },
        questions: test.questions.map((q, i) => {
          const a = byQid.get(q.qid) || {};
          return {
            n: i + 1,
            subject: sec[q.section],
            topic: q.topic || 'Untagged',
            difficulty: q.difficulty,
            status: !a.selected ? 'unattempted' : a.selected === q.answer ? 'correct' : 'incorrect',
            selected: a.selected || null,
            answer: q.answer,
            timeSpentSec: a.timeSpentSec || 0,
            flagged: !!a.flagged,
            text: plain(q.text),
          };
        }),
      };
    }),
  };
}
