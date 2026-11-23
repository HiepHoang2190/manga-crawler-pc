import fs from 'node:fs';
import path from 'node:path';
import { removeQueueGroups } from '../queueMutations.js';

describe('removeQueueGroups unit logic', () => {
  const sampleQueue = [
    { id: 'g1', mangaTitle: 'One', chapters: [] },
    { id: 'g2', mangaTitle: 'Two', chapters: [] },
    { id: 'g3', mangaTitle: 'Three', chapters: [] },
  ];

  test('removes matching groups for Array or Set inputs without mutating source array', () => {
    const outArr = removeQueueGroups(sampleQueue, ['g1', 'g3']);
    expect(outArr.map((g) => g.id)).toEqual(['g2']);
    expect(sampleQueue).toHaveLength(3);

    const outSet = removeQueueGroups(sampleQueue, new Set(['g2']));
    expect(outSet.map((g) => g.id)).toEqual(['g1', 'g3']);
  });

  test('returns unchanged list when groupIds is empty, nullish, or matches nothing', () => {
    expect(removeQueueGroups(sampleQueue, [])).toBe(sampleQueue);
    expect(removeQueueGroups(sampleQueue, new Set())).toBe(sampleQueue);
    expect(removeQueueGroups(sampleQueue, null)).toBe(sampleQueue);
    expect(removeQueueGroups(sampleQueue, ['missing-id'])).toBe(sampleQueue);
  });
});

describe('QueuePanel bulk remove ConfirmModal & UI standards', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/download/components/QueuePanel.jsx');
  const viPath = path.resolve(process.cwd(), 'src/i18n/locales/vi.js');
  const enPath = path.resolve(process.cwd(), 'src/i18n/locales/en.js');

  test('QueuePanel uses ConfirmModal for bulk removing selected groups with data-tooltip and no window.confirm', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('<ConfirmModal');
    expect(content).toContain('queue.removeSelected');
    expect(content).toContain('queue.removeSelectedConfirmTitle');
    expect(content).toContain('queue.removeSelectedConfirmMessage');
    expect(content).not.toMatch(/window\.confirm/);
    expect(content).not.toMatch(/<[a-z][a-z0-9-]*\b[^>]*\btitle=/);
  });

  test('vi and en locales define all queue.removeSelected* keys', () => {
    const keys = [
      'queue.removeSelected',
      'queue.removeSelectedTooltip',
      'queue.removeSelectedActiveTooltip',
      'queue.removeSelectedConfirmTitle',
      'queue.removeSelectedConfirmMessage',
    ];
    for (const localePath of [viPath, enPath]) {
      const content = fs.readFileSync(localePath, 'utf8');
      for (const k of keys) {
        expect(content).toContain(`'${k}':`);
      }
    }
  });
});
