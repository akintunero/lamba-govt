import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

export default function EmployeesPage({ token }) {
  const [employees, setEmployees] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch('/employees', { token });
        setEmployees(data);
      } catch (err) {
        setError(err.message || 'Failed to load employees');
      }
    }
    load();
  }, [token]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Employees</h2>
        <p className="text-xs text-gray-500">
          Staff directory for ministries across the fictional country of Lamba.
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
              <th className="px-3 py-2 text-left font-medium text-gray-700">Name</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Ministry</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Role</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Phone</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b last:border-b-0">
                <td className="px-3 py-1.5 text-gray-900">{e.name}</td>
                <td className="px-3 py-1.5 text-gray-700">{e.ministry}</td>
                <td className="px-3 py-1.5 text-gray-700">{e.role}</td>
                <td className="px-3 py-1.5 text-gray-700">{e.phone}</td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan="4" className="px-3 py-3 text-center text-gray-400">
                  No employees found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

