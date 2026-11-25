import React from 'react';

/**
 * Responsive KPI tile grid row.
 */
export default function KpiTilesRow({ children }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3.5">
      {children}
    </div>
  );
}
