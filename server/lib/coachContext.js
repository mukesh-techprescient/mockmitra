// Compact, plain-text views of a student's results for the AI coach (server/lib/coachAI.js).
// Deterministic output (no timestamps of "now"), so the same data gives the same prompt and
// chat turns can reuse the prompt cache.
import { topicStats, MIN_SAMPLE, PRIOR_WEIGHT } from './topicStats.js';

const clip = (s = '', n) => {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '?');
const mins = (sec) => `${Math.round((sec || 0) / 60)} min`;

const statusOf = (q, a) => (!a?.selected ? 'skipped' : a.selected === q.answer ? 'correct' : 'wrong');

function marking(test) {
  const m = test.marking || {};
  return `+${m.correct ?? 1} correct / ${m.incorrect ?? 0} wrong / ${m.unattempted ?? 0} skipped`;
}

function attemptSummary({ attempt, test }, i) {
  const r = attempt.result;
  const secs = (r.sections || []).map((s) => `${s.name} ${s.score}/${s.maxScore} (${s.correct}✓ ${s.incorrect}✗ ${s.unattempted} skipped)`).join('; ');
  return [
    `### Paper ${i + 1}: ${test.title} [attemptId ${attempt._id}]`,
    `Date ${day(attempt.submittedAt)} · ${test.category?.name || ''} · marking ${marking(test)}`,
    `Score ${r.score}/${r.maxScore} (${pct(r.score, r.maxScore)}%) · ${r.correct} correct, ${r.incorrect} wrong, ${r.unattempted} skipped · time used ${mins(r.timeTakenSec)} of ${test.durationMinutes} min`,
    `Sections: ${secs}`,
  ].join('\n');
}

// One line per question. With `detail`, include the question, answer and (for misses) the explanation.
function questionLines({ attempt, test }, { detail }) {
  const byQid = new Map(attempt.answers.map((a) => [a.qid, a]));
  const sec = Object.fromEntries(test.sections.map((s) => [s.id, s.name]));
  return test.questions.map((q, i) => {
    const a = byQid.get(q.qid);
    const st = statusOf(q, a);
    let line = `Q${i + 1} | ${sec[q.section] || q.section} | ${q.topic || 'Untagged'} | ${q.difficulty || '-'} | ${st}` +
      `${a?.selected && st === 'wrong' ? ` (chose ${a.selected}, answer ${q.answer})` : ''} | ${a?.timeSpentSec || 0}s${a?.flagged ? ' | marked' : ''}`;
    if (detail) {
      line += `\n   Question: ${clip(q.text, 260)}`;
      if (st !== 'correct') {
        line += `\n   Options: ${q.options.map((o) => `(${o.key}) ${clip(o.text, 50)}`).join(' ')}`;
        if (q.explanation) line += `\n   Explanation: ${clip(q.explanation, 320)}`;
      }
    }
    return line;
  }).join('\n');
}

function topicTable(topics) {
  const rows = topics.map((t) => `${t.subject} | ${t.topic} | ${t.seen} | ${t.correct} | ${t.incorrect} | ${t.unattempted} | ${Math.round(t.mastery * 100)}% | ${t.verdict} | ${t.avgTimeSec ?? '-'}s`);
  return ['Subject | Topic | Seen | Correct | Wrong | Skipped | Mastery | Verdict | Avg time', ...rows].join('\n');
}

function sectionTable(sections) {
  return sections.map((s) => `${s.subject}: ${s.correct}/${s.seen} correct, ${s.incorrect} wrong, ${s.unattempted} skipped, mastery ${Math.round(s.mastery * 100)}%`).join('\n');
}

export const STATS_NOTE =
  `Mastery = (correct + ${PRIOR_WEIGHT} × subject rate) / (seen + ${PRIOR_WEIGHT}); weak < 45% ≤ developing < 70% ≤ strong; ` +
  `fewer than ${MIN_SAMPLE} questions seen = insufficient data. Skipped questions count as not correct. ` +
  'A section the student skipped entirely in a paper is left out of the stats (treated as not taken).';

export function reportText(r) {
  if (!r) return '';
  const lines = [`Title: ${r.title}`, `Written: ${day(r.createdAt)} (${r.source === 'ai' ? 'AI coach' : 'human coach'})`, `Summary: ${r.summary || ''}`];
  for (const w of r.weakTopics || []) lines.push(`Focus [${w.severity}] ${w.subject ? `${w.subject} · ` : ''}${w.topic}: ${w.evidence} → ${w.advice}`);
  for (const h of r.habits || []) lines.push(`Habit: ${h.title}: ${h.detail}`);
  for (const s of r.strengths || []) lines.push(`Strength: ${s.topic}${s.subject ? ` (${s.subject})` : ''}: ${s.note}`);
  for (const p of r.plan || []) lines.push(`Plan ${p.step}: ${p.task}`);
  return lines.join('\n');
}

// Everything about the student across all papers (for the overall coach report and chat).
export function overallContext(user, items, { previousReport } = {}) {
  const { topics, sections } = topicStats(items);
  const parts = [
    `# Student: ${user.name}`,
    `Papers completed: ${items.length}`,
    '',
    '## Subject totals', sectionTable(sections),
    '',
    `## Topic statistics (weakest first). ${STATS_NOTE}`, topicTable(topics),
    '',
    '## Papers, oldest first',
    ...items.map((it, i) => attemptSummary(it, i)),
    '',
    '## Question-by-question record (per paper: Q | section | topic | difficulty | result | time | marked)',
    ...items.map((it, i) => `### Paper ${i + 1}: ${it.test.title}\n${questionLines(it, { detail: false })}`),
  ];
  if (previousReport) parts.push('', '## Previous coach report (for comparison)', reportText(previousReport));
  return parts.join('\n');
}

// One paper in detail (for the per-paper report and chat), plus a short line on the other papers.
export function attemptContext(user, items, attemptId, { paperReport, overallReport } = {}) {
  const idx = items.findIndex((it) => String(it.attempt._id) === String(attemptId));
  if (idx < 0) return null;
  const it = items[idx];
  const { topics } = topicStats([it]);
  const others = items.filter((_, i) => i !== idx)
    .map(({ attempt, test }) => `${test.title} (${day(attempt.submittedAt)}): ${attempt.result.score}/${attempt.result.maxScore}`);
  const parts = [
    `# Student: ${user.name}`,
    '',
    '## This paper',
    attemptSummary(it, idx),
    '',
    '## Topics in this paper (most marks lost first)', topicTable(topics),
    '',
    '## Every question in this paper (Q | section | topic | difficulty | result | time | marked; question text, and for misses the options and official explanation)',
    questionLines(it, { detail: true }),
    '',
    `## Other papers by this student: ${others.length ? others.join('; ') : 'none'}`,
  ];
  if (paperReport) parts.push('', '## Coach report on this paper', reportText(paperReport));
  if (overallReport) parts.push('', '## Latest overall coach report', reportText(overallReport));
  return parts.join('\n');
}
