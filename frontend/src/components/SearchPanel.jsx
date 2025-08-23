import React, { useState } from 'react';
import { apiFetch } from '../../api.js';

export default function SearchPanel({ token, index, title, placeholder }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function runSearch(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/search/${index}?q=${encodeURIComponent(query)}`, { token });
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <form onSubmit={runSearch} className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="rounded-md bg-teal-700 px-4 py-2 text-sm text-white" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {results && (
        <div className="mt-3">
          <p className="text-xs text-slate-500">{results.total} results ({results.took}ms)</p>
          <ul className="mt-2 space-y-2">
            {results.hits?.slice(0, 5).map((hit) => (
              <li key={hit.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                {hit.firstName ? `${hit.firstName} ${hit.lastName || ''}` : hit.title || hit.action || hit.message || hit.id}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
