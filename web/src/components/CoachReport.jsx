import Rich from './Rich.jsx';
import { fmtDate } from './ui.jsx';

const SEV = { high: 'Top priority', medium: 'Priority', low: 'Keep an eye on' };

export default function CoachReport({ report: r }) {
  return (
    <article className="card coach">
      <div className="coach-head">
        <div>
          <div className="muted small">Coach's report · {fmtDate(r.createdAt)}{r.basedOn?.attempts ? ` · based on ${r.basedOn.attempts} test${r.basedOn.attempts > 1 ? 's' : ''}` : ''}</div>
          <h2>{r.title}</h2>
        </div>
      </div>
      {r.summary && <Rich text={r.summary} className="coach-summary" />}
      {r.weakTopics?.length > 0 && (
        <>
          <h3>Focus areas</h3>
          <div className="focus-list">
            {r.weakTopics.map((w, i) => (
              <div key={i} className={`focus ${w.severity}`}>
                <div className="focus-title"><b>{w.topic}</b>{w.subject && <span className="muted small"> · {w.subject}</span>}<span className={`sev ${w.severity}`}>{SEV[w.severity]}</span></div>
                {w.evidence && <Rich text={w.evidence} className="muted small" />}
                {w.advice && <Rich text={w.advice} />}
              </div>
            ))}
          </div>
        </>
      )}
      {r.habits?.length > 0 && (
        <>
          <h3>Exam habits</h3>
          <ul className="plain-list">{r.habits.map((h, i) => <li key={i}><b>{h.title}.</b> <Rich as="span" text={h.detail} /></li>)}</ul>
        </>
      )}
      {r.strengths?.length > 0 && (
        <>
          <h3>Strengths</h3>
          <ul className="plain-list">{r.strengths.map((s, i) => <li key={i}><b>{s.topic}</b>{s.subject && <span className="muted"> ({s.subject})</span>}{s.note && <> — <Rich as="span" text={s.note} /></>}</li>)}</ul>
        </>
      )}
      {r.plan?.length > 0 && (
        <>
          <h3>Study plan</h3>
          <ol className="plan">{r.plan.map((p, i) => <li key={i}><b>{p.step}:</b> <Rich as="span" text={p.task} /></li>)}</ol>
        </>
      )}
      <div className="muted small">— {r.author}</div>
    </article>
  );
}
