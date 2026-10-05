import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../useFetch.js';
import { ErrorBox, Spinner, pct } from '../components/ui.jsx';

export default function Dashboard() {
  const { data, error, loading, reload } = useFetch('/catalog');
  const [active, setActive] = useState('all');
  const [q, setQ] = useState('');

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const cats = data.categories;
  if (!cats.length) return <div className="empty card">No tests are published yet. Check back soon.</div>;

  const shown = cats
    .filter((c) => active === 'all' || c._id === active)
    .map((c) => ({ ...c, tests: c.tests.filter((t) => t.title.toLowerCase().includes(q.toLowerCase())) }))
    .filter((c) => c.tests.length);

  return (
    <>
      <div className="page-head">
        <h1>Practice tests</h1>
        <input className="search" placeholder="Search tests…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chips">
        <button className={`chip ${active === 'all' ? 'active' : ''}`} onClick={() => setActive('all')}>All</button>
        {cats.map((c) => (
          <button key={c._id} className={`chip ${active === c._id ? 'active' : ''}`} onClick={() => setActive(c._id)}>
            {c.name} <span className="count">{c.tests.length}</span>
          </button>
        ))}
      </div>
      {shown.map((c) => (
        <section key={c._id} className="cat-section">
          <h2>{c.name}</h2>
          {c.description && <p className="muted">{c.description}</p>}
          <div className="grid">
            {c.tests.map((t) => (
              <Link key={t._id} to={`/tests/${t._id}`} className="card test-card">
                <div className="test-title">{t.title}</div>
                <div className="meta">
                  <span>{t.questionCount} Qs</span>
                  <span>{t.durationMinutes} min</span>
                  {t.year && <span>{t.year}</span>}
                </div>
                <div className="test-foot">
                  {t.mine.inProgress ? (
                    <span className="badge warn">In progress</span>
                  ) : t.mine.best ? (
                    <span className="badge ok">Best {t.mine.best.score}/{t.mine.best.maxScore} ({pct(t.mine.best.score, t.mine.best.maxScore)}%)</span>
                  ) : (
                    <span className="badge">Not attempted</span>
                  )}
                  {t.mine.attempts > 0 && <span className="muted small">{t.mine.attempts} attempt{t.mine.attempts > 1 ? 's' : ''}</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
