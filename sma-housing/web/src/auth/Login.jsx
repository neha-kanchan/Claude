import { useState } from 'react';
import { useAuth } from './AuthContext';
import { Button, Field, Input, useToast } from '../components/ui';

export function Login() {
  const { login, env, switchEnv } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await login(username.trim(), password); }
    catch (err) { setError(err.message || 'Sign-in failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative flex flex-col justify-between overflow-hidden p-8 lg:flex-[1.1] lg:p-14"
        style={{ background: 'var(--pine)', color: '#F2F1E8' }}>
        <div className="flex items-center gap-2.5 text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-[9px]"
            style={{ background: 'linear-gradient(135deg,#3F8B6C,#C98A2B)' }}>⚓</span>
          SMA Housing System
        </div>
        <h1 className="relative z-10 my-8 max-w-[22ch] text-3xl font-bold leading-tight lg:text-4xl">
          One place to run SMA student housing — from roll call to reports.
        </h1>
        <p className="relative z-10 max-w-[44ch] text-sm leading-relaxed opacity-75">
          Attendance &amp; movement · Violations · Complaints &amp; maintenance · Requests ·
          Documents · Audit trail — database-backed and built for API integration.
        </p>
        <div aria-hidden="true" className="pointer-events-none absolute -right-36 -bottom-36 h-[420px] w-[420px] rounded-full"
          style={{ border: '70px solid rgba(255,255,255,.05)' }} />
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <form onSubmit={submit} className="card w-full max-w-[400px] p-7">
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="mt-1 mb-5 text-sm" style={{ color: 'var(--ink-soft)' }}>Sign in with your SMA account.</p>

          <button type="button"
            onClick={() => toast('Set AUTH_MODE=entra and the ENTRA_* values in .env, then wire MSAL in the browser — see the README.')}
            className="field flex items-center justify-center gap-2 py-2.5 font-semibold">
            <svg width="17" height="17" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft Entra ID
          </button>

          <div className="my-4 flex items-center gap-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
            <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
            or sign in locally
            <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
          </div>

          <div className="grid gap-3">
            <Field label="Username">
              <Input value={username} onChange={(e) => setUsername(e.target.value)}
                autoComplete="username" placeholder="e.g. amal" required />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" required />
            </Field>
            <Field label="Environment">
              <select className="field" value={env} onChange={(e) => switchEnv(e.target.value)}>
                <option value="prod">Production</option>
                <option value="test">Non-Production</option>
              </select>
            </Field>

            {error && (
              <p role="alert" className="rounded-md px-3 py-2 text-sm"
                style={{ background: 'var(--brick-soft)', color: 'var(--brick)' }}>{error}</p>
            )}

            <Button type="submit" variant="primary" disabled={busy} className="w-full py-2.5">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </div>

          <p className="mt-5 text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Demo accounts — <strong>amal / admin123</strong> (Administrator) · sami / demo123 (Supervisor) ·
            ghada / demo123 (Security) · vera / demo123 (Viewer). Change these before real use.
          </p>
        </form>
      </div>
    </div>
  );
}
