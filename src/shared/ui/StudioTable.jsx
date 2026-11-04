import React from 'react';

/**
 * Standard StudioTable component ensuring 0px right margin gap,
 * fixed header, and synchronized colgroups across all table screens.
 */
export default function StudioTable({
  columns = [],
  data = [],
  keyExtractor,
  renderRow,
  renderSubRow,
  emptyState = null,
  loading = false,
  loadingText = 'Đang tải...',
  className = '',
  rowClassName,
  onRowClick,
  getRowProps,
}) {
  if (loading && (!data || data.length === 0)) {
    return (
      <div className={`min-h-0 min-w-0 flex-1 flex flex-col items-center justify-center rounded-xl border border-outline-variant/20 bg-surface shadow-sm ${className}`}>
        <p className="text-sm text-on-surface-variant text-center py-12">{loadingText}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`min-h-0 min-w-0 flex-1 flex flex-col items-center justify-center rounded-xl border border-outline-variant/20 bg-surface shadow-sm ${className}`}>
        {emptyState}
      </div>
    );
  }

  return (
    <div className={`min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden rounded-xl border border-outline-variant/20 bg-surface shadow-sm ${className}`}>
      {/* 1. Fixed Header */}
      <div className="bg-surface-container-high border-b border-outline-variant/20 shrink-0">
        <table className="w-full min-w-full table-fixed text-left text-xs sm:text-sm border-separate border-spacing-0">
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} className={col.width || undefined} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-surface-container-high">
              {columns.map((col) => {
                const alignClass =
                  col.align === 'center'
                    ? 'text-center'
                    : col.align === 'right'
                      ? 'text-right'
                      : col.align === 'left'
                        ? 'text-left'
                        : /(^|\s)text-(center|right|left)(\s|$)/.test(col.headerClassName || '')
                          ? ''
                          : 'text-left';
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-label={col.ariaLabel}
                    className={`border-none ${alignClass} ${
                      col.headerClassName ||
                      'p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant'
                    }`.trim()}
                  >
                    {col.header}
                  </th>
                );
              })}
            </tr>
          </thead>
        </table>
      </div>

      {/* 2. Scrollable Body */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full min-w-full table-fixed text-left text-xs sm:text-sm border-separate border-spacing-0">
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} className={col.width || undefined} />
            ))}
          </colgroup>
          <tbody className="divide-y divide-outline-variant/10">
            {data.map((item, index) => {
              const rowKey = keyExtractor ? keyExtractor(item, index) : index;
              const customClass = rowClassName ? rowClassName(item, index) : '';
              const zebraClass = index % 2 === 0 ? 'bg-surface' : 'bg-surface-container-low/30';
              const finalRowClass = customClass
                ? customClass
                : `transition-colors hover:bg-surface-container-high ${zebraClass}`;
              const extraRowProps = getRowProps ? getRowProps(item, index) : null;
              return (
                <React.Fragment key={rowKey}>
                  <tr
                    className={finalRowClass}
                    onClick={onRowClick ? () => onRowClick(item, index) : undefined}
                    {...extraRowProps}
                  >
                    {renderRow(item, index)}
                  </tr>
                  {renderSubRow ? renderSubRow(item, index) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
