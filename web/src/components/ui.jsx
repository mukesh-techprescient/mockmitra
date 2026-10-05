export const Spinner = ({ label = 'Loading…' }) => <div className="muted pad">{label}</div>;

export const ErrorBox = ({ error, onRetry }) =>
  error ? (
    <div className="alert error">
      {error.message}
      {error.details?.length ? <ul>{error.details.map((d, i) => <li key={i}><code>{d}</code></li>)}</ul> : null}
      {onRetry && <button className="btn sm" onClick={onRetry}>Retry</button>}
    </div>
  ) : null;

export const fmtDuration = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

export const fmtDate = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
