import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { request, getToken, setToken, getEnv, setEnv, onUnauthorized } from '../api/client';

const AuthContext = createContext(null);
const EnvContext = createContext('prod');

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [env, setEnvState] = useState(getEnv);
  const [booting, setBooting] = useState(true);

  // Resume an existing session if the stored token is still good.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) { setBooting(false); return; }
      try {
        const me = await request('/auth/me', { env });
        if (!cancelled) setUser(me);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
    // Runs once: a later env change must not re-run the resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => onUnauthorized(() => { setToken(null); setUser(null); qc.clear(); }), [qc]);

  const login = useCallback(async (username, password) => {
    const data = await request('/auth/login', { method: 'POST', body: { username, password }, env });
    setToken(data.token);
    setUser(data.user);
    qc.clear();
    return data.user;
  }, [env, qc]);

  const logout = useCallback(async () => {
    try { await request('/audit', { method: 'POST', body: { action: 'LOGOUT', entity: 'session', details: 'Signed out' } }); }
    catch { /* signing out must not fail because the audit write did */ }
    setToken(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  // Switching environment swaps the whole dataset: drop every cached query so
  // nothing from the previous environment can be shown against the new one.
  const switchEnv = useCallback((next) => {
    setEnv(next);
    setEnvState(next);
    qc.clear();
  }, [qc]);

  const value = useMemo(() => ({ user, setUser, login, logout, env, switchEnv, booting }),
    [user, login, logout, env, switchEnv, booting]);

  return (
    <AuthContext.Provider value={value}>
      <EnvContext.Provider value={env}>{children}</EnvContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
export const useEnv = () => useContext(EnvContext);
