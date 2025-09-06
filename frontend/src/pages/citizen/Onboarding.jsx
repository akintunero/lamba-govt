import React, { useState } from 'react';
import { apiFetch } from '../../api.js';

export default function CitizenOnboarding({ token }) {
  const [form, setForm] = useState({
    nationalId: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const citizen = await apiFetch('/citizens/onboard', { method: 'POST', body: form });
      setResult(citizen);
      await apiFetch('/requests', {
        method: 'POST',
        token,
        body: { citizenId: citizen.id, documentType: 'national_id_card' }
      });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-2xl rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Citizen identity onboarding</h2>
      <p className="mt-2 text-sm text-slate-600">Register a citizen record and initiate document request workflow.</p>
      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {result && <p className="mt-4 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800">Citizen {result.nationalId} registered.</p>}
      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        {Object.keys(form).map((key) => (
          <label key={key} className="block text-sm capitalize">
            {key.replace(/([A-Z])/g, ' $1')}
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        <button type="submit" className="rounded-md bg-teal-700 px-4 py-2 text-white">Submit registration</button>
      </form>
    </div>
  );
}
