const TOKEN_KEY = 'mockmitra.token';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.details = body?.details;
  }
}

export async function api(path, { method = 'GET', body, keepalive } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), keepalive });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('mockmitra:logout'));
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
