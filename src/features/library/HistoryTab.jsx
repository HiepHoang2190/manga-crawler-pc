import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useDownload, QueueCoverThumb } from '../download';
import { loadPanelUi, savePanelUi } from '../../utils/panelUiPrefs';
import { formatChapterFolderName } from '../../utils/chapterFolderFormat';
import { historyRowsToCsv, triggerCsvDownload } from '../../utils/historyCsv';
import { SearchableSelect, EmptyState, StudioTable } from '../../shared';

/** Trạng thái hiển thị của một dòng lịch sử (khớp badge). */
function rowStatusKey(row) {
  if (row.skipped) return 'skipped';
  if (row.ok) return 'ok';
  return 'error';
}

/** Chuỗi đầy đủ — dùng cho tooltip / title. */
function formatWhenFull(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/** Chỉ ngày (vd. 3/31/2026); giờ đầy đủ xem qua title khi hover. */
function formatWhenShort(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Nội dung chi tiết lỗi (chỉ dùng khi dòng là error). */
function buildHistoryBugDetailText(row, { t, chapterFolder }) {
  const lines = [];
  lines.push(`${t('history.col.manga')}: ${row.mangaTitle || ''}`);
  lines.push(`${t('history.col.chapter')}: ${formatChapterFolderName(row.chapterTitle, chapterFolder)}`);
  lines.push(`${t('history.col.time')}: ${formatWhenFull(row.at)}`);
  if (row.message) lines.push(`${t('history.bugMessage')}: ${row.message}`);
  if (row.successCount != null && row.totalPages != null) {
    lines.push(`${t('history.pagesProgress')}: ${row.successCount}/${row.totalPages}`);
  }
  if (Array.isArray(row.failedPageIndices) && row.failedPageIndices.length) {
    lines.push(`${t('history.failedPages')}: ${row.failedPageIndices.join(', ')}`);
  }
  if (row.chapterUrl) lines.push(`${t('history.csvChapterUrl')}: ${row.chapterUrl}`);
  if (row.mangaUrl) lines.push(`${t('history.csvMangaUrl')}: ${row.mangaUrl}`);
  return lines.join('\n');
}

function StatusBadge({ ok, skipped, labels }) {
  if (skipped) {
    return (
      <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-surface-container-high text-on-surface-variant border border-outline-variant/20">
        {labels.skip}
      </span>
    );
  }
  if (ok) {
    return (
      <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
        {labels.ok}
      </span>
    );
  }
  return (
    <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-error/10 text-error border border-error/20">
      {labels.error}
    </span>
  );
}

const HISTORY_FILTERS = [
  { id: 'all', labelKey: 'history.filter.all', icon: 'filter_alt' },
  { id: 'error', labelKey: 'history.filter.error', icon: 'error' },
  { id: 'ok', labelKey: 'history.filter.ok', icon: 'check_circle' },
  { id: 'skipped', labelKey: 'history.filter.skipped', icon: 'block' },
];

const historyFilterBtnBase =
  'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer hover:brightness-110';

/** Cùng trọng lượng nét / không fill — khớp folder & delete trong một hàng. */
const historyActionIcon =
  "material-symbols-outlined text-[18px] leading-none [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";
const historyActionBtn =
  'inline-flex items-center justify-center py-1.5 px-1.5 rounded hover:bg-surface-container-highest cursor-pointer leading-none';

export default function HistoryTab({
  chapterFolder,
  onClearHistory,
  onRemoveHistoryEntry,
  onOpenChapterFolder,
  onFetchHistoryEntry,
  onReadHistoryEntry,
  onAddToQueue,
  onAddAllErrorsToQueue,
}) {
  const { t } = useI18n();
  const { downloadHistory: history = [] } = useDownload();
  const [statusFilter, setStatusFilter] = useState(() => loadPanelUi().history.statusFilter);
  const [query, setQuery] = useState('');
  const [detailRow, setDetailRow] = useState(null);
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    savePanelUi({ history: { statusFilter } });
  }, [statusFilter]);

  const filteredHistory = useMemo(() => {
    let list = history;
    if (statusFilter !== 'all') {
      list = list.filter((row) => rowStatusKey(row) === statusFilter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (row) =>
          String(row.mangaTitle || '').toLowerCase().includes(q) ||
          String(row.chapterTitle || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [history, statusFilter, query]);

  const filteredErrors = useMemo(
    () => filteredHistory.filter((row) => rowStatusKey(row) === 'error'),
    [filteredHistory]
  );

  /** Chỉ các dòng lỗi — dùng cho CSV log bug. */
  const bugHistoryRows = useMemo(
    () => history.filter((row) => rowStatusKey(row) === 'error'),
    [history]
  );

  const badgeLabels = {
    ok: t('history.badge.ok'),
    skip: t('history.badge.skip'),
    error: t('history.badge.error'),
  };

  useEffect(() => {
    if (!detailRow) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDetailRow(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailRow]);

  const handleExportBugCsv = useCallback(() => {
    if (!bugHistoryRows.length) return;
    const headers = [
      t('history.col.time'),
      t('history.col.manga'),
      t('history.col.chapter'),
      t('history.bugMessage'),
      t('history.csvSuccessCount'),
      t('history.csvTotalPages'),
      t('history.csvFailedIndices'),
      t('history.csvChapterUrl'),
      t('history.csvMangaUrl'),
    ];
    const rows = bugHistoryRows.map((row) => [
      row.at || '',
      row.mangaTitle || '',
      formatChapterFolderName(row.chapterTitle, chapterFolder),
      row.message || '',
      row.successCount != null ? String(row.successCount) : '',
      row.totalPages != null ? String(row.totalPages) : '',
      Array.isArray(row.failedPageIndices) ? row.failedPageIndices.join(';') : '',
      row.chapterUrl || '',
      row.mangaUrl || '',
    ]);
    const csv = historyRowsToCsv(headers, rows);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(`manga-bug-log-${stamp}.csv`, csv);
  }, [bugHistoryRows, chapterFolder, t]);

  const handleCopyDetail = useCallback(async () => {
    if (!detailRow) return;
    const text = buildHistoryBugDetailText(detailRow, { t, chapterFolder });
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      /* ignore */
    }
  }, [detailRow, t, chapterFolder]);

  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden min-h-0">
      <div className="flex-1 flex flex-col px-6 pt-4 pb-6 gap-4 sm:px-8 overflow-hidden min-h-0">
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            {onAddAllErrorsToQueue && (
              <button
                type="button"
                disabled={filteredErrors.length === 0}
                onClick={() => onAddAllErrorsToQueue(filteredErrors)}
                data-tooltip={t('history.addAllErrorsToQueueTitle') || t('history.addAllErrorsToQueue')}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-highest text-primary hover:border-outline-variant/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[20px] leading-none">playlist_add</span>
              </button>
            )}
            <button
              type="button"
              disabled={!bugHistoryRows.length}
              onClick={handleExportBugCsv}
              data-tooltip={t('history.exportBugCsvTitle') || t('history.exportBugCsv')}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-highest text-primary hover:border-outline-variant/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[20px] leading-none">download</span>
            </button>
            <div className="h-6 w-px bg-outline-variant/30 mx-0.5 self-center" aria-hidden />
            <button
              type="button"
              disabled={!filteredHistory.length}
              onClick={() => onClearHistory?.(statusFilter)}
              aria-label={t('history.clear')}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-highest text-error/80 hover:text-error hover:border-error/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[20px] leading-none">delete_sweep</span>
            </button>
          </div>

          <div className="flex-1 flex h-11 items-center bg-surface-container-highest rounded-lg px-3 sm:px-4 max-w-xl border border-outline-variant/10 min-w-[200px]">
            <span className="material-symbols-outlined text-outline mr-2 sm:mr-3 shrink-0 text-[20px] leading-none">
              filter_list
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('history.searchPlaceholder')}
              className="min-h-0 h-8 bg-transparent border-none text-sm leading-normal focus:ring-0 p-0 w-full text-on-surface outline-none placeholder:text-outline"
            />
          </div>
          <div className="shrink-0">
            <SearchableSelect
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder=""
              options={HISTORY_FILTERS.map((f) => ({
                value: f.id,
                label: t(f.labelKey),
                materialIcon: f.icon,
              }))}
              className="min-w-[10.5rem]"
            />
          </div>
        </div>

        <StudioTable
          columns={[
            {
              key: 'cover',
              width: 'w-14',
              header: '',
              ariaLabel: t('history.col.cover'),
              headerClassName: 'p-3',
            },
            {
              key: 'manga',
              header: t('history.col.manga'),
              headerClassName: 'min-w-0 p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant',
            },
            {
              key: 'chapter',
              width: 'w-48',
              header: t('history.col.chapter'),
              headerClassName: 'w-48 min-w-0 p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant',
            },
            {
              key: 'time',
              width: 'w-36',
              header: t('history.col.time'),
              headerClassName: 'w-36 min-w-0 p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant',
            },
            {
              key: 'status',
              width: 'w-28',
              header: t('history.col.status'),
              align: 'center',
              headerClassName: 'w-28 min-w-0 p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant text-center',
            },
            {
              key: 'actions',
              width: 'w-40',
              header: '',
              ariaLabel: t('history.col.openAria'),
              align: 'right',
              headerClassName: 'w-40 p-3 pr-4 sm:pr-5 border-none text-right',
            },
          ]}
          data={filteredHistory}
          keyExtractor={(row) => row.id}
          emptyState={
            history.length === 0 ? (
              <EmptyState
                icon="history"
                title={t('history.empty')}
              />
            ) : (
              <EmptyState
                icon="search_off"
                title={t('history.emptyFiltered')}
              />
            )
          }
          rowClassName={(_row, i) =>
            `${i % 2 === 0 ? 'bg-surface' : 'bg-surface-container-low/30'} hover:bg-surface-container-high transition-colors`
          }
          renderRow={(row) => (
            <>
              <td className="p-2 sm:p-3 align-middle min-w-0 overflow-hidden w-14">
                <QueueCoverThumb
                  coverUrl={row.coverUrl || ''}
                  onFetch={
                    String(row.mangaUrl || '').trim()
                      ? () =>
                          onFetchHistoryEntry?.({
                            mangaUrl: String(row.mangaUrl).trim(),
                            siteId: row.siteId != null ? String(row.siteId) : '',
                          })
                      : undefined
                  }
                  fetchTitle={t('favorites.fetchTitle')}
                  frameClassName="w-10 h-13 shrink-0 rounded overflow-hidden bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center"
                />
              </td>
              <td className="min-w-0 overflow-hidden p-3 font-medium text-on-surface truncate">
                {row.mangaTitle}
              </td>
              <td className="w-48 min-w-0 overflow-hidden p-3 text-on-surface/80 truncate">
                <span className="block truncate">
                  {formatChapterFolderName(row.chapterTitle, chapterFolder)}
                </span>
              </td>
              <td
                className="w-36 min-w-0 overflow-hidden p-3 font-mono text-xs text-on-surface/60 truncate"
                data-tooltip={formatWhenFull(row.at)}
              >
                {formatWhenShort(row.at)}
              </td>
              <td className="w-28 min-w-0 overflow-hidden p-3 align-middle">
                <div className="flex justify-center items-center">
                  <StatusBadge ok={row.ok} skipped={row.skipped} labels={badgeLabels} />
                </div>
              </td>
              <td className="w-40 p-3 pr-4 sm:pr-5 align-middle text-right">
                <div className="flex items-center justify-end gap-1">
                  {rowStatusKey(row) === 'error' && onAddToQueue && (
                    <button
                      type="button"
                      onClick={() => onAddToQueue(row)}
                      className={`${historyActionBtn} text-primary`}
                      data-tooltip={t('history.addToQueueTitle')}
                      aria-label={t('history.addToQueueTitle')}
                    >
                      <span className={historyActionIcon}>add_to_queue</span>
                    </button>
                  )}
                  {rowStatusKey(row) === 'error' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCopyDone(false);
                        setDetailRow(row);
                      }}
                      className={`${historyActionBtn} text-error`}
                      data-tooltip={t('history.bugDetailOpenTitle')}
                      aria-label={t('history.bugDetailOpenTitle')}
                    >
                      <span className={historyActionIcon}>bug_report</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onReadHistoryEntry?.(row)}
                    className={`${historyActionBtn} text-primary`}
                    data-tooltip={t('mangaInfo.openReader')}
                    aria-label={t('mangaInfo.openReader')}
                  >
                    <span className={historyActionIcon}>auto_stories</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenChapterFolder?.(row.mangaTitle, row.chapterTitle, row.baseSaveDir)
                    }
                    className={`${historyActionBtn} text-primary`}
                    data-tooltip={t('history.openChapterTitle')}
                    aria-label={t('history.openChapterTitle')}
                  >
                    <span className={historyActionIcon}>folder_open</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveHistoryEntry?.(row.id)}
                    className={`${historyActionBtn} text-error`}
                    data-tooltip={t('history.removeEntryTitle')}
                    aria-label={t('history.removeEntryTitle')}
                  >
                    <span className={historyActionIcon}>delete</span>
                  </button>
                </div>
              </td>
            </>
          )}
        />
      </div>

      {detailRow && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-detail-title"
          onClick={() => setDetailRow(null)}
        >
          <div
            className="bg-surface max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col rounded-xl border border-outline-variant/20 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-outline-variant/15 shrink-0">
              <h2 id="history-detail-title" className="text-sm font-bold text-on-surface">
                {t('history.bugDetailTitle')}
              </h2>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar min-h-0 flex-1">
              <pre className="whitespace-pre-wrap break-words text-xs text-on-surface-variant font-mono leading-relaxed">
                {buildHistoryBugDetailText(detailRow, { t, chapterFolder })}
              </pre>
            </div>
            <div className="p-4 border-t border-outline-variant/15 flex flex-wrap gap-2 shrink-0 justify-end">
              <button
                type="button"
                onClick={handleCopyDetail}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary-container text-on-secondary-container hover:brightness-110"
              >
                {copyDone ? t('history.detailCopied') : t('history.detailCopy')}
              </button>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
              >
                {t('history.detailClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
