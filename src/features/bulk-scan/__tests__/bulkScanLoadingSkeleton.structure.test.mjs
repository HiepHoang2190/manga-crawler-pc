import fs from 'node:fs';
import path from 'node:path';

const panelPath = path.resolve(process.cwd(), 'src/features/bulk-scan/BulkScanPanel.jsx');

describe('BulkScanPanel Loading Skeleton & In-Content Progress Banner', () => {
  const code = fs.readFileSync(panelPath, 'utf8');

  test('defines memoized BulkScanSkeleton supporting both grid and list modes with progress bar', () => {
    expect(code).toContain('const BulkScanSkeleton = React.memo(');
    expect(code).toContain('data-testid="bulk-scan-skeleton"');
    expect(code).toContain('animate-pulse');
    expect(code).toContain('aspect-[3/4.2]');
    expect(code).toContain('h-14 w-10 sm:h-16 sm:w-11');
    expect(code).toContain('progressPercent');
  });

  test('does not render an outer banner between StudioLayout.Toolbar and StudioLayout.Body', () => {
    const betweenToolbarAndBody = code.match(/<StudioLayout\.Toolbar[\s\S]*?\/>\s*([\s\S]*?)<StudioLayout\.Body>/);
    expect(betweenToolbarAndBody).not.toBeNull();
    expect(betweenToolbarAndBody[1]).not.toContain('listProgress');
    expect(betweenToolbarAndBody[1]).not.toContain('enqueueProgress');
    expect(betweenToolbarAndBody[1]).not.toContain('busyList || enqueueBusy');
  });

  test('renders BulkScanSkeleton directly whenever busyList is true and keeps enqueueBusy banner without dimming stale rows', () => {
    expect(code).toMatch(/\{busyList\s*\?\s*[\s\S]{0,180}<BulkScanSkeleton/);
    expect(code).not.toMatch(/items\.length\s*===\s*0\s*&&\s*busyList/);
    expect(code).toMatch(/!busyList\s*&&\s*enqueueBusy\s*&&\s*items\.length\s*>\s*0/);
    expect(code).toMatch(/role="status"/);
    expect(code).not.toContain('opacity-50 pointer-events-none');
  });

  test('adheres to UI standards: zero native HTML title attributes and zero underline classes', () => {
    expect(code).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(code).not.toMatch(/\b(?:hover:)?underline\b/);
  });

  test('renders centered FetchErrorState when empty with fetchError and hides duplicate sidebar error box', () => {
    expect(code).toContain('<FetchErrorState');
    expect(code).toMatch(/items\.length\s*===\s*0\s*&&\s*fetchError[\s\S]{0,240}<FetchErrorState/);
    expect(code).toMatch(/items\.length\s*>\s*0\s*&&\s*fetchError/);
  });
});
