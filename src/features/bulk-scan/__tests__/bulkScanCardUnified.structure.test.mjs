import fs from 'node:fs';
import path from 'node:path';

describe('BulkScanPanel Unified Card Structure', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/bulk-scan/BulkScanPanel.jsx');
  const explorePath = path.resolve(process.cwd(), 'src/features/explore/ExplorePanel.jsx');

  test('uses standard aspect-[3/4.2] ratio for book cover matching latest updates and followed manga', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('aspect-[3/4.2]');
    expect(content).not.toContain('aspect-[2/3]');
  });

  test('renders web source badge and bookmark heart button on card cover overlay', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    // Source badge
    expect(content).toContain('activeConnector?.label || selectedSiteId');
    // Bookmark heart button
    expect(content).toContain('favorite');
    expect(content).toContain('favorite_border');
    expect(content).toContain('handleToggleFavorite');
  });

  test('renders styled checkbox while keeping data-testid="bulk-scan-checkbox" input', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('data-testid="bulk-scan-checkbox"');
    expect(content).toContain('data-testid="bulk-scan-card-checkbox"');
  });

  test('includes action buttons: View Chapters and Add to Queue on card', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    // Open chapter list button
    expect(content).toContain('handleOpenChapterList');
    expect(content).toContain('latestUpdates.openChapterList');
    // Quick add to queue button
    expect(content).toContain('handleEnqueueSingle');
    expect(content).toContain('latestUpdates.addToQueue');
    expect(content).toContain('playlist_add');
  });

  test('mounts ChaptersDrawer with full props for reading and queueing', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('<ChaptersDrawer');
    expect(content).toContain('chapterDrawerOpen');
    expect(content).toContain('closeChapterDrawer');
  });

  test('ExplorePanel passes all required drawer and favorite props to BulkScanPanel', () => {
    const content = fs.readFileSync(explorePath, 'utf8');
    const bulkMatch = content.match(/<BulkScanPanel([\s\S]*?)\/>/);
    expect(bulkMatch).not.toBeNull();
    const props = bulkMatch[1];
    expect(props).toContain('queue={queue}');
    expect(props).toContain('favorites={favorites}');
    expect(props).toContain('onToggleFavorite={onToggleFavorite}');
    expect(props).toContain('prepareDrawerMangaForRead={prepareDrawerMangaForRead}');
    expect(props).toContain('onOpenReaderForDrawerChapter={onOpenReaderForDrawerChapter}');
    expect(props).toContain('onReadChapterOnlineForDrawerChapter={onReadChapterOnlineForDrawerChapter}');
    expect(props).toContain('onAddQueuedFromLatest={onAddQueuedFromLatest}');
  });

  test('complies with UI standards: zero native title and zero underline', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });
});
