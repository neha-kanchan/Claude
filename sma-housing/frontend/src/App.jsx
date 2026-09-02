import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from './lib/store.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Students from './pages/Students.jsx';
import StudentDetail from './pages/StudentDetail.jsx';
import Attendance from './pages/Attendance.jsx';
import Movements from './pages/Movements.jsx';
import Violations from './pages/Violations.jsx';
import Complaints from './pages/Complaints.jsx';
import Requests from './pages/Requests.jsx';
import Documents from './pages/Documents.jsx';
import Calendar from './pages/Calendar.jsx';
import Notifications from './pages/Notifications.jsx';
import Reports from './pages/Reports.jsx';
import Audit from './pages/Audit.jsx';
import Master from './pages/Master.jsx';
import Roles from './pages/Roles.jsx';
import Integration from './pages/Integration.jsx';

/* A page the role cannot view falls back to the first page it can. */
function Guard({ page, children }) {
  const { can, pages } = useStore();
  if (can(page)) return children;
  const first = pages.find((p) => can(p.id));
  return <Navigate to={first ? first.path : '/'} replace />;
}

function Shell() {
  const { user, booting } = useStore();
  if (booting) return null;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Guard page="dashboard"><Dashboard /></Guard>} />
        <Route path="/students" element={<Guard page="students"><Students /></Guard>} />
        <Route path="/students/:id" element={<Guard page="students"><StudentDetail /></Guard>} />
        <Route path="/attendance" element={<Guard page="attendance"><Attendance /></Guard>} />
        <Route path="/movements" element={<Guard page="movements"><Movements /></Guard>} />
        <Route path="/violations" element={<Guard page="violations"><Violations /></Guard>} />
        <Route path="/complaints" element={<Guard page="complaints"><Complaints /></Guard>} />
        <Route path="/requests" element={<Guard page="requests"><Requests /></Guard>} />
        <Route path="/documents" element={<Guard page="documents"><Documents /></Guard>} />
        <Route path="/calendar" element={<Guard page="calendar"><Calendar /></Guard>} />
        <Route path="/notifications" element={<Guard page="notifications"><Notifications /></Guard>} />
        <Route path="/reports" element={<Guard page="reports"><Reports /></Guard>} />
        <Route path="/audit" element={<Guard page="audit"><Audit /></Guard>} />
        <Route path="/master" element={<Guard page="master"><Master /></Guard>} />
        <Route path="/roles" element={<Guard page="roles"><Roles /></Guard>} />
        <Route path="/integration" element={<Guard page="integration"><Integration /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </StoreProvider>
  );
}
