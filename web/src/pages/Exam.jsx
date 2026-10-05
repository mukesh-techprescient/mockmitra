import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Rich from '../components/Rich.jsx';
import { ErrorBox, Spinner, fmtDuration } from '../components/ui.jsx';

const FLUSH_MS = 800;

function statusOf(a) {
  if (a.flagged) return a.selected ? 'flagged-answered' : 'flagged';
  if (a.selected) return 'answered';
  return a.visited ? 'skipped' : 'unseen';
}

export default function Exam() {
  const { testId } = useParams();
  const nav = useNavigate();
  const [loadErr, setLoadErr] = useState(null);
  const [test, setTest] = useState(null);
  const [attemptId, setAttemptId] = useState(null);
  const [answers, setAnswers] = useState({});      // qid -> {selected, flagged, timeSpentSec, visited}
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(null); // seconds
  const [saveState, setSaveState] = useState('saved'); // saved | saving | error
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const pending = useRef(new Map());
  const flushTimer = useRef(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const enteredAt = useRef(Date.now());
  const deadlineRef = useRef(0);
  const offsetRef = useRef(0);
  const submittedRef = useRef(false);

  // ---- load / resume
  useEffect(() => {
    api('/attempts', { method: 'POST', body: { testId } })
      .then(({ attempt, test, serverNow }) => {
        setTest(test);
        setAttemptId(attempt._id);
        offsetRef.current = serverNow - Date.now();
        deadlineRef.current = new Date(attempt.deadline).getTime();
        const map = {};
        for (const a of attempt.answers) map[a.qid] = { selected: a.selected, flagged: a.flagged, timeSpentSec: a.timeSpentSec, visited: !!(a.selected || a.flagged || a.timeSpentSec) };
        if (test.questions[0]) map[test.questions[0].qid].visited = true;
        setAnswers(map);
        enteredAt.current = Date.now();
      })
      .catch(setLoadErr);
  }, [testId]);

  // ---- autosave
  const flush = useCallback(async (opts = {}) => {
    clearTimeout(flushTimer.current);
    if (!attemptId || !pending.current.size) return;
    const batch = [...pending.current.values()];
    pending.current.clear();
    setSaveState('saving');
    try {
      await api(`/attempts/${attemptId}/answers`, { method: 'PATCH', body: { answers: batch }, keepalive: opts.keepalive });
      if (!pending.current.size) setSaveState('saved');
    } catch (e) {
      for (const b of batch) if (!pending.current.has(b.qid)) pending.current.set(b.qid, b);
      setSaveState('error');
      if (e.status !== 409) flushTimer.current = setTimeout(flush, 3000);
    }
  }, [attemptId]);

  const queue = useCallback((qid, patch) => {
    pending.current.set(qid, { ...(pending.current.get(qid) || { qid }), ...patch });
    clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, FLUSH_MS);
  }, [flush]);

  const update = useCallback((qid, patch, persist = true) => {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
    if (persist) {
      const { visited, ...server } = patch;
      if (Object.keys(server).length) queue(qid, server);
    }
  }, [queue]);

  // Record time spent on the question we're leaving.
  const commitTime = useCallback(() => {
    const q = test?.questions[idx];
    if (!q) return;
    const add = (Date.now() - enteredAt.current) / 1000;
    enteredAt.current = Date.now();
    if (add < 1) return;
    const total = (answersRef.current[q.qid]?.timeSpentSec || 0) + add;
    update(q.qid, { timeSpentSec: total });
  }, [test, idx, update]);

  useEffect(() => {
    const onUnload = () => { commitTime(); flush({ keepalive: true }); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [commitTime, flush]);

  // ---- submit
  const submit = useCallback(async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    commitTime();
    try {
      await flush();
      await api(`/attempts/${attemptId}/submit`, { method: 'POST' });
      nav(`/results/${attemptId}`, { replace: true, state: { auto } });
    } catch (e) {
      submittedRef.current = false;
      setSubmitting(false);
      alert(`Could not submit: ${e.message}. Check your connection and try again.`);
    }
  }, [attemptId, commitTime, flush, nav]);

  // ---- timer
  useEffect(() => {
    if (!attemptId) return;
    const tick = () => {
      const left = (deadlineRef.current - (Date.now() + offsetRef.current)) / 1000;
      setRemaining(Math.max(0, left));
      if (left <= 0) submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [attemptId, submit]);

  // ---- navigation
  const qs = test?.questions || [];
  const go = useCallback((i) => {
    if (i < 0 || i >= qs.length || i === idx) return;
    commitTime();
    setIdx(i);
    update(qs[i].qid, { visited: true }, false);
    setPaletteOpen(false);
  }, [qs, idx, commitTime, update]);

  const q = qs[idx];
  const a = (q && answers[q.qid]) || {};

  useEffect(() => {
    const onKey = (e) => {
      if (!q || confirming || e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      const byNum = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 }[k];
      const opt = byNum !== undefined ? q.options[byNum] : q.options.find((o) => o.key.toLowerCase() === k);
      if (opt) update(q.qid, { selected: opt.key });
      else if (e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, idx, go, update, confirming]);

  const counts = useMemo(() => {
    const c = { answered: 0, flagged: 0, unanswered: 0 };
    for (const qq of qs) {
      const s = answers[qq.qid] || {};
      if (s.selected) c.answered++; else c.unanswered++;
      if (s.flagged) c.flagged++;
    }
    return c;
  }, [qs, answers]);

  if (loadErr) return <div className="container"><ErrorBox error={loadErr} /></div>;
  if (!test || remaining === null) return <Spinner label="Preparing your test…" />;

  const sectionName = (id) => test.sections.find((s) => s.id === id)?.name;
  const low = remaining < 300;

  return (
    <div className="exam">
      <header className="exam-bar">
        <div className="exam-title">{test.title}</div>
        <div className={`save ${saveState}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Offline – retrying' : 'Saved'}</div>
        <div className={`timer ${low ? 'low' : ''}`} aria-live="polite">⏱ {fmtDuration(remaining)}</div>
        <button className="btn sm show-sm" onClick={() => setPaletteOpen((o) => !o)}>Questions</button>
        <button className="btn primary sm" onClick={() => setConfirming(true)} disabled={submitting}>Submit</button>
      </header>

      {test.sections.length > 1 && (
        <div className="section-tabs">
          {test.sections.map((s) => {
            const first = qs.findIndex((x) => x.section === s.id);
            return (
              <button key={s.id} className={q.section === s.id ? 'active' : ''} onClick={() => go(first)} disabled={first < 0}>
                {s.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="exam-body">
        <section className="question-pane">
          <div className="q-head">
            <span className="q-num">Question {idx + 1} <span className="muted">of {qs.length}</span></span>
            <span className="muted small">{sectionName(q.section)}</span>
          </div>
          <Rich text={q.text} className="q-text" />
          {q.image && <img className="q-img" src={q.image} alt={`Figure for question ${idx + 1}`} />}
          <div className="options" role="radiogroup">
            {q.options.map((o) => (
              <label key={o.key} className={`option ${a.selected === o.key ? 'selected' : ''}`}>
                <input type="radio" name={q.qid} checked={a.selected === o.key} onChange={() => update(q.qid, { selected: o.key })} />
                <span className="opt-key">{o.key.toUpperCase()}</span>
                <span className="opt-body">
                  <Rich text={o.text} as="span" />
                  {o.image && <img src={o.image} alt={`Option ${o.key}`} />}
                </span>
              </label>
            ))}
          </div>
          <div className="q-actions">
            <button className="btn" onClick={() => go(idx - 1)} disabled={idx === 0}>← Previous</button>
            <button className="btn ghost" onClick={() => update(q.qid, { selected: null })} disabled={!a.selected}>Clear</button>
            <button className={`btn ${a.flagged ? 'flag-on' : ''}`} onClick={() => update(q.qid, { flagged: !a.flagged })}>
              {a.flagged ? '★ Marked' : '☆ Mark for review'}
            </button>
            <div className="spacer" />
            {idx < qs.length - 1 ? (
              <button className="btn primary" onClick={() => go(idx + 1)}>Next →</button>
            ) : (
              <button className="btn primary" onClick={() => setConfirming(true)}>Finish</button>
            )}
          </div>
        </section>

        <aside className={`palette ${paletteOpen ? 'open' : ''}`}>
          <div className="legend">
            <span><i className="dot answered" />Answered {counts.answered}</span>
            <span><i className="dot skipped" />Not answered {counts.unanswered}</span>
            <span><i className="dot flagged" />Marked {counts.flagged}</span>
          </div>
          {test.sections.map((s) => (
            <div key={s.id}>
              {test.sections.length > 1 && <div className="palette-sec">{s.name}</div>}
              <div className="palette-grid">
                {qs.map((qq, i) => qq.section !== s.id ? null : (
                  <button key={qq.qid} className={`pq ${statusOf(answers[qq.qid] || {})} ${i === idx ? 'current' : ''}`} onClick={() => go(i)}>
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>
      </div>

      {confirming && (
        <div className="modal-bg" onClick={() => !submitting && setConfirming(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2>Submit test?</h2>
            <div className="stats-row">
              <div><b>{counts.answered}</b><span>Answered</span></div>
              <div><b>{counts.unanswered}</b><span>Not answered</span></div>
              <div><b>{counts.flagged}</b><span>Marked</span></div>
            </div>
            <p className="muted">Time left: {fmtDuration(remaining)}. You can't change answers after submitting.</p>
            <div className="row-end">
              <button className="btn" onClick={() => setConfirming(false)} disabled={submitting}>Keep working</button>
              <button className="btn primary" onClick={() => submit(false)} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
