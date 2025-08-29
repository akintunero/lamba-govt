import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

export default function DashboardPage({ token }) {
  const [stats, setStats] = useState({ ministries: 0, employees: 0, documents: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [ministries, employees, documents] = await Promise.all([
          apiFetch('/ministries', { token }),
          apiFetch('/employees', { token }),
          apiFetch('/documents')
        ]);
        setStats({
          ministries: ministries.length,
          employees: employees.length,
          documents: documents.length
        });
      } catch (err) {
        setError(err.message || 'Failed to load dashboard data');
      }
    }
    load();
  }, [token]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Dashboard</h2>
        <p className="text-xs text-gray-500">
          Overview of ministries, staff, and key documents in the gov.lamba portal.
        </p>
      </div>
      {error && (
        <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <div className="text-xs text-gray-500 mb-1">Ministries</div>
          <div className="text-2xl font-semibold text-gray-900">{stats.ministries}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <div className="text-xs text-gray-500 mb-1">Employees</div>
          <div className="text-2xl font-semibold text-gray-900">{stats.employees}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <div className="text-xs text-gray-500 mb-1">Documents</div>
          <div className="text-2xl font-semibold text-gray-900">{stats.documents}</div>
        </div>
      </div>
    </div>
  );
}

