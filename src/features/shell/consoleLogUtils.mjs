/**
 * Pure utilities for ConsolePanel filtering, counting, and clipboard export.
 */
import { normalizeSearchText } from './commandPaletteUtils.mjs';

export function countLogsByLevel(logs) {
  const list = Array.isArray(logs) ? logs : [];
  const counts = { all: list.length, error: 0, warn: 0, success: 0, info: 0 };
  for (const log of list) {
    const lvl = String(log?.level || 'info').toLowerCase();
    if (lvl === 'error') counts.error += 1;
    else if (lvl === 'warn') counts.warn += 1;
    else if (lvl === 'success') counts.success += 1;
    else counts.info += 1;
  }
  return counts;
}

export function countUnreadErrorsSince(logs, lastSeenTimestamp) {
  const list = Array.isArray(logs) ? logs : [];
  const cutoff = Number(lastSeenTimestamp || 0);
  let unread = 0;
  for (const log of list) {
    if (String(log?.level || '').toLowerCase() !== 'error') continue;
    if (Number(log?.t || 0) > cutoff) unread += 1;
  }
  return unread;
}

export function filterConsoleLogs(logs, { level = 'all', query = '' } = {}) {
  const list = Array.isArray(logs) ? logs : [];
  const targetLevel = String(level || 'all').toLowerCase();
  const needle = normalizeSearchText(query);

  return list.filter((log) => {
    const lvl = String(log?.level || 'info').toLowerCase();
    if (targetLevel !== 'all' && lvl !== targetLevel) return false;
    if (!needle) return true;
    const msgNorm = normalizeSearchText(log?.msg);
    const timeNorm = normalizeSearchText(log?.time);
    return msgNorm.includes(needle) || timeNorm.includes(needle);
  });
}

export function formatLogsForClipboard(logs) {
  const list = Array.isArray(logs) ? logs : [];
  return list
    .map((log) => {
      const time = log?.time ? `[${log.time}] ` : '';
      const level = String(log?.level || 'info').toUpperCase();
      return `${time}[${level}] ${String(log?.msg ?? '')}`;
    })
    .join('\n');
}
