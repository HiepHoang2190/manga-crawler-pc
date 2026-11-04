/**
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
  if (!open) return null;

  const showList = listTitle || listLoading || listItems.length > 0 || listHint;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kpi-detail-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[min(85vh,560px)] rounded-xl border border-outline-variant/20 bg-surface-container-high shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 overflow-y-auto flex-1 min-h-0">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-primary text-[28px] leading-none shrink-0">
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="kpi-detail-title" className="text-base font-bold text-on-surface">
                {title}
              </h2>
              <p className="mt-2 text-3xl font-semibold tabular-nums leading-tight text-on-surface">
                {value}
              </p>
              {rows.length > 0 ? (
                <dl className="mt-4 flex flex-col gap-2.5">
                  {rows.map((row) => (
                    <div key={row.label} className="flex flex-col gap-0.5">
                      <dt className="text-[10px] uppercase tracking-wide text-on-surface-variant/75 font-medium">
                        {row.label}
                      </dt>
                      <dd className="text-sm text-on-surface break-all">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {showList ? (
                <div className="mt-4">
                  {listTitle ? (
                    <div className="text-[10px] uppercase tracking-wide text-on-surface-variant/75 font-medium mb-2">
                      {listTitle}
                    </div>
                  ) : null}
                  {listHint ? (
                    <p className="text-xs text-on-surface-variant/65 mb-2 leading-snug">{listHint}</p>
                  ) : null}
                  {listLoading ? (
                    <div className="flex items-center gap-2.5 text-sm text-on-surface-variant/70 py-2">
                      <span
                        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
                        aria-hidden="true"
                      />
                      <span>{listLoadingLabel}</span>
                    </div>
                  ) : listItems.length === 0 ? (
                    <div className="text-sm text-on-surface-variant/70 py-2">{listEmptyLabel}</div>
                  ) : (
                    <ol className="max-h-52 overflow-y-auto custom-scrollbar rounded-lg border border-outline-variant/15 divide-y divide-outline-variant/10">
                      {listItems.map((item, idx) => (
                        <li
                          key={`${item.title}-${idx}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-on-surface" data-tooltip={item.title}>
                            <span className="text-on-surface-variant/60 tabular-nums mr-1.5">
                              {idx + 1}.
                            </span>
                            {item.title}
                          </span>
                          <span className="shrink-0 tabular-nums font-medium text-on-surface">
                            {item.value}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5 shrink-0 border-t border-outline-variant/10 pt-3">
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
