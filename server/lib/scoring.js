export function scoreAttempt(test, answers) {
  const byQid = new Map(answers.map((a) => [a.qid, a]));
  const m = test.marking || { correct: 1, incorrect: 0, unattempted: 0 };
  const sections = new Map(
    test.sections.map((s) => [s.id, { id: s.id, name: s.name, score: 0, maxScore: 0, correct: 0, incorrect: 0, unattempted: 0 }])
  );
  const total = { score: 0, maxScore: 0, correct: 0, incorrect: 0, unattempted: 0 };

  for (const q of test.questions) {
    const sec = sections.get(q.section);
    const sel = byQid.get(q.qid)?.selected;
    let kind, pts;
    if (!sel) [kind, pts] = ['unattempted', m.unattempted];
    else if (sel === q.answer) [kind, pts] = ['correct', m.correct];
    else [kind, pts] = ['incorrect', m.incorrect];
    for (const bucket of [total, sec].filter(Boolean)) {
      bucket[kind] += 1;
      bucket.score += pts;
      bucket.maxScore += m.correct;
    }
  }
  return { ...total, sections: [...sections.values()] };
}
