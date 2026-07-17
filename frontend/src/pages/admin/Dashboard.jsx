import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api.js';
import SearchPanel from '../../components/SearchPanel.jsx';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';

export default function AdminDashboard({ token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/admin/dashboard', { token })
      .then((data) => setStats(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <LoadingSpinner message="Loading platform metrics..." />;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Platform overview</h2>
        <p className="mt-2 text-slate-400">Operational metrics across citizen services and ministry workflows.</p>
      </section>
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Citizens', stats.citizens],
            ['Document requests', stats.requests],
            ['Grant records', stats.grants]
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{value != null ? value : '—'}</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <SearchPanel token={token} index="audit" title="Audit search" placeholder="Search audit logs..." />
        <SearchPanel token={token} index="reports" title="Compliance search" placeholder="Search reports..." />
      </div>
    </div>
  );
}
