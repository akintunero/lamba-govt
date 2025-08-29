import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch('/documents');
        setDocuments(data);
      } catch (err) {
        setError(err.message || 'Failed to load documents');
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Documents</h2>
        <p className="text-xs text-gray-500">
          Policies, memos, grants and passport-related documents across ministries.
        </p>
      </div>
      {error && (
        <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          {error}
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-md overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-700">ID</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Title</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Type</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Classification</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Ministry</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-b last:border-b-0">
                <td className="px-3 py-1.5 text-gray-700">{d.id}</td>
                <td className="px-3 py-1.5 text-gray-900">{d.title}</td>
                <td className="px-3 py-1.5 text-gray-700">{d.type}</td>
                <td className="px-3 py-1.5 text-gray-700">{d.classification}</td>
                <td className="px-3 py-1.5 text-gray-700">{d.ministry}</td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan="5" className="px-3 py-3 text-center text-gray-400">
                  No documents found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-500">
        Document IDs are sequential to support training scenarios such as ID-based access tests.
      </div>
    </div>
  );
}

