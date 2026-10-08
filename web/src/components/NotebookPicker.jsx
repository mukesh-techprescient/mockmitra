import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Shared state for the review page: my notebooks + which notebooks hold each question of this test.
export function useNotebooks(testId) {
  const [notebooks, setNotebooks] = useState([]);
  const [membership, setMembership] = useState({});
  const reload = async () => {
    const [a, b] = await Promise.all([api('/notebooks'), testId ? api(`/notebooks/membership?testId=${testId}`) : { membership: {} }]);
    setNotebooks(a.notebooks);
    setMembership(b.membership);
  };
  useEffect(() => { reload().catch(() => {}); }, [testId]);
  const create = async (name) => {
    const d = await api('/notebooks', { method: 'POST', body: { name } });
    setNotebooks((n) => [d.notebook, ...n]);
    return d.notebook;
  };
  return { notebooks, membership, setMembership, reload, create };
}

function useOutsideClose(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open, setOpen]);
  return ref;
}

function NewNotebookInput({ onCreate }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="nb-new" onSubmit={async (e) => {
      e.preventDefault();
      if (!name.trim()) return;
      setBusy(true);
      try { await onCreate(name.trim()); setName(''); } catch (err) { alert(err.message); } finally { setBusy(false); }
    }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New notebook…" maxLength={80} />
      <button className="btn sm" disabled={busy || !name.trim()}>Create</button>
    </form>
  );
}

// "+ Notebook" button for one question.
export function NotebookPicker({ nb, testId, qid, attemptId }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, setOpen);
  const inIds = nb.membership[qid] || [];

  const add = async (notebook) => {
    try {
      await api(`/notebooks/${notebook._id}/items`, { method: 'POST', body: { testId, qid, attemptId } });
      nb.setMembership((m) => ({ ...m, [qid]: [...new Set([...(m[qid] || []), notebook._id])] }));
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="nb-picker" ref={ref}>
      <button className={`btn sm ${inIds.length ? 'saved' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {inIds.length ? `✓ In ${inIds.length} notebook${inIds.length > 1 ? 's' : ''}` : '＋ Notebook'}
      </button>
      {open && (
        <div className="nb-menu card">
          <div className="muted small">Save this question to…</div>
          {nb.notebooks.map((n) => {
            const has = inIds.includes(n._id);
            return (
              <button key={n._id} className={`nb-item ${has ? 'has' : ''}`} disabled={has} onClick={() => add(n)}>
                <span>{has ? '✓' : '＋'}</span> {n.name}
              </button>
            );
          })}
          {!nb.notebooks.length && <div className="muted small">You don't have any notebooks yet.</div>}
          <NewNotebookInput onCreate={async (name) => add(await nb.create(name))} />
        </div>
      )}
    </div>
  );
}

// "Save mistakes" — bulk add from one attempt.
export function BulkSave({ nb, attemptId, counts, onDone }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, setOpen);
  const [include, setInclude] = useState({ incorrect: true, unattempted: false, flagged: false });
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const chosen = Object.keys(include).filter((k) => include[k]);

  const save = async (notebook) => {
    setBusy(true); setMsg('');
    try {
      const d = await api(`/notebooks/${notebook._id}/items/bulk`, { method: 'POST', body: { attemptId, include: chosen } });
      setMsg(d.added ? `Saved ${d.added} question${d.added > 1 ? 's' : ''} to "${notebook.name}".` : `Nothing new to save — they're already in "${notebook.name}".`);
      await onDone();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="nb-picker" ref={ref}>
      <button className="btn sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>📒 Save mistakes</button>
      {open && (
        <div className="nb-menu card wide">
          <div className="muted small">Add from this test:</div>
          {[['incorrect', `Wrong answers (${counts.incorrect})`], ['unattempted', `Skipped (${counts.unattempted})`], ['flagged', `Marked for review (${counts.flagged})`]].map(([k, label]) => (
            <label key={k} className="check"><input type="checkbox" checked={include[k]} onChange={(e) => setInclude({ ...include, [k]: e.target.checked })} /> {label}</label>
          ))}
          <div className="muted small">to notebook:</div>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose…</option>
            {nb.notebooks.map((n) => <option key={n._id} value={n._id}>{n.name} ({n.count})</option>)}
          </select>
          <button className="btn primary sm" disabled={busy || !target || !chosen.length} onClick={() => save(nb.notebooks.find((n) => n._id === target))}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <NewNotebookInput onCreate={async (name) => { const n = await nb.create(name); setTarget(n._id); }} />
          {msg && <div className="alert small">{msg}</div>}
        </div>
      )}
    </div>
  );
}
