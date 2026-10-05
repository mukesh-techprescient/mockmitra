import { Link } from 'react-router-dom';
import { useFetch } from '../useFetch.js';
import { ErrorBox, Spinner, fmtDate, fmtDuration, pct } from '../components/ui.jsx';

export default function History() {
  const { data, error, loading, reload } = useFetch('/attempts');
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const list = data.attempts.filter((a) => a.test); // test may have been deleted
  return (
    <>
      <h1>My results</h1>
      {!list.length ? (
        <div className="empty card">No completed tests yet. <Link to="/">Take your first test →</Link></div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Test</th><th>Category</th><th>Date</th><th>Score</th><th>Accuracy</th><th>Time</th><th /></tr></thead>
            <tbody>
              {list.map((a) => {
                const r = a.result;
                const attempted = r.correct + r.incorrect;
                return (
                  <tr key={a._id}>
                    <td>{a.test.title}</td>
                    <td>{a.test.category?.name}</td>
                    <td className="nowrap">{fmtDate(a.submittedAt)}</td>
                    <td className="nowrap"><b>{r.score}</b>/{r.maxScore} <span className="muted">({pct(r.score, r.maxScore)}%)</span></td>
                    <td>{pct(r.correct, attempted)}%</td>
                    <td>{fmtDuration(r.timeTakenSec)}</td>
                    <td><Link className="btn sm" to={`/results/${a._id}`}>Review</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
