import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useFetch } from '../../useFetch.js';
import { ErrorBox, Spinner, fmtDate } from '../../components/ui.jsx';

export function AdminNav() {
  return (
    <div className="admin-nav">
      <Link to="/admin">Tests</Link>
      <Link to="/admin/categories">Categories</Link>
      <Link to="/admin/students">Students</Link>
      <Link to="/admin/upload" className="btn primary sm">+ Upload test JSON</Link>
    </div>
  );
}

export default function AdminHome() {
  const stats = useFetch('/admin/stats');
  const { data, error, loading, reload } = useFetch('/admin/tests');

  const act = async (fn) => {
    try { await fn(); reload(); stats.reload(); } catch (e) { alert(e.message); }
  };

  return (
    <>
      <div className="page-head"><h1>Admin</h1><AdminNav /></div>
      {stats.data && (
        <div className="stats-row cards">
          <div className="card"><b>{stats.data.tests}</b><span>Tests</span></div>
          <div className="card"><b>{stats.data.users}</b><span>Students</span></div>
          <div className="card"><b>{stats.data.attempts}</b><span>Attempts</span></div>
        </div>
      )}
      {loading ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data.tests.length ? (
        <div className="empty card">No tests yet. <Link to="/admin/upload">Upload your first test JSON →</Link></div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Category</th><th>Qs</th><th>Min</th><th>Attempts</th><th>Updated</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.tests.map((t) => (
                <tr key={t._id}>
                  <td><Link to={`/admin/tests/${t._id}`}>{t.title}</Link></td>
                  <td>{t.category?.name}</td>
                  <td>{t.questionCount}</td>
                  <td>{t.durationMinutes}</td>
                  <td>{t.attemptCount}</td>
                  <td className="nowrap small">{fmtDate(t.updatedAt)}</td>
                  <td>
                    <button className={`badge btnlike ${t.published ? 'ok' : ''}`} title="Toggle"
                      onClick={() => act(() => api(`/admin/tests/${t._id}`, { method: 'PATCH', body: { published: !t.published } }))}>
                      {t.published ? 'Published' : 'Draft'}
                    </button>
                  </td>
                  <td className="nowrap">
                    <Link className="btn sm" to={`/admin/upload/${t._id}`}>Replace JSON</Link>{' '}
                    <button className="btn sm danger" onClick={() => {
                      if (confirm(`Delete "${t.title}" and all ${t.attemptCount} attempts? This cannot be undone.`))
                        act(() => api(`/admin/tests/${t._id}`, { method: 'DELETE' }));
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
