import fs from 'fs';
import path from 'path';

describe('MangaInfo Component Structure & Normalization', () => {
  const filePath = path.resolve(process.cwd(), 'src/features/download/components/MangaInfo.jsx');
  const content = fs.readFileSync(filePath, 'utf8');

  test('does not render altTitles or rating on the outside card', () => {
    expect(content).not.toMatch(/mangaInfo\.altTitles/);
    expect(content).not.toMatch(/mangaInfo\.rating/);
    expect(content).not.toMatch(/rating\s*!=\s*null/);
  });

  test('action buttons use a 2-column grid layout', () => {
    expect(content).toMatch(/grid\s+grid-cols-2/);
  });

  test('all interactive buttons do not use native title attribute', () => {
    const INTERACTIVE_TITLE_REGEX = /<button\b[^>]*?\btitle=/;
    expect(INTERACTIVE_TITLE_REGEX.test(content)).toBe(false);
  });

  test('action buttons and favorite button have data-tooltip attribute', () => {
    expect(content).toMatch(/data-testid="open-drawer-btn"[\s\S]*?data-tooltip=/);
    expect(content).toMatch(/data-testid="enqueue-all-btn"[\s\S]*?data-tooltip=/);
    expect(content).toMatch(/data-tooltip=\{\s*guestFavoriteLocked/);
  });

  test('does not contain underline classes', () => {
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });
});
