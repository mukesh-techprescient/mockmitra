import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useFetch } from '../useFetch.js';
import { assetUrl } from '../api.js';
import Rich from '../components/Rich.jsx';
import { ErrorBox, Spinner, fmtDate, fmtDuration, pct } from '../components/ui.jsx';

const FILTERS = [
  ['all', 'All'],
  ['incorrect', 'Incorrect'],
  ['unattempted', 'Unattempted'],
  ['correct', 'Correct'],
  ['flagged', 'Marked'],
];

export function QuestionReview({ q, n, mine, sectionName }) {
  const sel = mine?.selected;
  const status = !sel ? 'unattempted' : sel === q.answer ? 'correct' : 'incorrect';
  return (
    <article className={`card review-q ${status}`} id={`q-${n}`}>
      <div className="q-head">
        <span className="q-num">Q{n}</span>
        {sectionName && <span className="muted small">{sectionName}</span>}
        {q.topic && <span className="tag">{q.topic}</span>}
        <div className="spacer" />
        {mine && <span className={`badge ${status === 'correct' ? 'ok' : status === 'incorrect' ? 'bad' : ''}`}>{status}</span>}
        {mine?.timeSpentSec > 0 && <span className="muted small">{fmtDuration(mine.timeSpentSec)}</span>}
      </div>
      <Rich text={q.text} className="q-text" />
      {q.image && <img className="q-img" src={assetUrl(q.image)} alt="" />}
      <div className="options review">
        {q.options.map((o) => {
          const cls = o.key === q.answer ? 'right' : o.key === sel ? 'wrong' : '';
          return (
            <div key={o.key} className={`option ${cls}`}>
              <span className="opt-key">{o.key.toUpperCase()}</span>
              <span className="opt-body"><Rich text={o.text} as="span" />{o.image && <img src={assetUrl(o.image)} alt="" />}</span>
              {o.key === q.answer && <span className="opt-note">Correct answer</span>}
              {o.key === sel && o.key !== q.answer && <span className="opt-note">Your answer</span>}
            </div>
          );
        })}
      </div>
      {(q.explanation || q.explanationImage) && (
        <details className="explanation" open={status !== 'correct'}>
          <summary>Explanation</summary>
          <Rich text={q.explanation} />
          {q.explanationImage && <img className="q-img" src={assetUrl(q.explanationImage)} alt="" />}
        </details>
      )}
    </article>
  );
}

export default function Review() {
  const { attemptId } = useParams();
  const loc = useLocation();
  const { data, error, loading } = useFetch(`/attempts/${attemptId}`);
  const [filter, setFilter] = useState('all');
  const [section, setSection] = useState('all');

  const byQid = useMemo(() => new Map((data?.attempt.answers || []).map((a) => [a.qid, a])), [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const { attempt, test } = data;
  const r = attempt.result;
  const secName = Object.fromEntries(test.sections.map((s) => [s.id, s.name]));

  const statusOf = (q) => {
    const m = byQid.get(q.qid);
    if (filter === 'flagged') return m?.flagged;
    const st = !m?.selected ? 'unattempted' : m.selected === q.answer ? 'correct' : 'incorrect';
    return filter === 'all' || st === filter;
  };
  const list = test.questions.map((q, i) => ({ q, n: i + 1 })).filter(({ q }) => (section === 'all' || q.section === section) && statusOf(q));

  return (
    <>
      <Link to="/history" className="muted small">← My results</Link>
      {loc.state?.auto && <div className="alert">Time was up, so your test was submitted automatically.</div>}
      <div className="card result-head">
        <div>
          <div className="muted small">{test.category?.name} · {fmtDate(attempt.submittedAt)}</div>
          <h1>{test.title}</h1>
        </div>
        <div className="score-big">
          <b>{r.score}</b><span>/ {r.maxScore}</span>
          <div className="muted small">{pct(r.score, r.maxScore)}%</div>
        </div>
      </div>
      <div className="stats-row cards">
        <div className="card"><b className="ok-t">{r.correct}</b><span>Correct</span></div>
        <div className="card"><b className="bad-t">{r.incorrect}</b><span>Incorrect</span></div>
        <div className="card"><b>{r.unattempted}</b><span>Unattempted</span></div>
        <div className="card"><b>{pct(r.correct, r.correct + r.incorrect)}%</b><span>Accuracy</span></div>
        <div className="card"><b>{fmtDuration(r.timeTakenSec)}</b><span>Time taken</span></div>
      </div>
      {r.sections.length > 1 && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Section</th><th>Score</th><th>Correct</th><th>Incorrect</th><th>Unattempted</th></tr></thead>
            <tbody>
              {r.sections.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td><b>{s.score}</b>/{s.maxScore}</td>
                  <td>{s.correct}</td><td>{s.incorrect}</td><td>{s.unattempted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="review-bar">
        <div className="chips">
          {FILTERS.map(([k, label]) => (
            <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        {test.sections.length > 1 && (
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="all">All sections</option>
            {test.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      {!list.length && <div className="empty card">No questions match this filter.</div>}
      {list.map(({ q, n }) => (
        <QuestionReview key={q.qid} q={q} n={n} mine={byQid.get(q.qid)} sectionName={secName[q.section]} />
      ))}
      <div className="row-end"><Link className="btn primary" to={`/tests/${test._id}`}>Retake test</Link></div>
    </>
  );
}
