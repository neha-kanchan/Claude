import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCollection } from '../api/queries';
import { PAGES } from '../lib/perms';
import { Avatar, Button } from './ui';
import { usePermissions } from '../lib/usePermissions';

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sma:theme', theme);
  }, [theme]);
  return (
    <Button variant="ghost" size="sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Toggle theme">
      {theme === 'dark' ? '☀️' : '🌙'}
    </Button>
  );
}

export function Layout() {
  const { user, logout, env, switchEnv } = useAuth();
  const { can } = usePermissions();
  const { data: requests = [] } = useCollection('requests', { enabled: !!user });
  const { data: notifications = [] } = useCollection('notifications', { enabled: !!user });
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  const pending = requests.filter((r) => ['Submitted', 'Under Review'].includes(r.status)).length;
  const unread = notifications.filter((n) => !n.read).length;
  const visible = PAGES.filter((p) => can(p.id));

  let lastSection = null;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      {navOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setNavOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col overflow-y-auto px-3 py-4 transition-transform lg:static lg:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--pine)', color: '#F2F1E8' }}>
        <div className="mb-4 flex items-center gap-2 px-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] text-base"
            style={{ background: 'linear-gradient(135deg,#3F8B6C,#C98A2B)' }}>⚓</span>
          SMA Housing
        </div>

        <nav className="flex-1">
          {visible.map((p) => {
            const header = p.section !== lastSection ? (lastSection = p.section) : null;
            const badge = p.id === 'requests' ? pending : p.id === 'notifications' ? unread : 0;
            return (
              <div key={p.id}>
                {header && (
                  <div className="mt-4 mb-1 px-2 text-[0.68rem] font-bold uppercase tracking-wider opacity-50">{header}</div>
                )}
                <NavLink to={'/' + p.id}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors ${isActive ? 'font-semibold' : 'opacity-80 hover:opacity-100'}`}
                  style={({ isActive }) => (isActive ? { background: 'rgba(255,255,255,.13)' } : undefined)}>
                  <span aria-hidden="true">{p.icon}</span>
                  <span className="flex-1">{p.label}</span>
                  {badge > 0 && (
                    <span className="tnum rounded-full px-1.5 py-0.5 text-[0.68rem] font-bold"
                      style={{ background: 'var(--amber)', color: '#25200F' }}>{badge}</span>
                  )}
                </NavLink>
              </div>
            );
          })}
        </nav>

        <div className="mt-4 rounded-lg p-2.5" style={{ background: 'rgba(0,0,0,.22)' }}>
          <label className="mb-1 block text-[0.68rem] font-bold uppercase tracking-wider opacity-60" htmlFor="envpick">
            Environment
          </label>
          <select id="envpick" value={env} onChange={(e) => switchEnv(e.target.value)}
            className="w-full rounded-md px-2 py-1.5 text-sm"
            style={{ background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
            <option value="prod">Production</option>
            <option value="test">Non-Production</option>
          </select>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b px-3 py-2.5 sm:px-5"
          style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu">☰</Button>

          {env !== 'prod' && (
            <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-bold"
              style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>NON-PRODUCTION</span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden items-center gap-2 sm:flex">
              <Avatar name={user?.name} size={32} />
              <div className="leading-tight">
                <div className="text-sm font-semibold">{user?.name}</div>
                <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{user?.role}</div>
              </div>
            </div>
            <Button size="sm" onClick={logout}>Sign out</Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-3 sm:p-5"><Outlet /></main>
      </div>
    </div>
  );
}
