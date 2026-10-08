// Statistical weak-topic analysis from submitted attempts. Pure functions, no DB access.
//
// Topic mastery is shrunk toward the student's own subject average:
//   mastery = (correct + K × subjectRate) / (seen + K)
// so with only a handful of questions a topic stays close to how the student does in that subject
// overall, and is flagged only when it is clearly worse. A section the student skipped ENTIRELY in an
// attempt (no question answered — e.g. they only practised Chemistry) is treated as not taken and
// left out, rather than counted as all-wrong. Subjects use Laplace smoothing
// (correct + 1) / (seen + 2). Unattempted questions count as "not correct" (skipping a topic is itself
// a signal); accuracy on attempted questions is reported separately.

export const MIN_SAMPLE = 3;
export const PRIOR_WEIGHT = 4; // K: how many "virtual questions" of subject-average performance

export function verdict(t) {
  if (t.seen < MIN_SAMPLE) return 'insufficient';
  if (t.mastery < 0.45) return 'weak';
  if (t.mastery < 0.7) return 'developing';
  return 'strong';
}

const blank = (key, extra) => ({ key, ...extra, seen: 0, correct: 0, incorrect: 0, unattempted: 0, timeSec: 0, timed: 0 });

function finish(t, prior) {
  const attempted = t.correct + t.incorrect;
  const out = {
    ...t,
    attempted,
    accuracy: attempted ? t.correct / attempted : null, // of the ones answered
    coverage: t.seen ? attempted / t.seen : 0, // how many were attempted
    mastery: prior == null ? (t.correct + 1) / (t.seen + 2) : (t.correct + PRIOR_WEIGHT * prior) / (t.seen + PRIOR_WEIGHT),
    avgTimeSec: t.timed ? Math.round(t.timeSec / t.timed) : null,
  };
  delete out.timed;
  delete out.timeSec;
  out.verdict = verdict(out);
  return out;
}

const statusOf = (q, a) => (!a?.selected ? 'unattempted' : a.selected === q.answer ? 'correct' : 'incorrect');

/**
 * @param items [{ attempt, test }] — submitted attempts with their (lean) tests
 * @returns { topics, sections } — topics sorted weakest first
 */
export function topicStats(items) {
  const topics = new Map();
  const sections = new Map();
  for (const { attempt, test } of items) {
    const byQid = new Map(attempt.answers.map((a) => [a.qid, a]));
    const secName = Object.fromEntries(test.sections.map((s) => [s.id, s.name]));
    const touched = new Set(test.questions.filter((q) => byQid.get(q.qid)?.selected).map((q) => q.section));
    for (const q of test.questions) {
      if (!touched.has(q.section)) continue; // whole section skipped in this attempt: not taken
      const a = byQid.get(q.qid);
      const st = statusOf(q, a);
      const subject = secName[q.section] || q.section;
      const topic = q.topic || 'Untagged';
      const tk = `${subject}::${topic}`;
      if (!topics.has(tk)) topics.set(tk, blank(tk, { topic, subject }));
      if (!sections.has(subject)) sections.set(subject, blank(subject, { subject }));
      for (const b of [topics.get(tk), sections.get(subject)]) {
        b.seen++;
        b[st]++;
        if (a?.timeSpentSec > 0) { b.timeSec += a.timeSpentSec; b.timed++; }
      }
    }
  }
  const order = { weak: 0, developing: 1, strong: 2, insufficient: 3 };
  const subjectStats = [...sections.values()].map((t) => finish(t));
  const subjectRate = new Map(subjectStats.map((s) => [s.subject, s.mastery]));
  return {
    topics: [...topics.values()].map((t) => finish(t, subjectRate.get(t.subject)))
      .sort((x, y) => order[x.verdict] - order[y.verdict] || x.mastery - y.mastery || y.seen - x.seen),
    sections: subjectStats.sort((x, y) => x.mastery - y.mastery),
  };
}
