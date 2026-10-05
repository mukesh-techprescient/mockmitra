import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('mockmitra:logout', onLogout);
    if (getToken()) api('/auth/me').then((d) => setUser(d.user)).catch(() => {}).finally(() => setReady(true));
    else setReady(true);
    return () => window.removeEventListener('mockmitra:logout', onLogout);
  }, []);

  const signIn = async (mode, body) => {
    const d = await api(`/auth/${mode}`, { method: 'POST', body });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  };
  const signOut = () => { setToken(null); setUser(null); };

  return <AuthCtx.Provider value={{ user, ready, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
