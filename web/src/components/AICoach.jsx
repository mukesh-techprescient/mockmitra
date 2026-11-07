import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Rich from './Rich.jsx';

const POLL_MS = 4000;

// Request an AI report (overall or for one paper) and follow it until it is written.
// `report` is the latest report shown on the page (may be pending/failed); `onReady` reloads the page data.
export function ReportRequest({ path, report, ai, onReady, label, again }) {
  const [job, setJob] = useState(report?.status === 'pending' ? report : null);
  const [error, setError] = useState(report?.status === 'failed' ? report.error : '');
  const [starting, setStarting] = useState(false);
  const timer = useRef();

  useEffect(() => {
    if (!job || job.status !== 'pending') return undefined;
    const started = new Date(job.createdAt).getTime();
    timer.current = setTimeout(async () => {
      try {
        const { report: r } = await api(`/insights/reports/${job._id}`);
        if (r.status === 'pending') return setJob({ ...r });
        setJob(null);
        if (r.status === 'failed') setError(r.error || 'The AI coach could not finish this report.');
        else onReady?.();
      } catch (e) {
        setError(e.message);
        setJob(null);
      }
    }, Date.now() - started < 20000 ? POLL_MS : POLL_MS * 1.5);
    return () => clearTimeout(timer.current);
  }, [job, onReady]);

  if (!ai?.enabled) return null;
  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const { report: r } = await api(path, { method: 'POST' });
      if (r.status === 'failed') setError(r.error);
      else setJob(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  };

  if (job) {
    return (
      <div className="ai-pending card">
        <span className="ai-dot" aria-hidden="true" />
        <div>
          <b>{job.title}</b>
          <div className="muted small">This usually takes about a minute. You can leave this page and come back.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="ai-request">
      <button className="btn primary" onClick={start} disabled={starting || ai.reportsLeft <= 0}>
        {starting ? 'Starting…' : report ? again : label}
      </button>
      <span className="muted small">
        {ai.reportsLeft <= 0 ? 'Daily limit reached. Try again tomorrow.' : `${ai.reportsLeft} AI report${ai.reportsLeft === 1 ? '' : 's'} left today`}
      </span>
      {error && <div className="alert error">{error}</div>}
    </div>
  );
}

// Q&A with the AI coach about all papers (no attemptId) or one paper.
export function CoachChat({ attemptId, suggestions = [] }) {
  const q = attemptId ? `?attempt=${attemptId}` : '';
  const [messages, setMessages] = useState(null);
  const [ai, setAi] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef();

  useEffect(() => {
    let live = true;
    api(`/insights/chat${q}`)
      .then((d) => { if (live) { setMessages(d.messages); setAi(d.ai); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [q]);

  useEffect(() => { if (busy || messages?.length) end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy]);

  if (!ai?.enabled) return error ? <div className="alert error">{error}</div> : null;

  const ask = async (message) => {
    message = message.trim();
    if (!message || busy) return;
    setBusy(true);
    setError('');
    setMessages((m) => [...m, { role: 'user', content: message, pending: true }]);
    setText('');
    try {
      const d = await api('/insights/chat', { method: 'POST', body: { message, attemptId: attemptId || null } });
      setMessages(d.messages);
      setAi(d.ai);
    } catch (e) {
      setError(e.message);
      setMessages((m) => m.filter((x) => !x.pending));
      setText(message);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    await api(`/insights/chat${q}`, { method: 'DELETE' }).catch(() => {});
    setMessages([]);
  };

  return (
    <section className="card coach-chat">
      <div className="chat-head">
        <h3>Ask the coach</h3>
        {messages?.length > 0 && <button className="btn ghost sm" onClick={reset} disabled={busy}>New conversation</button>}
      </div>
      {messages === null ? <div className="muted small">Loading…</div> : (
        <div className="chat-log">
          {!messages.length && (
            <div className="muted small">
              Ask anything about {attemptId ? 'this paper: a question you got wrong, where your time went, what to revise' : 'your results: what to study next, a weak topic, your exam strategy'}.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'assistant' ? <Rich text={m.content} /> : <div className="rich">{m.content}</div>}
            </div>
          ))}
          {busy && <div className="msg assistant thinking"><span className="ai-dot" aria-hidden="true" /> Thinking…</div>}
          <div ref={end} />
        </div>
      )}
      {messages && !messages.length && suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={busy || ai.messagesLeft <= 0}>{s}</button>)}
        </div>
      )}
      {error && <div className="alert error">{error}</div>}
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <textarea id={`coach-q-${attemptId || 'all'}`} rows={2} maxLength={2000} value={text} disabled={busy || ai.messagesLeft <= 0}
          placeholder={ai.messagesLeft <= 0 ? 'Daily question limit reached. Try again tomorrow.' : 'Type your question…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); } }} />
        <button className="btn primary" disabled={busy || !text.trim() || ai.messagesLeft <= 0}>Ask</button>
      </form>
      <div className="muted small">{ai.messagesLeft} question{ai.messagesLeft === 1 ? '' : 's'} left today · The AI coach can make mistakes; check important answers against the explanations.</div>
    </section>
  );
}
