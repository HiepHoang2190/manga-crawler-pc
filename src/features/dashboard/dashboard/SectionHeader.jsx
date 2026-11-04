import React from 'react';

export default function SectionHeader({ label, action }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <div className="text-[10px] uppercase tracking-wider text-on-surface-variant/70 font-medium">
        {label}
      </div>
      {action}
    </div>
  );
}
