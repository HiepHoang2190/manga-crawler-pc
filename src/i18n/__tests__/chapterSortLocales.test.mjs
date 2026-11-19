import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const viPath = path.resolve(dirname, '../locales/vi.js');
const enPath = path.resolve(dirname, '../locales/en.js');

describe('Chapter Sort i18n strings', () => {
  const viSrc = fs.readFileSync(viPath, 'utf8');
  const enSrc = fs.readFileSync(enPath, 'utf8');

  test('vi locale has updated sort tooltips reflecting 2-way toggle', () => {
    expect(viSrc).toMatch(/'chapterList\.titleSortDesc':\s*'[^\']*Mới nhất/);
    expect(viSrc).toMatch(/'chapterList\.titleSortAsc':\s*'[^\']*Cũ nhất/);
  });

  test('en locale has updated sort tooltips reflecting 2-way toggle', () => {
    expect(enSrc).toMatch(/'chapterList\.titleSortDesc':\s*'[^\']*Newest/);
    expect(enSrc).toMatch(/'chapterList\.titleSortAsc':\s*'[^\']*Oldest/);
  });
});
