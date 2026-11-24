import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(dirname, '../../..', rel), 'utf8');

describe('StatusBar download progress removal & preserved indicators', () => {
  test('StatusBar.jsx removes download progress pill and page downloading status text', () => {
    const code = read('src/features/shell/StatusBar.jsx');

    expect(code).not.toContain('statusBar.downloadingPage');
    expect(code).not.toContain('statusBar.queueChaptersProgress');
    expect(code).not.toContain('statusBar.processingQueue');
    expect(code).not.toContain('statusBar.ready');
    expect(code).not.toContain('showQueueChapters');
    expect(code).not.toContain('downloadProgress');
    expect(code).not.toContain('queueProgressSummary');
    expect(code).not.toContain('queueProcessing');
  });

  test('StatusBar.jsx preserves manga title, savePath, system metrics, zoom, error badge, and log toggle without native title or underline', () => {
    const code = read('src/features/shell/StatusBar.jsx');

    expect(code).toContain('SystemResourceBadge');
    expect(code).toContain('ZoomControlBadge');
    expect(code).toContain('data-testid="status-unread-errors-btn"');
    expect(code).toContain('onToggleLogFooter');
    expect(code).toContain('mangaTitle');
    expect(code).toContain('savePath');
    expect(code).not.toMatch(/\btitle\s*=/);
    expect(code).not.toContain('underline');
  });

  test('ShellLayout.jsx omits redundant download props on <StatusBar /> while keeping Electron taskbar progress', () => {
    const shell = read('src/features/shell/ShellLayout.jsx');
    const statusBarMatch = shell.match(/<StatusBar[\s\S]*?\/>/);

    expect(statusBarMatch).not.toBeNull();
    const statusBarJsx = statusBarMatch[0];
    expect(statusBarJsx).not.toContain('queueProcessing=');
    expect(statusBarJsx).not.toContain('downloadProgress=');
    expect(statusBarJsx).not.toContain('queueProgressSummary=');

    expect(shell).toContain('computeQueueTaskbarProgress');
    expect(shell).toContain('setTaskbarProgress');
  });

  test('ProgressPanel.jsx keeps Crawler primary download progress indicator intact', () => {
    const progressPanel = read('src/features/download/components/ProgressPanel.jsx');
    expect(progressPanel).toContain('progress.detailWithChapter');
  });
});
