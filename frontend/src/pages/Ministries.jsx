import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

export default function MinistriesPage({ token }) {
  const [ministries, setMinistries] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch('/ministries', { token });
        setMinistries(data);
      } catch (err) {
        setError(err.message || 'Failed to load ministries');
      }
    }
    load();
  }, [token]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Ministries</h2>
        <p className="text-xs text-gray-500">
          List of core government ministries in the fictional country of Lamba.
        </p>
      </div>
      {error && (
        <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          {error}
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-700">ID</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Acronym</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Name</th>
            </tr>
          </thead>
          <tbody>
            {ministries.map((m) => (
              <tr key={m.id} className="border-b last:border-b-0">
                <td className="px-3 py-1.5 text-gray-700">{m.id}</td>
                <td className="px-3 py-1.5 font-medium text-gray-900">{m.acronym}</td>
                <td className="px-3 py-1.5 text-gray-700">{m.name}</td>
              </tr>
            ))}
            {ministries.length === 0 && (
              <tr>
                <td colSpan="3" className="px-3 py-3 text-center text-gray-400">
                  No ministries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

