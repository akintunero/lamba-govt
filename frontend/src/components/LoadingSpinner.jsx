import React from 'react';

export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700" />
        <p className="mt-3 text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}

export function InlineSpinner() {
  return (
    <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700" />
  );
}
