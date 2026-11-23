import fs from 'node:fs';
import path from 'node:path';
import { getUntestedConnectors } from '../siteCheckerUtils.mjs';

describe('getUntestedConnectors logic', () => {
  const sampleConnectors = [
    { id: 'a', label: 'Site A' },
    { id: 'b', label: 'Site B' },
    { id: 'c', label: 'Site C' },
    { id: 'd', label: 'Site D' },
    { id: 'e', label: 'Site E' },
  ];

  test('returns connectors with missing result or non-terminal status, excluding checking/queued/success/failed', () => {
    const results = {
      a: { status: 'success' },
      b: { status: 'failed' },
      c: { status: 'not-tested' },
      d: { status: 'not-tested', checking: true },
      f: { status: 'testing' },
      // e missing -> untested
    };
    const out = getUntestedConnectors([...sampleConnectors, { id: 'f', label: 'Site F' }], results);
    expect(out.map((c) => c.id)).toEqual(['c', 'e']);
  });
});

describe('SiteCheckerPanel jump-to-card & untested filter/batch support', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/site-checker/SiteCheckerPanel.jsx');
  const viPath = path.resolve(process.cwd(), 'src/i18n/locales/vi.js');
  const enPath = path.resolve(process.cwd(), 'src/i18n/locales/en.js');

  test('SiteCheckerPanel wires untested filter, startTestUntestedOnly, and clickable quick directory scrollIntoView', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('getUntestedConnectors');
    expect(content).toContain("id: 'untested'");
    expect(content).toContain('startTestUntestedOnly');
    expect(content).toContain('handleJumpToConnector');
    expect(content).toContain('scrollIntoView');
    expect(content).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(content).not.toMatch(/\b(?:hover:)?underline\b/);
  });

  test('vi and en locales define untested & jump keys', () => {
    const keys = [
      'siteChecker.filter.untested',
      'siteChecker.testUntested',
      'siteChecker.testUntestedTooltip',
      'siteChecker.jumpToSiteTooltip',
    ];
    for (const localePath of [viPath, enPath]) {
      const content = fs.readFileSync(localePath, 'utf8');
      for (const k of keys) {
        expect(content).toContain(`'${k}':`);
      }
    }
  });
});
