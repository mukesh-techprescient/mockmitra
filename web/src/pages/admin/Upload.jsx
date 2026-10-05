import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { ErrorBox } from '../../components/ui.jsx';
import { AdminNav } from './AdminHome.jsx';

export default function Upload() {
  const { replaceId } = useParams();
  const nav = useNavigate();
  const [json, setJson] = useState(null);
  const [fileName, setFileName] = useState('');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [publish, setPublish] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files[0];
    setSummary(null); setError(null); setJson(null);
    if (!f) return;
    setFileName(`${f.name} (${(f.size / 1024).toFixed(0)} KB)`);
    if (f.size > 5.5 * 1024 * 1024) {
      setError({ message: 'File is over ~5.5MB, the upload limit on Netlify. Use `npm run import -- file.json` from your machine instead.' });
      return;
    }
    try {
      const parsed = JSON.parse(await f.text());
      setJson(parsed);
      setBusy(true);
      const d = await api('/admin/tests/validate', { method: 'POST', body: parsed });
      setSummary(d.summary);
    } catch (err) {
      setError(err instanceof SyntaxError ? { message: `Not valid JSON: ${err.message}` } : err);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true); setError(null);
    try {
      const d = replaceId
        ? await api(`/admin/tests/${replaceId}/content`, { method: 'PUT', body: json })
        : await api('/admin/tests', { method: 'POST', body: json });
      if (publish && !replaceId) await api(`/admin/tests/${d.test._id}`, { method: 'PATCH', body: { published: true } });
      nav(`/admin/tests/${d.test._id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head"><h1>{replaceId ? 'Replace test content' : 'Upload test'}</h1><AdminNav /></div>
      <div className="card narrow-card">
        <p>
          Upload a test JSON produced by <code>npm run pdf2json</code> (or written by hand).
          {replaceId && ' Existing attempts are kept; questions are matched by id when students review old attempts.'}
        </p>
        <label className="file-drop">
          <input type="file" accept="application/json,.json" onChange={onFile} />
          <span>{fileName || 'Choose a .json file…'}</span>
        </label>
        {busy && !summary && <p className="muted">Validating…</p>}
        <ErrorBox error={error} />
        {summary && (
          <div className="summary">
            <h3>{summary.title}</h3>
            <dl>
              <dt>Category</dt><dd><code>{summary.category}</code> {!summary.categoryExists && <span className="badge warn">will be created</span>}</dd>
              <dt>Year</dt><dd>{summary.year ?? '—'}</dd>
              <dt>Duration</dt><dd>{summary.durationMinutes} min</dd>
              <dt>Questions</dt><dd>{summary.questions} ({Object.entries(summary.perSection).map(([k, v]) => `${k}: ${v}`).join(', ')})</dd>
              <dt>With figures</dt><dd>{summary.withImages}</dd>
              <dt>Missing explanations</dt><dd>{summary.missingExplanations ? <span className="badge warn">{summary.missingExplanations}</span> : 0}</dd>
            </dl>
            {!replaceId && (
              <label className="check"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish immediately</label>
            )}
            <div className="row-end">
              <Link className="btn" to="/admin">Cancel</Link>
              <button className="btn primary" onClick={doImport} disabled={busy}>{busy ? 'Importing…' : replaceId ? 'Replace content' : 'Import test'}</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
