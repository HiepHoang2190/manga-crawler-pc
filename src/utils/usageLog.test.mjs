import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

global.window = globalThis;

const {
  addUsageSeconds,
  getUsagePerDay,
  getUsageTodaySeconds,
  formatDurationSeconds,
  localDateISO,
  USAGE_BY_DAY_KEY,
} = await import('./usageLog.js');

beforeEach(() => {
  globalThis.localStorage = {
    _data: {},
    getItem(k) {
      return this._data[k] ?? null;
    },
    setItem(k, v) {
      this._data[k] = String(v);
    },
    removeItem(k) {
      delete this._data[k];
    },
  };
});

test('addUsageSeconds accumulates per local day', () => {
  const nowMs = Date.parse('2025-06-15T12:00:00Z');
  addUsageSeconds(120, nowMs);
  addUsageSeconds(60, nowMs);
  assert.equal(getUsageTodaySeconds(nowMs), 180);
});

test('getUsagePerDay returns buckets with seconds in count field', () => {
  const nowMs = Date.parse('2025-06-15T12:00:00Z');
  const todayStart = new Date(nowMs);
  todayStart.setHours(0, 0, 0, 0);
  const dayMs = 24 * 3600 * 1000;
  addUsageSeconds(90, todayStart.getTime());
  addUsageSeconds(30, todayStart.getTime() - 5 * dayMs);
  const out = getUsagePerDay({ days: 7, nowMs });
  assert.equal(out.length, 7);
  assert.equal(out[6].count, 90);
  assert.equal(out[1].count, 30);
});

test('formatDurationSeconds', () => {
  assert.equal(formatDurationSeconds(0), '0m');
  assert.equal(formatDurationSeconds(45), '45s');
  assert.equal(formatDurationSeconds(125), '2m');
  assert.equal(formatDurationSeconds(3665), '1h 1m');
});

test('localDateISO uses local calendar parts', () => {
  const iso = localDateISO(Date.parse('2025-06-15T12:00:00Z'));
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
});
