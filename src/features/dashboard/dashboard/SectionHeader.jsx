import React from 'react';
import { SectionTitle } from '../../../shared';

export default function SectionHeader({ label, action }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <SectionTitle>
        {label}
      </SectionTitle>
      {action}
    </div>
  );
}
