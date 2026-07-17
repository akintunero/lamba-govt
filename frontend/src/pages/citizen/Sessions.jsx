import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function Sessions({ token }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/auth/sessions', { token })
      .then((data) => setSessions(Array.isArray(data) ? data : data.sessions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function revoke(sessionId) {
    try {
      await apiFetch(`/auth/sessions/${sessionId}`, { method: 'DELETE', token });
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    } catch {
      //
    }
  }

  if (loading) return <LoadingSpinner message="Loading sessions..." />;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Active sessions</h2>
        <p className="mt-1 text-sm text-slate-500">Manage devices and locations where you are signed in.</p>
      </section>

      <div className="space-y-3">
        {sessions.length === 0 && (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
            No active sessions.
          </div>
        )}
        {sessions.map((s) => (
          <div key={s.id || s.sessionId} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {s.userAgent || 'Unknown device'}
                </p>
                <p className="text-xs text-slate-400">
                  {s.ip ? `IP: ${s.ip}` : ''}
                  {s.createdAt ? ` · ${new Date(s.createdAt).toLocaleString()}` : ''}
                  {s.expiresAt ? ` · Expires ${new Date(s.expiresAt).toLocaleString()}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => revoke(s.sessionId)}
              className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
