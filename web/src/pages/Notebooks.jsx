import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { ErrorBox, Spinner, fmtDate, pct } from '../components/ui.jsx';

export default function Notebooks() {
  const { data, error, loading, reload } = useFetch('/notebooks');
  const [form, setForm] = useState({ name: '', description: '' });
  const [err, setErr] = useState('');
  const nav = useNavigate();

  const create = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const d = await api('/notebooks', { method: 'POST', body: form });
      nav(`/notebooks/${d.notebook._id}`);
    } catch (e2) { setErr(e2.message); }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <>
      <h1>Mistake notebooks</h1>
      <p className="muted">Collect questions you got wrong (or want to revisit), add your own notes, and review them until they stick.
        Add questions from any <Link to="/history">completed test's review</Link> using <b>＋ Notebook</b> or <b>📒 Save mistakes</b>.</p>
      <form className="card nb-create" onSubmit={create}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="New notebook name, e.g. Organic chemistry traps" maxLength={80} required />
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" maxLength={500} />
        <button className="btn primary">Create notebook</button>
        {err && <div className="alert error">{err}</div>}
      </form>
      {!data.notebooks.length ? (
        <div className="empty card">No notebooks yet. Create one above, then save questions into it from a test review.</div>
      ) : (
        <div className="grid">
          {data.notebooks.map((n) => (
            <Link key={n._id} to={`/notebooks/${n._id}`} className="card test-card">
              <div className="test-title">📒 {n.name}</div>
              {n.description && <div className="muted small">{n.description}</div>}
              <div className="meta"><span>{n.count} question{n.count === 1 ? '' : 's'}</span><span>{n.mastered} mastered</span></div>
              <div className="bar"><i className="strong" style={{ width: `${pct(n.mastered, n.count)}%` }} /></div>
              <div className="muted small">Updated {fmtDate(n.updatedAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
