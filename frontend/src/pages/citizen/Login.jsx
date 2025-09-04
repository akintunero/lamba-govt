import React, { useState } from 'react';
import { apiFetch } from '../../api.js';

const KEYCLOAK_ENABLED = import.meta.env.VITE_KEYCLOAK_URL;

export default function CitizenLogin({ onLogin }) {
  const [email, setEmail] = useState('student@gov.lamba');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: { email, password, clientType: 'citizen' }
      });
      onLogin(data.token, data.user, data.refreshToken);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-widest text-teal-700">Citizen access</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in to Lamba Digital Services</h1>
        {KEYCLOAK_ENABLED && <p className="mt-2 text-xs text-slate-500">Enterprise identity (Keycloak)</p>}
        {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <label className="mt-6 block text-sm">
          Email
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mt-4 block text-sm">
          Password
          <input type="password" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" className="mt-6 w-full rounded-md bg-teal-700 px-4 py-2 text-white">Sign in</button>
      </form>
    </div>
  );
}
