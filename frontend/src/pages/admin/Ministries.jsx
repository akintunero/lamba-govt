import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api.js';

export default function AdminMinistries({ token }) {
  const [ministries, setMinistries] = useState([]);

  useEffect(() => {
    apiFetch('/admin/ministries', { token })
      .then((data) => setMinistries(data.ministries || []))
      .catch(() => setMinistries([]));
  }, [token]);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold">Ministry registry</h2>
      <div className="mt-6 space-y-4">
        {ministries.map((m) => (
          <article key={m.id} className="rounded-xl border border-slate-800 p-4">
            <h3 className="font-medium">{m.name} ({m.acronym})</h3>
            <p className="mt-1 text-sm text-slate-400">{m.employees?.length || 0} staff · {m.documents?.length || 0} documents</p>
          </article>
        ))}
      </div>
    </section>
  );
}
