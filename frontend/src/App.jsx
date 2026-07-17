import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import CitizenLayout from './components/CitizenLayout.jsx';
import AdminLayout from './components/AdminLayout.jsx';

import CitizenLogin from './pages/citizen/Login.jsx';
import CitizenDashboard from './pages/citizen/Dashboard.jsx';
import CitizenDocuments from './pages/citizen/Documents.jsx';
import CitizenOnboarding from './pages/citizen/Onboarding.jsx';
import EmployeesPage from './pages/Employees.jsx';
import Sessions from './pages/citizen/Sessions.jsx';
import AdminLogin from './pages/admin/Login.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminMinistries from './pages/admin/Ministries.jsx';
import AdminApprovals from './pages/admin/Approvals.jsx';
import LegacyMigration from './pages/admin/LegacyMigration.jsx';

import ErrorPage from './pages/ErrorPage.jsx';
import { TOKEN_EXPIRY_EVENT } from './api.js';

function useAuth(storageKey) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.token && parsed.user) {
          setToken(parsed.token);
          setUser(parsed.user);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    setLoading(false);
  }, [storageKey]);

  const login = useCallback((newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    window.localStorage.setItem(storageKey, JSON.stringify({ token: newToken, user: newUser }));
  }, [storageKey]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { token, user, loading, login, logout };
}

function ProtectedRoute({ token, loading, redirectTo, children }) {
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700" />
          <p className="mt-3 text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }
  if (!token) {
    return <Navigate to={redirectTo} replace />;
  }
  return children;
}

export default function App() {
  const citizenAuth = useAuth('lamba_citizen_auth');
  const adminAuth = useAuth('lamba_admin_auth');
  const navigate = useNavigate();

  useEffect(() => {
    function handleTokenExpiry() {
      citizenAuth.logout();
      adminAuth.logout();
      navigate('/login');
    }
    window.addEventListener(TOKEN_EXPIRY_EVENT, handleTokenExpiry);
    return () => window.removeEventListener(TOKEN_EXPIRY_EVENT, handleTokenExpiry);
  }, [citizenAuth, adminAuth, navigate]);

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
          <ProtectedRoute token={citizenAuth.token} loading={citizenAuth.loading} redirectTo="/portal/login">
            <CitizenLayout user={citizenAuth.user} token={citizenAuth.token} onLogout={() => { citizenAuth.logout(); navigate('/portal/login'); }}>
              <Routes>
                <Route path="/" element={<CitizenDashboard token={citizenAuth.token} />} />
                <Route path="/documents" element={<CitizenDocuments token={citizenAuth.token} />} />
                <Route path="/onboarding" element={<CitizenOnboarding token={citizenAuth.token} />} />
                <Route path="/employees" element={<EmployeesPage token={citizenAuth.token} />} />
                <Route path="/sessions" element={<Sessions token={citizenAuth.token} />} />
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
          <ProtectedRoute token={adminAuth.token} loading={adminAuth.loading} redirectTo="/admin/login">
            <AdminLayout user={adminAuth.user} token={adminAuth.token} onLogout={() => { adminAuth.logout(); navigate('/admin/login'); }}>
              <Routes>
                <Route path="/" element={<AdminDashboard token={adminAuth.token} />} />
                <Route path="/ministries" element={<AdminMinistries token={adminAuth.token} />} />
                <Route path="/approvals" element={<AdminApprovals token={adminAuth.token} />} />
                <Route path="/legacy" element={<LegacyMigration token={adminAuth.token} />} />
              </Routes>
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route path="/login" element={<Navigate to="/portal/login" replace />} />
      <Route path="/403" element={<ErrorPage code={403} />} />
      <Route path="/500" element={<ErrorPage code={500} />} />
      <Route path="*" element={<ErrorPage code={404} />} />
    </Routes>
  );
}
