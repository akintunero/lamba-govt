import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

export default function PassportServicesPage({ token }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch('/employees/me', { token });
        setProfile(data);
      } catch (err) {
        setError(err.message || 'Failed to load passport services');
      }
    }
    load();
  }, [token]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Passport Services</h2>
        <p className="text-xs text-gray-500">
          View passport and national identity details for the logged-in employee record.
        </p>
      </div>
      {error && (
        <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          {error}
        </div>
      )}
      {profile && (
        <div className="bg-white border border-gray-200 rounded-md p-4 text-sm space-y-2">
          <div>
            <div className="text-xs text-gray-500">Name</div>
            <div className="font-medium text-gray-900">{profile.name}</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500">Ministry</div>
              <div className="text-gray-900">{profile.ministryId}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Role</div>
              <div className="text-gray-900">{profile.role}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500">Passport number</div>
              <div className="font-mono text-gray-900">{profile.passport}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">National Identity Number (NIN)</div>
              <div className="font-mono text-gray-900">{profile.nin}</div>
            </div>
          </div>
          <div className="text-xs text-gray-500 border-t pt-2 mt-2">
            These identifiers are intentionally exposed for training purposes in this sandbox and
            do not represent real individuals.
          </div>
        </div>
      )}
      {!profile && !error && (
        <div className="text-xs text-gray-400">No linked employee profile for this account.</div>
      )}
    </div>
  );
}

