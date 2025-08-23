import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function AdminLayout({ user, onLogout, children }) {
  const location = useLocation();

  const links = [
    { to: '/admin', label: 'Overview' },
    { to: '/admin/ministries', label: 'Ministries' },
    { to: '/admin/approvals', label: 'Approvals' }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-400">Lamba Government Platform</p>
            <h1 className="text-lg font-semibold">Administration Console</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300">{user?.email}</span>
            <button type="button" onClick={onLogout} className="rounded-md bg-amber-500 px-3 py-1.5 text-sm text-slate-950">
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-6 px-6 pb-3 text-sm">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={location.pathname === link.to ? 'font-medium text-amber-400' : 'text-slate-400'}
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
