import assert from 'node:assert/strict';
import { chartAxisLabel, parseLocalDateISO } from './chartAxisLabels.js';
import { getDownloadsPerDay } from './dashboardAggregator.js';

test('parseLocalDateISO', () => {
  const d = parseLocalDateISO('2025-06-15');
  assert.equal(d.getFullYear(), 2025);
  assert.equal(d.getMonth(), 5);
  assert.equal(d.getDate(), 15);
});

test('7-day mode uses actual weekday from dateISO', () => {
  // 2026-07-01 is Wednesday
  assert.equal(chartAxisLabel('2026-07-01', 6, 7, 'vi'), 'T4');
  assert.equal(chartAxisLabel('2026-07-01', 6, 7, 'en'), 'Wed');
  // 2025-06-01 is Sunday
  assert.equal(chartAxisLabel('2025-06-01', 0, 7, 'vi'), 'CN');
  assert.equal(chartAxisLabel('2025-06-02', 1, 7, 'vi'), 'T2');
});

test('7-day window last column is today with matching weekday label', () => {
  const nowMs = new Date(2026, 6, 1, 15, 0, 0).getTime(); // local 2026-07-01 Wed
  const out = getDownloadsPerDay([], { days: 7, nowMs });
  assert.equal(out.length, 7);
  assert.equal(out[out.length - 1].dateISO, '2026-07-01');
  assert.equal(chartAxisLabel(out[6].dateISO, 6, 7, 'vi'), 'T4');
});

test('30-day mode labels sparse slots only', () => {
  assert.equal(chartAxisLabel('2025-06-01', 0, 30, 'vi'), '01/06');
  assert.equal(chartAxisLabel('2025-06-02', 1, 30, 'vi'), '');
  assert.equal(chartAxisLabel('2025-06-08', 7, 30, 'vi'), '08/06');
  assert.equal(chartAxisLabel('2025-06-30', 29, 30, 'vi'), '30/06');
});

test('30-day dense mode labels every day', () => {
  assert.equal(chartAxisLabel('2025-06-02', 1, 30, 'vi', { dense: true }), '02/06');
  assert.equal(chartAxisLabel('2025-06-03', 2, 30, 'vi', { dense: false }), '');
});
