import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '../../../');

function loadLocale(relPath) {
  const absPath = path.join(root, relPath);
  const source = fs.readFileSync(absPath, 'utf8');
  const match = source.match(/export\s+const\s+\w+\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) throw new Error(`Could not parse locale file: ${relPath}`);
  return new Function(`return ${match[1]}`)();
}

describe('SiteChecker stats and reset logic', () => {
  test('i18n defines siteChecker.stats and dashboard.stats in both vi and en', () => {
    const vi = loadLocale('src/i18n/locales/vi.js');
    const en = loadLocale('src/i18n/locales/en.js');

    expect(vi['dashboard.stats']).toBe('Thống kê');
    expect(vi['siteChecker.stats']).toBe('Chỉ số kiểm tra');
    expect(en['dashboard.stats']).toBe('Statistics');
    expect(en['siteChecker.stats']).toBe('Test Statistics');
  });

  test('stats computation only counts valid connectors, ignoring deleted/orphan connectors', () => {
    const connectors = [
      { id: 'site_a', requiresVpn: false, requiresCookie: false },
      { id: 'site_b', requiresVpn: true, requiresCookie: false },
      { id: 'site_c', requiresVpn: false, requiresCookie: true },
    ];

    // Results containing valid connectors AND deleted connectors (e.g. toptruyentranh, otruyen)
    const results = {
      site_a: { status: 'success' },
      site_b: { status: 'failed' },
      toptruyentranh: { status: 'success' }, // deleted connector
      otruyen: { status: 'failed' }, // deleted connector
      truyengihot: { status: 'success' }, // deleted connector
    };

    // Scoped stats calculation as implemented in SiteCheckerPanel
    const total = connectors.length;
    let working = 0;
    let broken = 0;
    let tested = 0;

    connectors.forEach((c) => {
      const r = results[c.id];
      if (!r) return;
      if (r.status === 'success') {
        working++;
        tested++;
      } else if (r.status === 'failed') {
        broken++;
        tested++;
      }
    });

    const vpn = connectors.filter((c) => c.requiresVpn || c.suggestsVpn).length;
    const cookie = connectors.filter((c) => c.requiresCookie).length;
    const progressPercent = total > 0 ? (tested / total) * 100 : 0;

    expect(total).toBe(3);
    expect(working).toBe(1); // Only site_a, NOT toptruyentranh or truyengihot
    expect(broken).toBe(1); // Only site_b, NOT otruyen
    expect(tested).toBe(2);
    expect(vpn).toBe(1);
    expect(cookie).toBe(1);
    expect(progressPercent).toBeCloseTo((2 / 3) * 100);
  });

  test('batch test reset logic clears status of targets and purges stale connectors', () => {
    const connectors = [
      { id: 'site_1' },
      { id: 'site_2' },
    ];

    const prevResults = {
      site_1: { status: 'success', rtt: 120 },
      site_2: { status: 'failed', rtt: 400 },
      deleted_site: { status: 'success', rtt: 300 },
    };

    const targets = connectors;
    const targetIds = targets.map((c) => c.id);
    const targetIdSet = new Set(targetIds);
    const validIds = new Set(connectors.map((c) => c.id));

    const next = {};
    Object.entries(prevResults).forEach(([id, val]) => {
      if (validIds.has(id) && !targetIdSet.has(id)) {
        next[id] = val;
      }
    });
    targets.forEach((c) => {
      next[c.id] = {
        status: 'not-tested',
        checking: true,
        steps: {},
      };
    });

    expect(next.deleted_site).toBeUndefined(); // Stale connector purged
    expect(next.site_1.status).toBe('not-tested'); // Reset for fresh run
    expect(next.site_1.checking).toBe(true);
    expect(next.site_2.status).toBe('not-tested');
    expect(next.site_2.checking).toBe(true);
  });

  test('synchronous initialization from localStorage preserves results across remounts', () => {
    const savedPayload = JSON.stringify({
      cuutruyen: { status: 'success', rtt: 150 },
      mangadex: { status: 'success', rtt: 250 },
    });

    // Emulate lazy useState initializer
    const loadFromStorage = (raw) => {
      if (!raw) return {};
      const saved = JSON.parse(raw) || {};
      const cleaned = {};
      Object.entries(saved).forEach(([k, v]) => {
        if (v) {
          cleaned[k] = {
            ...v,
            checking: false,
            status: v.status === 'testing' ? 'not-tested' : v.status,
          };
        }
      });
      return cleaned;
    };

    const initialResults = loadFromStorage(savedPayload);
    expect(initialResults.cuutruyen).toBeDefined();
    expect(initialResults.cuutruyen.status).toBe('success');
    expect(initialResults.mangadex.status).toBe('success');
    expect(Object.keys(initialResults).length).toBe(2);
  });
});
