import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';

export default function CitizenDashboard({ token }) {
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const me = await apiFetch('/employees/me', { token });
        setProfile(me);
      } catch (err) {
        if (err.message !== 'Session expired. Please log in again.') {
          setProfile(null);
        }
      } finally {
        setLoadingProfile(false);
      }
      try {
        const data = await apiFetch('/requests', { token });
        setRequests(Array.isArray(data) ? data : data.logs || []);
      } catch (err) {
        if (err.message !== 'Session expired. Please log in again.') {
          setRequests([]);
        }
      } finally {
        setLoadingRequests(false);
      }
    }
    load();
  }, [token]);

  if (loadingProfile && loadingRequests) {
    return <LoadingSpinner message="Loading your dashboard..." />;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Service overview</h2>
        <p className="mt-2 text-slate-600">Manage identity verification, document requests, and ministry services.</p>
      </section>
      {profile && (
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="font-medium">Linked profile</h3>
          <p className="mt-2 text-sm text-slate-600">{profile.name} &middot; {profile.role} &middot; {profile.ministry?.acronym}</p>
        </section>
      )}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h3 className="font-medium">Recent document requests</h3>
        <ul className="mt-4 space-y-2 text-sm">
          {loadingRequests ? (
            <li className="text-slate-500">Loading...</li>
          ) : requests.length === 0 ? (
            <li className="text-slate-500">No requests submitted.</li>
          ) : (
            requests.map((r) => (
              <li key={r.id} className="flex justify-between border-b border-slate-100 py-2">
                <span>{r.documentType}</span>
                <span className="text-slate-500">{r.status}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
