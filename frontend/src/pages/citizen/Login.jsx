import React, { useState } from 'react';
import { apiFetch } from '../../api.js';

const KEYCLOAK_ENABLED = import.meta.env.VITE_KEYCLOAK_URL;

function validatePassword(password) {
  const errors = [];
  if (password.length < 8) errors.push('At least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('One uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('One lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('One number');
  return errors;
}

export default function CitizenLogin({ onLogin }) {
  const [email, setEmail] = useState('student@gov.lamba');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [lastLogin, setLastLogin] = useState(null);
  const [showPwRules, setShowPwRules] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const pwErrors = validatePassword(password);
    if (pwErrors.length > 0) {
      setError('Password: ' + pwErrors.join(', '));
      return;
    }
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: { email, password, clientType: 'citizen' }
      });
      if (data.user?.lastLoginAt) {
        setLastLogin({ at: data.user.lastLoginAt, ip: data.user.lastLoginIp });
      }
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

        {lastLogin && (
          <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Last login: {new Date(lastLogin.at).toLocaleString()}
            {lastLogin.ip ? ` from ${lastLogin.ip}` : ''}
          </div>
        )}

        <label className="mt-6 block text-sm">
          Email
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="mt-4 block text-sm">
          <div className="flex items-center justify-between">
            <span>Password</span>
            <button type="button" onClick={() => setShowPwRules(!showPwRules)} className="text-xs text-teal-600 hover:text-teal-700">
              Requirements
            </button>
          </div>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>

        {showPwRules && (
          <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="font-medium">Password must include:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li className={password.length >= 8 ? 'text-green-600' : ''}>At least 8 characters</li>
              <li className={/[A-Z]/.test(password) ? 'text-green-600' : ''}>One uppercase letter</li>
              <li className={/[a-z]/.test(password) ? 'text-green-600' : ''}>One lowercase letter</li>
              <li className={/[0-9]/.test(password) ? 'text-green-600' : ''}>One number</li>
            </ul>
          </div>
        )}

        <button type="submit" className="mt-6 w-full rounded-md bg-teal-700 px-4 py-2 text-white hover:bg-teal-800">
          Sign in
        </button>
      </form>
    </div>
  );
}
