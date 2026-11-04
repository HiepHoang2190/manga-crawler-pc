import React from 'react';

/**
 * Responsive KPI tile row. Children handle their own content.
 */
export default function KpiTilesRow({ children }) {
  return (
    <div className="grid grid-cols-2 min-[900px]:grid-cols-3 xl:grid-cols-6 gap-3">
      {children}
    </div>
  );
}
