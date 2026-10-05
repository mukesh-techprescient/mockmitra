import { useState } from 'react';
import { api } from '../../api.js';
import { useFetch } from '../../useFetch.js';
import { ErrorBox, Spinner } from '../../components/ui.jsx';
import { AdminNav } from './AdminHome.jsx';

const blank = { name: '', slug: '', description: '', order: 0 };

export default function Categories() {
  const { data, error, loading, reload } = useFetch('/admin/categories');
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const body = { ...form, order: Number(form.order) || 0 };
      if (editing) await api(`/admin/categories/${editing}`, { method: 'PUT', body });
      else await api('/admin/categories', { method: 'POST', body });
      setForm(blank); setEditing(null); reload();
    } catch (e2) { setErr(e2.message); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <div className="page-head"><h1>Categories</h1><AdminNav /></div>
      <form className="card form-grid" onSubmit={save}>
        <h3>{editing ? 'Edit category' : 'New category'}</h3>
        <label>Name<input value={form.name} onChange={set('name')} placeholder="MHT-CET" required /></label>
        <label>Slug <span className="muted small">(used as "category" in test JSON)</span>
          <input value={form.slug} onChange={set('slug')} placeholder="mht-cet" /></label>
        <label>Description<input value={form.description} onChange={set('description')} /></label>
        <label>Sort order<input type="number" value={form.order} onChange={set('order')} /></label>
        {err && <div className="alert error">{err}</div>}
        <div className="row-end">
          {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}
          <button className="btn primary">{editing ? 'Save' : 'Add category'}</button>
        </div>
      </form>
      {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Name</th><th>Slug</th><th>Tests</th><th /></tr></thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c._id}>
                  <td>{c.order}</td><td>{c.name}</td><td><code>{c.slug}</code></td><td>{c.testCount}</td>
                  <td className="nowrap">
                    <button className="btn sm" onClick={() => { setEditing(c._id); setForm({ name: c.name, slug: c.slug, description: c.description || '', order: c.order }); }}>Edit</button>{' '}
                    <button className="btn sm danger" disabled={c.testCount > 0} title={c.testCount ? 'Has tests' : ''}
                      onClick={async () => { if (confirm(`Delete ${c.name}?`)) { try { await api(`/admin/categories/${c._id}`, { method: 'DELETE' }); reload(); } catch (e) { alert(e.message); } } }}>
                      Delete
                    </button>
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
