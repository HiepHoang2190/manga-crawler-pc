import {
  sortConnectorsForChecker,
  buildHealthReportMarkdown,
} from '../siteCheckerUtils.mjs';

describe('siteCheckerUtils', () => {
  const connectors = [
    { id: 'site_a', label: 'Site A', domain: 'a.com' },
    { id: 'site_b', label: 'Site B', domain: 'b.com' },
    { id: 'site_c', label: 'Site C', domain: 'c.com' },
    { id: 'site_d', label: 'Site D', domain: 'd.com' },
  ];

  const results = {
    site_a: { status: 'success', rtt: 450 },
    site_b: { status: 'failed', rtt: 120, error: 'Timeout 403' },
    site_c: { status: 'success', rtt: 180 },
    // site_d untested
  };

  test('sortConnectorsForChecker keeps original order on default and does not mutate', () => {
    const sorted = sortConnectorsForChecker(connectors, results, 'default');
    expect(sorted.map((c) => c.id)).toEqual(['site_a', 'site_b', 'site_c', 'site_d']);
    expect(sorted).not.toBe(connectors);
  });

  test('sortConnectorsForChecker sorts rttAsc and rttDesc with untested/no-RTT last', () => {
    const asc = sortConnectorsForChecker(connectors, results, 'rttAsc');
    expect(asc.map((c) => c.id)).toEqual(['site_b', 'site_c', 'site_a', 'site_d']);

    const desc = sortConnectorsForChecker(connectors, results, 'rttDesc');
    expect(desc.map((c) => c.id)).toEqual(['site_a', 'site_c', 'site_b', 'site_d']);
  });

  test('sortConnectorsForChecker sorts brokenFirst accurately', () => {
    const broken = sortConnectorsForChecker(connectors, results, 'brokenFirst');
    expect(broken.map((c) => c.id)).toEqual(['site_b', 'site_d', 'site_a', 'site_c']);
  });

  test('buildHealthReportMarkdown summarizes stats, avg RTT, and broken sources', () => {
    const report = buildHealthReportMarkdown(connectors, results, {
      total: 4,
      working: 2,
      broken: 1,
      tested: 3,
    });
    expect(report).toContain('2/4');
    expect(report).toContain('Site B');
    expect(report).toContain('Timeout 403');
    expect(report).toContain('315ms'); // average of 450 and 180
  });
});
