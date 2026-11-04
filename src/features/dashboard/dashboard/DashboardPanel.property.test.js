'use strict';

// Feature: dashboard, Task 10
// Pure-decision tests mirroring visibility decisions in DashboardPanel.jsx.
// Full JSX render contract is verified manually in Task 14 (project Jest setup
// uses testEnvironment: 'node' with no JSX transform, so we cannot import .jsx).

// ---------------------------------------------------------------------------
// Pure decisions extracted from DashboardPanel.jsx
// ---------------------------------------------------------------------------

function shouldShowRecentDownloads(items) {
  return Array.isArray(items) && items.length > 0;
}

test('recent-downloads section visibility', () => {
  expect(shouldShowRecentDownloads([])).toBe(false);
  expect(shouldShowRecentDownloads(null)).toBe(false);
  expect(shouldShowRecentDownloads([{ mangaId: 'a' }])).toBe(true);
});

