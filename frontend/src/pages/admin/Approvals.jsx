import React, { useState } from 'react';
import { apiFetch } from '../../api.js';

export default function AdminApprovals({ token }) {
  const [applicant, setApplicant] = useState('Lamba Education Trust');
  const [amount, setAmount] = useState('500000');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleApprove(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await apiFetch('/admin/grants/approve', {
        method: 'POST',
        token,
        body: { applicant, amount }
      });
      setResult(data.approval);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold">Grant approval workflow</h2>
      {error && <p className="mt-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}
      {result && <p className="mt-4 rounded-md bg-emerald-950 px-3 py-2 text-sm text-emerald-300">Grant {result.id} approved for {result.applicant}.</p>}
      <form onSubmit={handleApprove} className="mt-6 space-y-4">
        <label className="block text-sm">
          Applicant
          <input className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" value={applicant} onChange={(e) => setApplicant(e.target.value)} />
        </label>
        <label className="block text-sm">
          Amount
          <input className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <button type="submit" className="rounded-md bg-amber-500 px-4 py-2 text-slate-950">Approve grant</button>
      </form>
    </div>
  );
}
