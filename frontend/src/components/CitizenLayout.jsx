import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell.jsx';

export default function CitizenLayout({ user, token, onLogout, children }) {
  const location = useLocation();

  const links = [
    { to: '/portal', label: 'Dashboard' },
    { to: '/portal/documents', label: 'Documents' },
    { to: '/portal/onboarding', label: 'Identity' },
    { to: '/portal/employees', label: 'Directory' },
    { to: '/portal/sessions', label: 'Sessions' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-teal-700">Lamba Digital Services</p>
            <h1 className="text-lg font-semibold">Citizen Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user?.email}</span>
            <NotificationBell token={token} />
            <button type="button" onClick={onLogout} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white">
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-6 pb-3 text-sm">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`whitespace-nowrap ${location.pathname === link.to ? 'font-medium text-teal-700' : 'text-slate-600 hover:text-slate-800'}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
