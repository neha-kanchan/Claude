import { useState } from 'react';
import { useStore } from '../lib/store.jsx';

export default function Login() {
  const { login, toast, toastMsg } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username || !password) return toast('Enter username and password');
    setBusy(true);
    try { await login(username.trim(), password); }
    catch (e) { toast(e.message || 'Sign-in failed'); }
    finally { setBusy(false); }
  };

  return (
    <div id="loginScreen" style={{ display: 'flex' }}>
      <div className="login-brand">
        <div className="brand-mark"><span className="dot">⚓</span> SMA Housing System</div>
        <h1>One place to run SMA student housing — from roll call to reports.</h1>
        <div className="foot">Attendance &amp; movement · Violations · Complaints &amp; maintenance · Requests · Documents · Audit trail — database-ready and built for API integration.</div>
      </div>
      <div className="login-panel">
        <div className="login-card">
          <h2>Sign in</h2>
          <p className="sub">Sign in with your SMA account.</p>
          <button className="sso-btn" onClick={() => toast('Set AUTH_MODE=entra and the ENTRA_* values in the backend .env, then wire MSAL in the browser — see README.')}>
            <svg width="17" height="17" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg> Sign in with Microsoft Entra ID
          </button>
          <div className="divider">or sign in locally</div>
          <div style={{ display: 'grid', gap: '.8rem' }}>
            <div>
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. amal" autoComplete="username" />
            </div>
            <div>
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="password" autoComplete="current-password" />
            </div>
            <button className="btn primary" style={{ justifyContent: 'center' }} onClick={submit} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
          <p style={{ fontSize: '.75rem', color: 'var(--ink-soft)', marginTop: '1rem' }}>
            Demo accounts — <strong>amal / admin123</strong> (Administrator) · sami / demo123 (Supervisor) · ghada / demo123 (Security) · vera / demo123 (Viewer).
          </p>
        </div>
      </div>
      <div id="toast" style={{ display: toastMsg ? 'block' : 'none' }}>{toastMsg}</div>
    </div>
  );
}
