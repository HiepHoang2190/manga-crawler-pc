import React, { useEffect } from 'react';

/**
 * Detail modal for inspecting a Dashboard KPI card (breakdown rows, ranking list, actions).
 *
 * @param {{
 *   open: boolean,
 *   title: string,
 *   value: React.ReactNode,
 *   rows?: Array<{ label: string, value: React.ReactNode }>,
 *   listTitle?: string,
 *   listItems?: Array<{ title: string, value: React.ReactNode }>,
 *   listLoading?: boolean,
 *   listEmptyLabel?: string,
 *   listLoadingLabel?: string,
 *   listHint?: string,
 *   icon?: string,
 *   onClose: () => void,
 *   closeLabel?: string,
 *   actions?: React.ReactNode,
 * }} props
 */
export default function KpiDetailDialog({
  open,
  title,
  value,
  rows = [],
  listTitle,
  listItems = [],
  listLoading = false,
  listEmptyLabel = '',
  listLoadingLabel = '',
  listHint = '',
  icon = 'insights',
  onClose,
  closeLabel = 'OK',
  actions,
}) {
  useEffect(() => {
    if (!open || typeof onClose !== 'function') return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const showList = listTitle || listLoading || listItems.length > 0 || listHint;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kpi-detail-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[min(85vh,580px)] rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 overflow-y-auto custom-scrollbar flex-1 min-h-0 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl border border-primary/20 bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px] leading-none">
                  {icon}
                </span>
              </div>
              <div className="min-w-0">
                <h2 id="kpi-detail-title" className="text-base font-bold text-on-surface truncate">
                  {title}
                </h2>
                <p className="text-2xl font-extrabold tabular-nums leading-tight text-on-surface mt-0.5">
                  {value}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-tooltip={closeLabel}
              aria-label={closeLabel}
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center border border-outline-variant/20 bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">close</span>
            </button>
          </div>

          {rows.length > 0 ? (
            <dl className="grid grid-cols-1 gap-2">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="rounded-xl border border-outline-variant/15 bg-surface-container-low/70 px-3.5 py-2.5 flex flex-col gap-0.5"
                >
                  <dt className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">
                    {row.label}
                  </dt>
                  <dd className="text-sm font-medium text-on-surface break-all">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {showList ? (
            <div className="space-y-2">
              {listTitle ? (
                <div className="text-[11px] uppercase tracking-wider text-on-surface-variant font-bold">
                  {listTitle}
                </div>
              ) : null}
              {listHint ? (
                <p className="text-xs text-on-surface-variant/75 leading-snug">{listHint}</p>
              ) : null}
              {listLoading ? (
                <div className="flex items-center gap-2.5 text-sm text-on-surface-variant/80 py-2">
                  <span
                    className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
                    aria-hidden="true"
                  />
                  <span>{listLoadingLabel}</span>
                </div>
              ) : listItems.length === 0 ? (
                <div className="text-sm text-on-surface-variant/70 py-2">{listEmptyLabel}</div>
              ) : (
                <ol className="max-h-56 overflow-y-auto custom-scrollbar rounded-xl border border-outline-variant/15 bg-surface-container-low/50 divide-y divide-outline-variant/10">
                  {listItems.map((item, idx) => (
                    <li
                      key={`${item.title}-${idx}`}
                      className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs sm:text-sm"
                    >
                      <span
                        className="min-w-0 truncate text-on-surface"
                        data-tooltip={item.title}
                      >
                        <span className="text-on-surface-variant/65 tabular-nums font-mono text-xs mr-2">
                          {idx + 1}.
                        </span>
                        {item.title}
                      </span>
                      <span className="shrink-0 tabular-nums font-semibold text-on-surface">
                        {item.value}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 shrink-0 border-t border-outline-variant/15 bg-surface-container-low/40">
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-9 rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 text-xs font-semibold text-on-surface hover:bg-surface-bright transition-colors cursor-pointer"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
