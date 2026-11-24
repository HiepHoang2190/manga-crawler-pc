import { formatChapterFolderName } from './chapterFolderFormat.js';

/** Escape one CSV field (RFC-style: quote if needed). */
export function escapeCsvField(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function historyRowsToCsv(headers, rows) {
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return lines.join('\r\n');
}

export function triggerCsvDownload(filename, csvText) {
  const blob = new Blob(['\ufeff', csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Full localized timestamp for error details and tooltips. */
export function formatErrorTimeFull(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

/** Build plain-text error details shared by Queue and History bug modals. */
export function buildErrorDetailText(row, { t, chapterFolder } = {}) {
  const lines = [];
  lines.push(`${t('history.col.manga')}: ${row?.mangaTitle || ''}`);
  lines.push(`${t('history.col.chapter')}: ${formatChapterFolderName(row?.chapterTitle, chapterFolder)}`);
  if (row?.at) {
    lines.push(`${t('history.col.time')}: ${formatErrorTimeFull(row.at)}`);
  }
  const msg = row?.message || row?.downloadError || '';
  if (msg) lines.push(`${t('history.bugMessage')}: ${msg}`);
  if (row?.successCount != null && row?.totalPages != null) {
    lines.push(`${t('history.pagesProgress')}: ${row.successCount}/${row.totalPages}`);
  }
  if (Array.isArray(row?.failedPageIndices) && row.failedPageIndices.length) {
    lines.push(`${t('history.failedPages')}: ${row.failedPageIndices.join(', ')}`);
  }
  if (row?.chapterUrl) lines.push(`${t('history.csvChapterUrl')}: ${row.chapterUrl}`);
  if (row?.mangaUrl) lines.push(`${t('history.csvMangaUrl')}: ${row.mangaUrl}`);
  return lines.join('\n');
}

/** Export an array of error rows (History or Queue) as a UTF-8 BOM CSV download. */
export function exportErrorRowsToCsv(
  entries,
  { t, chapterFolder, filenamePrefix = 'manga-bug-log' } = {}
) {
  if (!Array.isArray(entries) || entries.length === 0) return false;
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
  const rows = entries.map((row) => [
    row.at || '',
    row.mangaTitle || '',
    formatChapterFolderName(row.chapterTitle, chapterFolder),
    row.message || row.downloadError || '',
    row.successCount != null ? String(row.successCount) : '',
    row.totalPages != null ? String(row.totalPages) : '',
    Array.isArray(row.failedPageIndices) ? row.failedPageIndices.join(';') : '',
    row.chapterUrl || '',
    row.mangaUrl || '',
  ]);
  const csv = historyRowsToCsv(headers, rows);
  const stamp = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(`${filenamePrefix}-${stamp}.csv`, csv);
  return true;
}
