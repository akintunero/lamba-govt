import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function LegacyMigration({ token }) {
  const [legacyData, setLegacyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [citizens, documents, cases, compliance, migrated] = await Promise.all([
        apiFetch('/legacy/v1/citizens', { token }).catch(() => ({ citizens: [] })),
        apiFetch('/legacy/v1/documents', { token }).catch(() => ({ documents: [] })),
        apiFetch('/legacy/v1/cases', { token }).catch(() => ({ cases: [] })),
        apiFetch('/legacy/v1/compliance', { token }).catch(() => ({ reports: [] })),
        apiFetch('/legacy/v1/migrated', { token }).catch(() => ({ records: [] }))
      ]);
      setLegacyData({ citizens, documents, cases, compliance, migrated });
    } catch {
      setLegacyData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  async function runMigration() {
    setSyncing(true);
    setMessage('');
    try {
      const result = await apiFetch('/legacy/v1/sync', { method: 'POST', token });
      setMessage(`Migration complete: ${result.migrated || 0} records synchronised.`);
      await load();
    } catch (err) {
      setMessage(`Migration failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <LoadingSpinner message="Loading legacy data..." />;

  const counts = legacyData ? {
    citizens: legacyData.citizens.citizens?.length || 0,
    documents: legacyData.documents.documents?.length || 0,
    cases: legacyData.cases.cases?.length || 0,
    compliance: legacyData.compliance.reports?.length || 0,
    migrated: legacyData.migrated.records?.length || 0
  } : {};

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-semibold">Legacy data migration</h2>
        <p className="mt-2 text-sm text-slate-400">
          The legacy system contains records from the pre-digital era. Migrate them to the new platform.
        </p>
      </section>

      {message && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${message.includes('failed') ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: 'Legacy citizens', value: counts.citizens },
          { label: 'Legacy documents', value: counts.documents },
          { label: 'Legacy cases', value: counts.cases },
          { label: 'Compliance reports', value: counts.compliance },
          { label: 'Already migrated', value: counts.migrated }
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={runMigration}
        disabled={syncing || counts.citizens === 0}
        className="rounded-lg bg-amber-500 px-6 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {syncing ? 'Migrating...' : `Migrate ${counts.citizens} records`}
      </button>

      {legacyData && legacyData.migrated.records?.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-3 font-medium">Migration history</h3>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {legacyData.migrated.records.map((r, i) => (
              <div key={i} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
                {r.table || r.type} · {r.recordId || r.id} · {r.status || 'migrated'}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
