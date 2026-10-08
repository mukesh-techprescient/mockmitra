import { useMemo, useState } from 'react';
import { fmtDuration } from './ui.jsx';

const LABEL = { weak: 'Weak', developing: 'Needs work', strong: 'Strong', insufficient: 'Too few Qs' };
const pctTxt = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export function VerdictChip({ v }) {
  return <span className={`verdict ${v}`}>{LABEL[v]}</span>;
}

// Topic rows from server/lib/topicStats.js, already sorted weakest first.
export default function TopicTable({ topics, compact = false }) {
  const subjects = useMemo(() => [...new Set(topics.map((t) => t.subject))], [topics]);
  const [subject, setSubject] = useState('all');
  const [showAll, setShowAll] = useState(!compact);
  const rows = topics.filter((t) => subject === 'all' || t.subject === subject);
  // Compact mode (a single test): too few questions per topic for verdicts, so show where marks were lost.
  const lost = (t) => t.incorrect + t.unattempted;
  const shown = showAll ? rows : rows.filter((t) => lost(t) > 0).sort((a, b) => lost(b) - lost(a) || a.mastery - b.mastery).slice(0, 10);

  return (
    <div className="topic-table">
      {subjects.length > 1 && (
        <div className="chips">
          <button className={`chip ${subject === 'all' ? 'active' : ''}`} onClick={() => setSubject('all')}>All subjects</button>
          {subjects.map((s) => (
            <button key={s} className={`chip ${subject === s ? 'active' : ''}`} onClick={() => setSubject(s)}>{s}</button>
          ))}
        </div>
      )}
      <div className="table-wrap card">
        <table>
          <thead>
            <tr><th>Topic</th><th>Mastery</th><th className="hide-sm">Correct / seen</th><th className="hide-sm">Accuracy</th><th className="hide-sm">Avg time</th><th>Status</th></tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.key}>
                <td><div className="t-name">{t.topic}</div><div className="muted small">{t.subject}</div></td>
                <td className="bar-cell">
                  <div className="bar" title={`Smoothed mastery ${pctTxt(t.mastery)}`}><i className={t.verdict} style={{ width: `${Math.round(t.mastery * 100)}%` }} /></div>
                  <span className="small">{pctTxt(t.mastery)}</span>
                </td>
                <td className="hide-sm">{t.correct} / {t.seen}{t.unattempted ? <span className="muted small"> ({t.unattempted} skipped)</span> : null}</td>
                <td className="hide-sm">{pctTxt(t.accuracy)}</td>
                <td className="hide-sm">{t.avgTimeSec != null ? fmtDuration(t.avgTimeSec) : '—'}</td>
                <td>{compact && !showAll && t.verdict === 'insufficient'
                  ? <span className="verdict">{lost(t)} lost</span>
                  : <VerdictChip v={t.verdict} />}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="muted">{compact ? 'No marks lost in this test — excellent.' : 'No topics to show.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {compact && rows.length > shown.length && (
        <button className="btn sm" onClick={() => setShowAll(true)}>Show all {rows.length} topics</button>
      )}
      <p className="muted small">
        Mastery blends your score on the topic with your overall level in that subject, so a topic is only marked weak when it is
        clearly below your usual level (a couple of unlucky questions won't do it). Skipped questions count as not correct.
        Topics with fewer than 3 questions get no verdict.
      </p>
    </div>
  );
}
