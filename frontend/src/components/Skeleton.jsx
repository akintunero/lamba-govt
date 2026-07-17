import React from 'react';

export function SkeletonLine({ width = '100%', className = '' }) {
  return (
    <div
      className={`h-4 animate-pulse rounded bg-slate-200 ${className}`}
      style={{ width }}
    />
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
      <SkeletonLine width="40%" className="mb-3" />
      <SkeletonLine width="75%" className="mb-2" />
      <SkeletonLine width="60%" className="mb-4" />
      <div className="flex gap-2">
        <SkeletonLine width="30%" />
        <SkeletonLine width="45%" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <SkeletonLine key={i} width={`${80 / cols}%`} />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-slate-100 px-4 py-3">
          {Array.from({ length: cols }).map((_, j) => (
            <SkeletonLine key={j} width={`${80 / cols}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}
