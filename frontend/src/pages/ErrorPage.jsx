import React from 'react';
import { Link } from 'react-router-dom';

const ERROR_CONFIGS = {
  404: {
    title: 'Page not found',
    emoji: '404',
    description: 'The page you are looking for does not exist or has been moved.',
    action: 'Return to portal'
  },
  403: {
    title: 'Access denied',
    emoji: '403',
    description: 'You do not have permission to access this resource.',
    action: 'Go back'
  },
  500: {
    title: 'Server error',
    emoji: '500',
    description: 'An unexpected error occurred. Our team has been notified.',
    action: 'Try again'
  }
};

export default function ErrorPage({ code = 404, message }) {
  const config = ERROR_CONFIGS[code] || ERROR_CONFIGS[500];

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md text-center">
        <div className="text-6xl font-bold text-slate-300">{config.emoji}</div>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">{config.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{message || config.description}</p>
        <Link
          to="/portal"
          className="mt-6 inline-flex items-center rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
        >
          {config.action}
        </Link>
      </div>
    </div>
  );
}
