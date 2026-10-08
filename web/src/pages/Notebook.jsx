import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl } from '../api.js';
import { useFetch } from '../useFetch.js';
import Rich from '../components/Rich.jsx';
import { ErrorBox, Spinner, fmtDate } from '../components/ui.jsx';
import { QuestionReview } from './Review.jsx';

const FILTERS = [['todo', 'To review'], ['mastered', 'Mastered'], ['all', 'All']];

function NoteBox({ value, onSave }) {
  const [text, setText] = useState(value || '');
  const [state, setState] = useState('');
  useEffect(() => setText(value || ''), [value]);
  const dirty = text !== (value || '');
  return (
    <div className="nb-note">
      <textarea value={text} onChange={(e) => { setText(e.target.value); setState(''); }} maxLength={2000} rows={2}
        placeholder="Your note — why you got it wrong, the trick to remember…" />
      <div className="row-end">
        {state && <span className="muted small">{state}</span>}
        <button className="btn sm" disabled={!dirty} onClick={async () => { await onSave(text); setState('Saved'); }}>Save note</button>
      </div>
    </div>
  );
}

// Flashcard-style practice over the notebook's not-yet-mastered questions.
function ReviewMode({ items, onResult, onExit }) {
  const [queue] = useState(() => [...items].sort(() => Math.random() - 0.5));
  const [i, setI] = useState(0);
  const [pick, setPick] = useState(null);
  const [checked, setChecked] = useState(false);
  const [tally, setTally] = useState({ correct: 0, incorrect: 0, mastered: 0 });
  const it = queue[i];

  if (!it) {
    return (
      <div className="card review-done">
        <h2>Review complete</h2>
        <div className="stats-row">
          <div><b className="ok-t">{tally.correct}</b><span>Correct</span></div>
          <div><b className="bad-t">{tally.incorrect}</b><span>Wrong</span></div>
          <div><b>{tally.mastered}</b><span>Marked mastered</span></div>
        </div>
        <button className="btn primary" onClick={onExit}>Back to notebook</button>
      </div>
    );
  }
  const q = it.question;
  const right = pick === q.answer;
  const next = async (mastered) => {
    await onResult(it, right ? 'correct' : 'incorrect', mastered);
    setTally((t) => ({ correct: t.correct + (right ? 1 : 0), incorrect: t.incorrect + (right ? 0 : 1), mastered: t.mastered + (mastered ? 1 : 0) }));
    setPick(null); setChecked(false); setI(i + 1);
  };

  return (
    <div className="card nb-review">
      <div className="q-head">
        <span className="q-num">Card {i + 1} of {queue.length}</span>
        <span className="muted small">{it.testTitle} · {it.sectionName}</span>
        {q.topic && <span className="tag">{q.topic}</span>}
        <div className="spacer" />
        <button className="btn ghost sm" onClick={onExit}>Exit review</button>
      </div>
      <Rich text={q.text} className="q-text" />
      {q.image && <img className="q-img" src={assetUrl(q.image)} alt="" />}
      <div className={`options ${checked ? 'review' : ''}`}>
        {q.options.map((o) => {
          const cls = checked ? (o.key === q.answer ? 'right' : o.key === pick ? 'wrong' : '') : (pick === o.key ? 'selected' : '');
          return (
            <label key={o.key} className={`option ${cls}`}>
              <input type="radio" name="nbq" disabled={checked} checked={pick === o.key} onChange={() => setPick(o.key)} />
              <span className="opt-key">{o.key.toUpperCase()}</span>
              <span className="opt-body"><Rich text={o.text} as="span" />{o.image && <img src={assetUrl(o.image)} alt="" />}</span>
              {checked && o.key === q.answer && <span className="opt-note">Correct answer</span>}
            </label>
          );
        })}
      </div>
      {!checked ? (
        <div className="row-end"><button className="btn primary" disabled={!pick} onClick={() => setChecked(true)}>Check answer</button></div>
      ) : (
        <>
          <div className={`alert ${right ? 'ok' : 'error'}`}>{right ? 'Correct!' : `Not quite — the answer is ${q.answer.toUpperCase()}.`}
            {it.yourAnswer && it.yourAnswer !== q.answer && <> In the test you chose {it.yourAnswer.toUpperCase()}.</>}</div>
          {it.note && <div className="nb-mynote"><b>Your note:</b> {it.note}</div>}
          {q.explanation && <details className="explanation" open><summary>Explanation</summary><Rich text={q.explanation} /></details>}
          <div className="row-end">
            <button className="btn" onClick={() => next(false)}>Still learning</button>
            <button className="btn primary" disabled={!right} title={right ? '' : 'Answer it correctly to mark it mastered'} onClick={() => next(true)}>Got it — mark mastered</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Notebook() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, error, loading, reload } = useFetch(`/notebooks/${id}`);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('todo');
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [meta, setMeta] = useState({ name: '', description: '' });

  useEffect(() => {
    if (!data) return;
    setItems(data.notebook.items);
    setMeta({ name: data.notebook.name, description: data.notebook.description || '' });
  }, [data]);

  const patch = async (it, body) => {
    const d = await api(`/notebooks/${id}/items/${it._id}`, { method: 'PATCH', body });
    setItems((xs) => xs.map((x) => (x._id === it._id ? { ...x, ...d.item } : x)));
  };

  const shown = useMemo(() => items.filter((it) => !it.missing && (filter === 'all' || (filter === 'mastered' ? it.mastered : !it.mastered))), [items, filter]);
  const todo = items.filter((it) => !it.missing && !it.mastered);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const nb = data.notebook;

  if (reviewing) {
    return <ReviewMode items={todo} onExit={() => setReviewing(false)}
      onResult={(it, result, mastered) => patch(it, { review: result, ...(mastered ? { mastered: true } : {}) })} />;
  }

  return (
    <>
      <Link to="/notebooks" className="muted small">← All notebooks</Link>
      <div className="card nb-header">
        {editing ? (
          <form className="nb-create" onSubmit={async (e) => {
            e.preventDefault();
            await api(`/notebooks/${id}`, { method: 'PATCH', body: meta });
            setEditing(false); reload();
          }}>
            <input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} maxLength={80} required />
            <input value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="Description" maxLength={500} />
            <div className="row-end"><button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button><button className="btn primary">Save</button></div>
          </form>
        ) : (
          <>
            <div className="page-head">
              <div>
                <h1>📒 {nb.name}</h1>
                {nb.description && <p className="muted">{nb.description}</p>}
              </div>
              <div className="row-center">
                <button className="btn primary" disabled={!todo.length} onClick={() => setReviewing(true)}>▶ Review {todo.length} question{todo.length === 1 ? '' : 's'}</button>
                <button className="btn sm" onClick={() => setEditing(true)}>Rename</button>
                <button className="btn sm danger" onClick={async () => {
                  if (!confirm(`Delete notebook "${nb.name}" and its ${items.length} saved questions? Your test results are not affected.`)) return;
                  await api(`/notebooks/${id}`, { method: 'DELETE' });
                  nav('/notebooks');
                }}>Delete</button>
              </div>
            </div>
            <div className="stats-row">
              <div><b>{items.length}</b><span>Questions</span></div>
              <div><b>{todo.length}</b><span>To review</span></div>
              <div><b className="ok-t">{items.length - todo.length}</b><span>Mastered</span></div>
            </div>
          </>
        )}
      </div>

      <div className="chips">
        {FILTERS.map(([k, label]) => <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{label}</button>)}
      </div>
      {!items.length && <div className="empty card">This notebook is empty. Open a <Link to="/history">completed test</Link> and use <b>＋ Notebook</b> on any question.</div>}
      {items.length > 0 && !shown.length && <div className="empty card">{filter === 'todo' ? 'Everything here is mastered 🎉' : 'Nothing here yet.'}</div>}
      {shown.map((it, idx) => (
        <div key={it._id} className="nb-entry">
          <QuestionReview q={it.question} n={idx + 1} label={`#${idx + 1}`} sectionName={`${it.testTitle} · ${it.sectionName}`}
            mine={{ selected: it.yourAnswer }}
            actions={
              <div className="row-center">
                <label className="check small"><input type="checkbox" checked={it.mastered} onChange={(e) => patch(it, { mastered: e.target.checked })} /> Mastered</label>
                <button className="btn sm ghost danger" onClick={async () => {
                  await api(`/notebooks/${id}/items/${it._id}`, { method: 'DELETE' });
                  setItems((xs) => xs.filter((x) => x._id !== it._id));
                }}>Remove</button>
              </div>
            } />
          <div className="nb-meta muted small">
            Saved {fmtDate(it.addedAt)}{it.reviews ? ` · reviewed ${it.reviews}× · last ${it.lastResult === 'correct' ? '✓ correct' : '✗ wrong'} ${fmtDate(it.lastReviewedAt)}` : ' · not reviewed yet'}
          </div>
          <NoteBox value={it.note} onSave={(note) => patch(it, { note })} />
        </div>
      ))}
      {items.some((it) => it.missing) && <p className="muted small">Some saved questions are no longer available (their test was removed).</p>}
    </>
  );
}
