import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api.js';
import SearchPanel from '../../components/SearchPanel.jsx';

export default function CitizenDocuments({ token }) {
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    apiFetch('/documents').then(setDocuments).catch(() => setDocuments([]));
  }, []);

  async function openDocument(id) {
    const doc = await apiFetch(`/documents/${id}`);
    setSelected(doc);
  }

  return (
    <div className="space-y-6">
      <SearchPanel token={token} index="documents" title="Document search" placeholder="Search documents…" />
      <SearchPanel token={token} index="citizens" title="Citizen lookup" placeholder="Search citizens…" />
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Document catalogue</h2>
        <ul className="mt-4 divide-y divide-slate-100">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{doc.title}</p>
                <p className="text-xs text-slate-500">{doc.classification} · {doc.ministry}</p>
              </div>
              <button type="button" onClick={() => openDocument(doc.id)} className="text-sm text-teal-700">Open</button>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h3 className="font-medium">Document viewer</h3>
        {!selected && <p className="mt-4 text-sm text-slate-500">Select a document to view details.</p>}
        {selected && (
          <div className="mt-4 space-y-2 text-sm">
            <p className="font-medium">{selected.title}</p>
            <p className="text-slate-500">{selected.classification}</p>
            <p className="whitespace-pre-wrap text-slate-700">{selected.content}</p>
          </div>
        )}
      </section>
    </div>
    </div>
  );
}
