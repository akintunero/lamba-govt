import React from 'react';
import { NavLink } from 'react-router-dom';

function Sidebar() {
  const linkClasses =
    'block px-3 py-2 rounded text-sm font-medium text-gray-100 hover:bg-blue-900 hover:text-white';

  return (
    <div className="h-full bg-govblue text-white flex flex-col">
      <div className="px-4 py-4 border-b border-blue-900">
        <div className="text-xs uppercase tracking-wide text-blue-100">gov.lamba</div>
        <div className="text-sm font-semibold">Ministries Portal</div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1 text-sm">
        <NavLink to="/" end className={({ isActive }) => (isActive ? `${linkClasses} bg-blue-900` : linkClasses)}>
          Dashboard
        </NavLink>
        <NavLink to="/ministries" className={({ isActive }) => (isActive ? `${linkClasses} bg-blue-900` : linkClasses)}>
          Ministries
        </NavLink>
        <NavLink to="/employees" className={({ isActive }) => (isActive ? `${linkClasses} bg-blue-900` : linkClasses)}>
          Employees
        </NavLink>
        <NavLink to="/documents" className={({ isActive }) => (isActive ? `${linkClasses} bg-blue-900` : linkClasses)}>
          Documents
        </NavLink>
        <NavLink
          to="/passport-services"
          className={({ isActive }) => (isActive ? `${linkClasses} bg-blue-900` : linkClasses)}
        >
          Passport Services
        </NavLink>
        <NavLink to="/challenges" className={({ isActive }) => (isActive ? `${linkClasses} bg-blue-900` : linkClasses)}>
          Challenges
        </NavLink>
      </nav>
    </div>
  );
}

function Header({ user, onLogout }) {
  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6">
      <div>
        <h1 className="text-base font-semibold text-gray-900">
          gov.lamba - Official Ministries Portal
        </h1>
        <p className="text-xs text-gray-500">
          Internal government dashboard for the fictional country of Lamba.
        </p>
      </div>
      <div className="flex items-center gap-3 text-sm">
        {user && (
          <div className="text-right">
            <div className="font-medium text-gray-900">{user.email}</div>
            <div className="text-xs text-gray-500">{user.role || 'User'}</div>
          </div>
        )}
        {user && (
          <button
            onClick={onLogout}
            className="ml-2 inline-flex items-center rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}

export default function Layout({ user, onLogout, children }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 hidden md:block">
        <Sidebar />
      </aside>
      <div className="flex-1 flex flex-col">
        <Header user={user} onLogout={onLogout} />
        <main className="flex-1 p-4 md:p-6">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

