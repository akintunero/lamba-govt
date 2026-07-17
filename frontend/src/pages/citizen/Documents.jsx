import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api.js';
import SearchPanel from '../../components/SearchPanel.jsx';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';

export default function CitizenDocuments({ token }) {
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewingId, setViewingId] = useState(null);

  useEffect(() => {
    apiFetch('/documents')
      .then(setDocuments)
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false));
  }, []);

  async function openDocument(id) {
    setViewingId(id);
    setSelected(null);
    setError('');
    try {
      const doc = await apiFetch(`/documents/${id}`);
      setSelected(doc);
    } catch (err) {
      setError(err.message);
    } finally {
      setViewingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <SearchPanel token={token} index="documents" title="Document search" placeholder="Search documents..." />
      <SearchPanel token={token} index="citizens" title="Citizen lookup" placeholder="Search citizens..." />
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Document catalogue</h2>
          {loading ? (
            <div className="py-8"><LoadingSpinner message="Loading documents..." /></div>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{doc.title}</p>
                    <p className="text-xs text-slate-500">{doc.classification} &middot; {doc.ministry}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openDocument(doc.id)}
                    disabled={viewingId === doc.id}
                    className="text-sm text-teal-700 hover:text-teal-800 disabled:text-slate-400"
                  >
                    {viewingId === doc.id ? 'Loading...' : 'Open'}
                  </button>
                </li>
              ))}
              {documents.length === 0 && (
                <li className="py-4 text-center text-sm text-slate-400">No documents available.</li>
              )}
            </ul>
          )}
        </section>
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="font-medium">Document viewer</h3>
          {!selected && !error && (
            <p className="mt-4 text-sm text-slate-500">Select a document to view details.</p>
          )}
          {selected && (
            <div className="mt-4 space-y-2 text-sm">
              <p className="font-medium">{selected.title}</p>
              <p className="text-xs text-slate-500">
                {selected.classification}
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 font-mono text-xs text-slate-700">
                {selected.content || JSON.stringify(selected, null, 2)}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
