import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import CitizenLayout from './components/CitizenLayout.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import CitizenLogin from './pages/citizen/Login.jsx';
import CitizenDashboard from './pages/citizen/Dashboard.jsx';
import CitizenDocuments from './pages/citizen/Documents.jsx';
import CitizenOnboarding from './pages/citizen/Onboarding.jsx';
import AdminLogin from './pages/admin/Login.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminMinistries from './pages/admin/Ministries.jsx';
import AdminApprovals from './pages/admin/Approvals.jsx';
import EmployeesPage from './pages/Employees.jsx';

function useAuth(storageKey) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setToken(parsed.token);
        setUser(parsed.user);
      } catch {
        // ignore
      }
    }
  }, [storageKey]);

  function login(newToken, newUser) {
    setToken(newToken);
    setUser(newUser);
    window.localStorage.setItem(storageKey, JSON.stringify({ token: newToken, user: newUser }));
  }

  function logout() {
    setToken(null);
    setUser(null);
    window.localStorage.removeItem(storageKey);
  }

  return { token, user, login, logout };
}

function ProtectedRoute({ token, children }) {
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AdminProtectedRoute({ token, children }) {
  if (!token) {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
}

export default function App() {
  const citizenAuth = useAuth('lamba_citizen_auth');
  const adminAuth = useAuth('lamba_admin_auth');
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/portal" replace />} />

      <Route
        path="/portal/login"
        element={
          citizenAuth.token ? (
            <Navigate to="/portal" replace />
          ) : (
            <CitizenLogin
              onLogin={(token, user) => {
                citizenAuth.login(token, user);
                navigate('/portal');
              }}
            />
          )
        }
      />
      <Route
        path="/portal/*"
        element={
          <ProtectedRoute token={citizenAuth.token}>
            <CitizenLayout user={citizenAuth.user} onLogout={() => { citizenAuth.logout(); navigate('/portal/login'); }}>
              <Routes>
                <Route path="/" element={<CitizenDashboard token={citizenAuth.token} />} />
                <Route path="/documents" element={<CitizenDocuments token={citizenAuth.token} />} />
                <Route path="/onboarding" element={<CitizenOnboarding token={citizenAuth.token} />} />
                <Route path="/employees" element={<EmployeesPage token={citizenAuth.token} />} />
              </Routes>
            </CitizenLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/login"
        element={
          adminAuth.token ? (
            <Navigate to="/admin" replace />
          ) : (
            <AdminLogin
              onLogin={(token, user) => {
                adminAuth.login(token, user);
                navigate('/admin');
              }}
            />
          )
        }
      />
      <Route
        path="/admin/*"
        element={
          <AdminProtectedRoute token={adminAuth.token}>
            <AdminLayout user={adminAuth.user} onLogout={() => { adminAuth.logout(); navigate('/admin/login'); }}>
              <Routes>
                <Route path="/" element={<AdminDashboard token={adminAuth.token} />} />
                <Route path="/ministries" element={<AdminMinistries token={adminAuth.token} />} />
                <Route path="/approvals" element={<AdminApprovals token={adminAuth.token} />} />
              </Routes>
            </AdminLayout>
          </AdminProtectedRoute>
        }
      />

      <Route path="/login" element={<Navigate to="/portal/login" replace />} />
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  );
}
