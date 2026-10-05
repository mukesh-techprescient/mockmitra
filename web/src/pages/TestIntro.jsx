import { Link, useNavigate, useParams } from 'react-router-dom';
import { useFetch } from '../useFetch.js';
import { ErrorBox, Spinner } from '../components/ui.jsx';

export default function TestIntro() {
  const { testId } = useParams();
  const { data, error, loading } = useFetch(`/tests/${testId}`);
  const nav = useNavigate();
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const t = data.test;
  const m = t.marking;
  return (
    <div className="narrow">
      <Link to="/" className="muted small">← All tests</Link>
      <div className="card">
        <div className="muted small">{t.category?.name}</div>
        <h1>{t.title}</h1>
        {t.description && <p>{t.description}</p>}
        <div className="stats-row">
          <div><b>{t.questionCount}</b><span>Questions</span></div>
          <div><b>{t.durationMinutes}</b><span>Minutes</span></div>
          <div><b>+{m.correct}</b><span>Correct</span></div>
          <div><b>{m.incorrect}</b><span>Wrong</span></div>
        </div>
        {t.sections.length > 1 && <p><b>Sections:</b> {t.sections.map((s) => s.name).join(' · ')}</p>}
        {t.instructions?.length > 0 && (
          <>
            <h3>Instructions</h3>
            <ul className="instructions">{t.instructions.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </>
        )}
        <ul className="instructions muted small">
          <li>The timer starts when you press Start. Use <b>Pause</b> to stop the clock and hide the questions; resume any time, even after signing out. If you just close the page without pausing, the timer keeps running.</li>
          <li>Answers save automatically. The test is submitted automatically when time is up.</li>
          <li>Keyboard: A–D or 1–4 to choose, ← → to move between questions.</li>
        </ul>
        <button className="btn primary block" onClick={() => nav(`/exam/${t._id}`)}>Start / resume test</button>
      </div>
    </div>
  );
}
