import { Fragment, useState } from 'react';
import { api, getToken } from '../../api.js';
import { useFetch } from '../../useFetch.js';
import { ErrorBox, Spinner, fmtDate } from '../../components/ui.jsx';
import CoachReport from '../../components/CoachReport.jsx';
import { AdminNav } from './AdminHome.jsx';

async function downloadExport(s) {
  const res = await fetch(`/api/admin/students/${s._id}/export`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return alert('Export failed');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: `performance-${s.email}.json` });
  a.click();
  URL.revokeObjectURL(url);
}

function Reports({ student, onChange }) {
  const { data, error, loading, reload } = useFetch(`/admin/students/${student._id}/reports`);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data.reports.length) return <p className="muted">No coach reports yet.</p>;
  return data.reports.map((r) => (
    <div key={r._id}>
      <CoachReport report={r} />
      <button className="btn sm danger" onClick={async () => {
        if (!confirm(`Delete "${r.title}"? The student will no longer see it.`)) return;
        await api(`/admin/analysis/${r._id}`, { method: 'DELETE' });
        reload(); onChange();
      }}>Delete report</button>
    </div>
  ));
}

export default function Students() {
  const { data, error, loading, reload } = useFetch('/admin/students');
  const [open, setOpen] = useState(null);
  const [upload, setUpload] = useState({ busy: false, msg: null, err: null });

  const onUpload = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setUpload({ busy: true, msg: null, err: null });
    try {
      const d = await api('/admin/analysis', { method: 'POST', body: JSON.parse(await f.text()) });
      setUpload({ busy: false, msg: `Uploaded "${d.report.title}".`, err: null });
      reload();
    } catch (err) {
      setUpload({ busy: false, msg: null, err: err instanceof SyntaxError ? { message: `Not valid JSON: ${err.message}` } : err });
    }
  };

  return (
    <>
      <div className="page-head"><h1>Students</h1><AdminNav /></div>
      <div className="card">
        <h3>Offline weak-topic analysis</h3>
        <ol className="small">
          <li><b>Export</b> a student's performance JSON (button below, or <code>npm run analysis:export -- email</code>).</li>
          <li>Analyse it offline and write a coach report JSON (format: <code>DESIGN.md → Analysis report</code>).</li>
          <li><b>Upload</b> the report here (or <code>npm run analysis:upload -- file.json</code>). The student sees it on their Insights page.</li>
        </ol>
        <label className="file-drop">
          <input type="file" accept="application/json,.json" onChange={onUpload} disabled={upload.busy} />
          <span>{upload.busy ? 'Uploading…' : 'Upload a coach report (.json)…'}</span>
        </label>
        {upload.msg && <div className="alert">{upload.msg}</div>}
        <ErrorBox error={upload.err} />
      </div>
      {loading ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Student</th><th>Tests done</th><th>Last test</th><th>Reports</th><th /></tr></thead>
            <tbody>
              {data.students.map((s) => (
                <Fragment key={s._id}>
                  <tr>
                    <td><div className="t-name">{s.name}</div><div className="muted small">{s.email}</div></td>
                    <td>{s.attempts}</td>
                    <td className="nowrap small">{s.lastAttempt ? fmtDate(s.lastAttempt) : '—'}</td>
                    <td>{s.reports}</td>
                    <td className="nowrap">
                      <button className="btn sm" disabled={!s.attempts} onClick={() => downloadExport(s)}>Export JSON</button>{' '}
                      <button className="btn sm" onClick={() => setOpen(open === s._id ? null : s._id)}>{open === s._id ? 'Hide' : 'Reports'}</button>
                    </td>
                  </tr>
                  {open === s._id && (
                    <tr><td colSpan={5}><Reports student={s} onChange={reload} /></td></tr>
                  )}
                </Fragment>
              ))}
              {!data.students.length && <tr><td colSpan={5} className="muted">No students yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
