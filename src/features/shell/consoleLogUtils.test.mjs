import {
  countLogsByLevel,
  countUnreadErrorsSince,
  filterConsoleLogs,
  formatLogsForClipboard,
} from './consoleLogUtils.mjs';

describe('consoleLogUtils', () => {
  const sampleLogs = [
    { t: 100, time: '10:00:01', level: 'info', msg: 'Đang tải danh sách chương' },
    { t: 200, time: '10:00:02', level: 'warn', msg: 'Cloudflare challenge detected' },
    { t: 300, time: '10:00:03', level: 'error', msg: 'Lỗi kết nối máy chủ' },
    { t: 400, time: '10:00:04', level: 'success', msg: 'Hoàn tất chương 10' },
  ];

  test('countLogsByLevel totals each severity', () => {
    expect(countLogsByLevel(sampleLogs)).toEqual({
      all: 4,
      error: 1,
      warn: 1,
      success: 1,
      info: 1,
    });
  });

  test('countUnreadErrorsSince tracks new errors even when rolling log buffer evicts older errors', () => {
    expect(countUnreadErrorsSince(sampleLogs, 250)).toBe(1);
    expect(countUnreadErrorsSince(sampleLogs, 300)).toBe(0);

    // Simulate rolling 201-entry ring buffer where old error t=100 was evicted and new error t=500 arrived
    const rolledLogs = [
      ...Array.from({ length: 200 }, (_, i) => ({ t: 301 + i, level: 'info', msg: `log ${i}` })),
      { t: 550, level: 'error', msg: 'New error after buffer cap' },
    ];
    expect(countUnreadErrorsSince(rolledLogs, 300)).toBe(1);
  });

  test('filterConsoleLogs filters by level and Vietnamese diacritic-insensitive query', () => {
    expect(filterConsoleLogs(sampleLogs, { level: 'error' })).toHaveLength(1);
    expect(filterConsoleLogs(sampleLogs, { level: 'all', query: 'loi ket noi' }).map((l) => l.t)).toEqual([300]);
    expect(filterConsoleLogs(sampleLogs, { level: 'success', query: 'chuong 10' }).map((l) => l.t)).toEqual([400]);
    expect(filterConsoleLogs(sampleLogs, { level: 'warn', query: 'chuong 10' })).toHaveLength(0);
  });

  test('formatLogsForClipboard formats readable plain text', () => {
    expect(formatLogsForClipboard(sampleLogs.slice(0, 2))).toBe(
      '[10:00:01] [INFO] Đang tải danh sách chương\n[10:00:02] [WARN] Cloudflare challenge detected'
    );
  });
});
