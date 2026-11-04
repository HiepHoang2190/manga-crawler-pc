/**
 * X-axis labels for daily trend bar charts.
 * @param {string} dateISO YYYY-MM-DD (local calendar day)
 * @param {number} index bucket index 0..total-1
 * @param {number} total bucket count (7 or 30)
 * @param {'vi'|'en'} locale
 * @param {{ dense?: boolean }} [opts] when dense, 30-day mode labels every day (scroll view)
 * @returns {string} label or '' when slot should stay blank (sparse 30-day mode)
 *
 * When total ≤ 7 (7-day window or one week page): label is the **actual weekday**
 * of [dateISO]. Buckets are ordered oldest → newest; the last column is always today.
 */
export function chartAxisLabel(dateISO, index, total, locale = 'vi', opts = {}) {
  const dense = opts?.dense === true;
  if (total <= 7) {
    const date = parseLocalDateISO(dateISO);
    if (!date) return '';
    return weekdayShortFromDate(date, locale);
  }

  const date = parseLocalDateISO(dateISO);
  if (!date) return '';

  // 30-day window: every day when dense (horizontal scroll), else sparse ticks.
  if (dense || index === 0 || index === total - 1 || index % 7 === 0) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return locale === 'en' ? `${mm}/${dd}` : `${dd}/${mm}`;
  }
  return '';
}

/** @param {string} dateISO */
export function parseLocalDateISO(dateISO) {
  if (typeof dateISO !== 'string') return null;
  const parts = dateISO.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

/** Mon..Sun labels from a local calendar [Date]. */
function weekdayShortFromDate(date, locale) {
  const dow = date.getDay(); // 0 Sun .. 6 Sat
  if (locale === 'en') {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow] ?? '';
  }
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow] ?? '';
}
