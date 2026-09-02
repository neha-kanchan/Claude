import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Login } from './auth/Login';
import { Layout } from './components/Layout';
import { usePermissions } from './lib/usePermissions';
import { PAGES } from './lib/perms';

const Dashboard     = lazy(() => import('./pages/Dashboard'));
const Students      = lazy(() => import('./pages/Students'));
const StudentDetail = lazy(() => import('./pages/StudentDetail'));
const Attendance    = lazy(() => import('./pages/Attendance'));
const Movements     = lazy(() => import('./pages/Movements'));
const Violations    = lazy(() => import('./pages/Violations'));
const Complaints    = lazy(() => import('./pages/Complaints'));
const Requests      = lazy(() => import('./pages/Requests'));
const Documents     = lazy(() => import('./pages/Documents'));
const Calendar      = lazy(() => import('./pages/Calendar'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Reports       = lazy(() => import('./pages/Reports'));
const Audit         = lazy(() => import('./pages/Audit'));
const MasterData    = lazy(() => import('./pages/MasterData'));
const RolesUsers    = lazy(() => import('./pages/RolesUsers'));
const Integration   = lazy(() => import('./pages/Integration'));

function Splash({ label = 'Loading…' }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{label}</p>
    </div>
  );
}

/* A page the current role cannot view is not merely hidden in the nav - routing
   to it directly lands on the first page the role can actually open. */
function Guarded({ page, children }) {
  const { can, isLoading } = usePermissions();
  if (isLoading) return <Splash />;
  if (!can(page)) {
    const fallback = PAGES.find((p) => can(p.id));
    return <Navigate to={fallback ? '/' + fallback.id : '/dashboard'} replace />;
  }
  return children;
}

const guarded = (page, element) => <Guarded page={page}>{element}</Guarded>;

export function App() {
  const { user, booting } = useAuth();
  if (booting) return <Splash label="Restoring your session…" />;
  if (!user) return <Login />;

  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"     element={guarded('dashboard', <Dashboard />)} />
          <Route path="/students"      element={guarded('students', <Students />)} />
          <Route path="/students/:id"  element={guarded('students', <StudentDetail />)} />
          <Route path="/attendance"    element={guarded('attendance', <Attendance />)} />
          <Route path="/movements"     element={guarded('movements', <Movements />)} />
          <Route path="/violations"    element={guarded('violations', <Violations />)} />
          <Route path="/complaints"    element={guarded('complaints', <Complaints />)} />
          <Route path="/requests"      element={guarded('requests', <Requests />)} />
          <Route path="/documents"     element={guarded('documents', <Documents />)} />
          <Route path="/calendar"      element={guarded('calendar', <Calendar />)} />
          <Route path="/notifications" element={guarded('notifications', <Notifications />)} />
          <Route path="/reports"       element={guarded('reports', <Reports />)} />
          <Route path="/audit"         element={guarded('audit', <Audit />)} />
          <Route path="/master"        element={guarded('master', <MasterData />)} />
          <Route path="/roles"         element={guarded('roles', <RolesUsers />)} />
          <Route path="/integration"   element={guarded('integration', <Integration />)} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
