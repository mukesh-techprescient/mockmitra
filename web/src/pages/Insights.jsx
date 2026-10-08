import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../useFetch.js';
import TopicTable from '../components/TopicTable.jsx';
import CoachReport from '../components/CoachReport.jsx';
import { ErrorBox, Spinner, pct } from '../components/ui.jsx';

function Trend({ points }) {
  if (points.length < 2) return null;
  return (
    <div className="card">
      <h3>Score trend</h3>
      <div className="trend">
        {points.map((p) => {
          const v = Math.max(0, pct(p.score, p.maxScore));
          return (
            <Link key={p.attemptId} to={`/results/${p.attemptId}`} className="trend-bar" title={`${p.title}: ${p.score}/${p.maxScore}`}>
              <span className="trend-val">{v}%</span>
              <i style={{ height: `${Math.max(v, 2)}%` }} />
            </Link>
          );
        })}
      </div>
      <div className="muted small">Each bar is one completed test, oldest first. Click a bar to open that review.</div>
    </div>
  );
}

export default function Insights() {
  const { data, error, loading, reload } = useFetch('/insights');
  const [older, setOlder] = useState(false);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { overall: o, topics, sections, trend, reports } = data;

  if (!o.attempts) {
    return (
      <>
        <h1>Insights</h1>
        <div className="empty card">Finish a test to see which topics need work. <Link to="/">Pick a test →</Link></div>
      </>
    );
  }
  const weak = topics.filter((t) => t.verdict === 'weak');
  return (
    <>
      <h1>Insights</h1>
      <div className="stats-row cards">
        <div className="card"><b>{o.attempts}</b><span>Tests completed</span></div>
        <div className="card"><b>{pct(o.correct, o.correct + o.incorrect)}%</b><span>Accuracy (answered)</span></div>
        <div className="card"><b>{pct(o.unattempted, o.correct + o.incorrect + o.unattempted)}%</b><span>Skipped</span></div>
        <div className="card"><b className={weak.length ? 'bad-t' : 'ok-t'}>{weak.length}</b><span>Weak topics</span></div>
      </div>

      {reports.length > 0 && (
        <section>
          <CoachReport report={reports[0]} />
          {reports.length > 1 && (
            <>
              <button className="btn sm" onClick={() => setOlder((v) => !v)}>{older ? 'Hide' : 'Show'} {reports.length - 1} earlier report{reports.length > 2 ? 's' : ''}</button>
              {older && reports.slice(1).map((r) => <CoachReport key={r._id} report={r} />)}
            </>
          )}
        </section>
      )}

      <h2>Topics, weakest first</h2>
      <TopicTable topics={topics} />

      <h2>By subject</h2>
      <div className="grid">
        {sections.map((s) => (
          <div key={s.key} className="card subject-card">
            <div className="t-name">{s.subject}</div>
            <div className="bar"><i className={s.verdict} style={{ width: `${Math.round(s.mastery * 100)}%` }} /></div>
            <div className="muted small">{s.correct}/{s.seen} correct · {s.unattempted} skipped</div>
          </div>
        ))}
      </div>
      <Trend points={trend} />
    </>
  );
}
