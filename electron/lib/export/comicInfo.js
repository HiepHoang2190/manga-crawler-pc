/**
 * Escape XML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate standard ComicRack 2.0 ComicInfo.xml metadata for CBZ archives.
 * Maps chapter markers to Bookmark attributes on corresponding Page elements.
 *
 * @param {object} opts
 * @param {string} [opts.title] - Volume or part title
 * @param {string} [opts.series] - Series name
 * @param {number} [opts.number] - Volume / part number
 * @param {number} [opts.count] - Total volumes / parts count
 * @param {Array<{ title: string, baseName?: string }>} [opts.items] - Ordered image items
 * @returns {string} XML content
 */
function generateComicInfoXml(opts = {}) {
  const title = String(opts.title || '').trim();
  const series = String(opts.series || opts.title || '').trim();
  const items = Array.isArray(opts.items) ? opts.items : [];
  const pageCount = items.length;

  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
  ];

  if (title) {
    lines.push(`  <Title>${escapeXml(title)}</Title>`);
  }
  if (series) {
    lines.push(`  <Series>${escapeXml(series)}</Series>`);
  }
  if (Number.isFinite(opts.number)) {
    lines.push(`  <Number>${opts.number}</Number>`);
  }
  if (Number.isFinite(opts.count)) {
    lines.push(`  <Count>${opts.count}</Count>`);
  }

  lines.push(`  <PageCount>${pageCount}</PageCount>`);
  lines.push('  <Manga>YesAndRightToLeft</Manga>');

  if (items.length === 0) {
    lines.push('  <Pages />');
  } else {
    lines.push('  <Pages>');
    let lastChapterTitle = null;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const chapterTitle = String(it?.title || '').trim();
      const isNewChapter = chapterTitle && chapterTitle !== lastChapterTitle;

      if (isNewChapter) {
        lastChapterTitle = chapterTitle;
        lines.push(`    <Page Image="${i}" Bookmark="${escapeXml(chapterTitle)}" Type="Story" />`);
      } else {
        lines.push(`    <Page Image="${i}" Type="Story" />`);
      }
    }
    lines.push('  </Pages>');
  }

  lines.push('</ComicInfo>');
  return lines.join('\n');
}

/**
 * Parse bookmarks from ComicInfo.xml content.
 * @param {string} xmlContent
 * @returns {Array<{ imageIndex: number, title: string }>|null}
 */
function parseComicInfoBookmarks(xmlContent) {
  if (!xmlContent || typeof xmlContent !== 'string') return null;
  const pageMatches = [...xmlContent.matchAll(/<Page\s+([^>]+)\/>/gi)];
  if (!pageMatches.length) return null;

  const bookmarks = [];
  for (const m of pageMatches) {
    const attrs = m[1];
    const imgMatch = attrs.match(/Image\s*=\s*["'](\d+)["']/i);
    const bmMatch = attrs.match(/Bookmark\s*=\s*["']([^"']+)["']/i);
    if (imgMatch && bmMatch) {
      const idx = parseInt(imgMatch[1], 10);
      const title = bmMatch[1].trim()
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      if (title) bookmarks.push({ imageIndex: idx, title });
    }
  }
  return bookmarks.length > 0 ? bookmarks : null;
}

module.exports = {
  escapeXml,
  generateComicInfoXml,
  parseComicInfoBookmarks,
};

