import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl } from '../api.js';
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
  const [paused, setPaused] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [sectionResults, setSectionResults] = useState({}); // section id -> { result, statuses } once submitted
  const [secConfirm, setSecConfirm] = useState(null); // section id waiting for confirmation
  const [secBusy, setSecBusy] = useState(false);
  const [scored, setScored] = useState(null); // section id whose score card is showing

  const pending = useRef(new Map());
  const flushTimer = useRef(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const idxRef = useRef(0);
  idxRef.current = idx;
  const enteredAt = useRef(Date.now());
  const deadlineRef = useRef(0);
  const offsetRef = useRef(0);
  const submittedRef = useRef(false);
  const resultsRef = useRef(sectionResults);
  resultsRef.current = sectionResults;
  const sectionOf = useRef({}); // qid -> section id
  // Answers in a submitted section are locked.
  const isLocked = (qid) => !!resultsRef.current[sectionOf.current[qid]];
  const byResults = (list = []) => Object.fromEntries(list.map((r) => [r.section, r]));

  // ---- load / resume. While paused the server sends no questions.
  const applyPayload = useCallback(({ attempt, test, serverNow }) => {
    setTest(test);
    setAttemptId(attempt._id);
    setPaused(attempt.paused);
    setSectionResults(byResults(attempt.sectionResults));
    if (test.questions?.length) sectionOf.current = Object.fromEntries(test.questions.map((x) => [x.qid, x.section]));
    offsetRef.current = serverNow - Date.now();
    deadlineRef.current = new Date(attempt.deadline).getTime();
    setRemaining(attempt.remainingMs / 1000);
    const map = {};
    for (const a of attempt.answers) map[a.qid] = { selected: a.selected, flagged: a.flagged, timeSpentSec: a.timeSpentSec, visited: !!(a.selected || a.flagged || a.timeSpentSec) };
    if (test.questions?.length) {
      const saved = test.questions.findIndex((x) => x.qid === attempt.lastQid);
      const at = saved >= 0 ? saved : Math.min(idxRef.current, test.questions.length - 1); // back to where you paused
      map[test.questions[at].qid] = { ...map[test.questions[at].qid], visited: true };
      setIdx(at);
    }
    setAnswers(map);
    enteredAt.current = Date.now();
  }, []);

  useEffect(() => {
    api('/attempts', { method: 'POST', body: { testId } }).then(applyPayload).catch(setLoadErr);
  }, [testId, applyPayload]);

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
    if (isLocked(qid) && ('selected' in patch || 'flagged' in patch)) return;
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
    if (persist && !isLocked(qid)) {
      const { visited, ...server } = patch;
      if (Object.keys(server).length) queue(qid, server);
    }
  }, [queue]);

  // Record time spent on the question we're leaving.
  const commitTime = useCallback(() => {
    const q = test?.questions?.[idx];
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

  // ---- submit one section early: lock it and show its score
  const submitSection = useCallback(async (sid) => {
    setSecBusy(true);
    commitTime();
    try {
      await flush();
      if (pending.current.size) throw new Error('your latest answers are not saved yet');
      const d = await api(`/attempts/${attemptId}/sections/${sid}/submit`, { method: 'POST' });
      if (d.finished) {
        submittedRef.current = true;
        nav(`/results/${attemptId}`, { replace: true });
        return;
      }
      setSectionResults(byResults(d.attempt.sectionResults));
      setSecConfirm(null);
      setScored(sid);
    } catch (e) {
      alert(`Could not submit this section: ${e.message}. Check your connection and try again.`);
    } finally {
      setSecBusy(false);
    }
  }, [attemptId, commitTime, flush, nav]);

  // ---- pause / resume
  const pause = useCallback(async () => {
    setPauseBusy(true);
    commitTime();
    try {
      await flush();
      const { attempt } = await api(`/attempts/${attemptId}/pause`, { method: 'POST', body: { qid: test?.questions?.[idx]?.qid } });
      setPaused(true);
      setRemaining(attempt.remainingMs / 1000);
      setConfirming(false);
      setPaletteOpen(false);
      setTest(({ questions, ...meta }) => meta); // drop the questions until resumed
    } catch (e) {
      alert(`Could not pause: ${e.message}`);
    } finally {
      setPauseBusy(false);
    }
  }, [attemptId, commitTime, flush, test, idx]);

  const resume = useCallback(async () => {
    setPauseBusy(true);
    try {
      applyPayload(await api(`/attempts/${attemptId}/resume`, { method: 'POST' }));
    } catch (e) {
      alert(`Could not resume: ${e.message}`);
    } finally {
      setPauseBusy(false);
    }
  }, [attemptId, applyPayload]);

  // ---- timer (stopped while paused)
  useEffect(() => {
    if (!attemptId || paused) return;
    const tick = () => {
      const left = (deadlineRef.current - (Date.now() + offsetRef.current)) / 1000;
      setRemaining(Math.max(0, left));
      if (left <= 0) submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [attemptId, paused, submit]);

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
      if (!q || confirming || secConfirm || scored || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      const byNum = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 }[k];
      const opt = byNum !== undefined ? q.options[byNum] : q.options.find((o) => o.key.toLowerCase() === k);
      if (opt) update(q.qid, { selected: opt.key });
      else if (e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, idx, go, update, confirming, secConfirm, scored]);

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

  if (paused) {
    const answered = Object.values(answers).filter((a) => a.selected).length;
    const total = Object.keys(answers).length;
    return (
      <div className="paused-wrap">
        <div className="card paused-card">
          <div className="paused-icon" aria-hidden><i /><i /></div>
          <h1>Your test is paused</h1>
          <p className="muted">{test.title}</p>
          <div className="stats-row">
            <div><b>{fmtDuration(remaining)}</b><span>Time left (stopped)</span></div>
            <div><b>{answered}/{total}</b><span>Answered</span></div>
          </div>
          <p className="muted small">
            Questions are hidden while paused. Your answers are saved — you can sign out and resume later from any device.
          </p>
          <div className="row-center">
            <button className="btn" onClick={() => nav('/')} disabled={pauseBusy}>Exit to tests</button>
            <button className="btn primary" onClick={resume} disabled={pauseBusy}>{pauseBusy ? 'Resuming…' : '▶ Resume test'}</button>
          </div>
        </div>
      </div>
    );
  }

  const sectionName = (id) => test.sections.find((s) => s.id === id)?.name;
  const low = remaining < 300;
  const liveSections = test.sections.filter((s) => qs.some((x) => x.section === s.id));
  const lockedHere = sectionResults[q.section];
  const qStatus = lockedHere?.statuses[q.qid]; // correct | incorrect | unattempted, once its section is submitted
  const sectionCounts = (sid) => {
    const c = { answered: 0, unanswered: 0, flagged: 0 };
    for (const qq of qs) {
      if (qq.section !== sid) continue;
      const st = answers[qq.qid] || {};
      if (st.selected) c.answered++; else c.unanswered++;
      if (st.flagged) c.flagged++;
    }
    return c;
  };
  const nextOpen = (sid) => {
    const order = liveSections.map((s) => s.id);
    const after = [...order.slice(order.indexOf(sid) + 1), ...order.slice(0, order.indexOf(sid))];
    const target = after.find((x) => !sectionResults[x]);
    return target ? qs.findIndex((x) => x.section === target) : -1;
  };
  const STATUS_LABEL = { correct: 'Correct', incorrect: 'Wrong', unattempted: 'Not answered' };

  return (
    <div className="exam">
      <header className="exam-bar">
        <div className="exam-title">{test.title}</div>
        <div className={`save ${saveState}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Offline – retrying' : 'Saved'}</div>
        <div className={`timer ${low ? 'low' : ''}`} aria-live="polite">⏱ {fmtDuration(remaining)}</div>
        <button className="btn sm show-sm" onClick={() => setPaletteOpen((o) => !o)}>Questions</button>
        <button className="btn sm" onClick={pause} disabled={submitting || pauseBusy} title="Stop the clock and hide the questions"><span className="pause-glyph" aria-hidden><i /><i /></span>Pause</button>
        <button className="btn primary sm" onClick={() => setConfirming(true)} disabled={submitting}>Submit</button>
      </header>

      {test.sections.length > 1 && (
        <div className="section-bar">
        <div className="section-tabs">
          {test.sections.map((s) => {
            const first = qs.findIndex((x) => x.section === s.id);
            const done = sectionResults[s.id];
            return (
              <button key={s.id} className={q.section === s.id ? 'active' : ''} onClick={() => go(first)} disabled={first < 0}>
                {s.name}
                {done && <span className="sec-score" title="Section submitted">✓ {done.result.score}/{done.result.maxScore}</span>}
              </button>
            );
          })}
        </div>
        {!lockedHere && liveSections.length > 1 && (
          <button className="btn sm sec-submit" onClick={() => setSecConfirm(q.section)} disabled={submitting || secBusy}>
            Submit {sectionName(q.section)}
          </button>
        )}
        </div>
      )}

      <div className="exam-body">
        <section className="question-pane">
          <div className="q-head">
            <span className="q-num">Question {idx + 1} <span className="muted">of {qs.length}</span></span>
            <span className="muted small">{sectionName(q.section)}</span>
          </div>
          {lockedHere && (
            <div className={`locked-note ${qStatus}`}>
              <b>{STATUS_LABEL[qStatus]}</b> · {sectionName(q.section)} is submitted ({lockedHere.result.score}/{lockedHere.result.maxScore}). Answers can't be changed; the solution is shown after the test.
            </div>
          )}
          <Rich text={q.text} className="q-text" />
          {q.image && <img className="q-img" src={assetUrl(q.image)} alt={`Figure for question ${idx + 1}`} />}
          <div className={`options ${lockedHere ? 'review locked' : ''}`} role="radiogroup">
            {q.options.map((o) => (
              <label key={o.key} className={`option ${a.selected === o.key ? (lockedHere ? (qStatus === 'correct' ? 'right' : 'wrong') : 'selected') : ''}`}>
                <input type="radio" name={q.qid} checked={a.selected === o.key} disabled={!!lockedHere} onChange={() => update(q.qid, { selected: o.key })} />
                <span className="opt-key">{o.key.toUpperCase()}</span>
                <span className="opt-body">
                  <Rich text={o.text} as="span" />
                  {o.image && <img src={assetUrl(o.image)} alt={`Option ${o.key}`} />}
                </span>
              </label>
            ))}
          </div>
          <div className="q-actions">
            <button className="btn" onClick={() => go(idx - 1)} disabled={idx === 0}>← Previous</button>
            <button className="btn ghost" onClick={() => update(q.qid, { selected: null })} disabled={!a.selected || !!lockedHere}>Clear</button>
            <button className={`btn ${a.flagged ? 'flag-on' : ''}`} onClick={() => update(q.qid, { flagged: !a.flagged })} disabled={!!lockedHere}>
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
            {Object.keys(sectionResults).length > 0 && (
              <span className="muted small">Submitted sections: <i className="dot correct" />correct <i className="dot incorrect" />wrong</span>
            )}
          </div>
          {test.sections.map((s) => (
            <div key={s.id}>
              {test.sections.length > 1 && <div className="palette-sec">{s.name}</div>}
              <div className="palette-grid">
                {qs.map((qq, i) => qq.section !== s.id ? null : (
                  <button key={qq.qid} onClick={() => go(i)}
                    className={`pq ${sectionResults[s.id] ? `locked ${sectionResults[s.id].statuses[qq.qid]}` : statusOf(answers[qq.qid] || {})} ${i === idx ? 'current' : ''}`}>
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>
      </div>

      {secConfirm && (() => {
        const c = sectionCounts(secConfirm);
        const last = liveSections.every((s) => s.id === secConfirm || sectionResults[s.id]);
        return (
          <div className="modal-bg" onClick={() => !secBusy && setSecConfirm(null)}>
            <div className="modal card" onClick={(e) => e.stopPropagation()}>
              <h2>Submit {sectionName(secConfirm)}?</h2>
              <div className="stats-row">
                <div><b>{c.answered}</b><span>Answered</span></div>
                <div><b>{c.unanswered}</b><span>Not answered</span></div>
                <div><b>{c.flagged}</b><span>Marked</span></div>
              </div>
              <p className="muted">
                You'll see your {sectionName(secConfirm)} score now, and you can't change these answers afterwards.
                {last ? ' This is the last section, so this submits the whole test.' : ' The timer keeps running for the other sections.'}
              </p>
              <div className="row-end">
                <button className="btn" onClick={() => setSecConfirm(null)} disabled={secBusy}>Keep working</button>
                <button className="btn primary" onClick={() => submitSection(secConfirm)} disabled={secBusy}>{secBusy ? 'Submitting…' : last ? 'Submit test' : 'Submit section'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {scored && sectionResults[scored] && (() => {
        const r = sectionResults[scored].result;
        const next = nextOpen(scored);
        return (
          <div className="modal-bg" onClick={() => setScored(null)}>
            <div className="modal card section-score" onClick={(e) => e.stopPropagation()}>
              <div className="muted small">{sectionName(scored)} submitted</div>
              <div className="score-big"><b>{r.score}</b><span>/ {r.maxScore}</span></div>
              <div className="stats-row">
                <div><b className="ok-t">{r.correct}</b><span>Correct</span></div>
                <div><b className="bad-t">{r.incorrect}</b><span>Wrong</span></div>
                <div><b>{r.unattempted}</b><span>Not answered</span></div>
              </div>
              <p className="muted small">The questions are marked right or wrong in the palette. Solutions are shown after you submit the test.</p>
              <div className="row-end">
                {next >= 0
                  ? <button className="btn primary" onClick={() => { setScored(null); go(next); }}>Go to {sectionName(qs[next].section)} →</button>
                  : <button className="btn primary" onClick={() => setScored(null)}>Continue</button>}
              </div>
            </div>
          </div>
        );
      })()}

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
