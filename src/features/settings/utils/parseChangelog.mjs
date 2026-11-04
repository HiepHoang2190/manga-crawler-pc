/**
 * Utility to parse raw changelog text into structured items.
 *
 * Supports:
 * - Line-by-line parsing
 * - Normalizing literal \n and escaped \\n
 * - Stripping bullet markers (-, *, •, +)
 * - Detecting tags:
 *   - New: [New], [Mới], [Tính năng], [Feature], ✨ -> type: 'new'
 *   - Fix: [Fix], [Sửa lỗi], [Bug], [Hotfix], 🐛 -> type: 'fix'
 *   - Improve: [Improve], [Cải tiến], [Tối ưu], [Update], [Nâng cấp], ⚡ -> type: 'improve'
 *   - General: everything else -> type: 'general'
 */

const TAG_REGEX = /^\[([^\]]+)\]\s*(.*)$/i;

export function parseChangelog(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  // Normalize newlines (handles both literal \n and encoded \\n if came from JSON/CSV)
  const normalized = rawText.replace(/\\n/g, '\n');
  const lines = normalized.split(/\r?\n/);
  const items = [];
  let id = 1;

  for (let line of lines) {
    let text = line.trim();
    if (!text) continue;

    // Strip leading bullet markers: -, *, •, +, or numbers like "1. ", "2. "
    text = text.replace(/^[-*•+]\s+/, '').replace(/^\d+\.\s+/, '').trim();
    if (!text) continue;

    let type = 'general';
    let tag = '';
    let content = text;

    // Check emojis
    if (content.startsWith('✨')) {
      type = 'new';
      content = content.replace(/^✨\s*/, '').trim();
    } else if (content.startsWith('🐛')) {
      type = 'fix';
      content = content.replace(/^🐛\s*/, '').trim();
    } else if (content.startsWith('⚡')) {
      type = 'improve';
      content = content.replace(/^⚡\s*/, '').trim();
    }

    // Check [Tag] prefix
    const match = content.match(TAG_REGEX);
    if (match) {
      const rawTag = match[1].trim();
      const rest = match[2].trim();
      const lowerTag = rawTag.toLowerCase();

      if (/^(new|mới|feature|tính năng)$/i.test(lowerTag)) {
        type = 'new';
        tag = rawTag;
        content = rest;
      } else if (/^(fix|sửa lỗi|bug|hotfix|sửa)$/i.test(lowerTag)) {
        type = 'fix';
        tag = rawTag;
        content = rest;
      } else if (/^(improve|cải tiến|tối ưu|update|nâng cấp|perf|hiệu năng)$/i.test(lowerTag)) {
        type = 'improve';
        tag = rawTag;
        content = rest;
      } else {
        tag = rawTag;
        content = rest;
      }
    }

    if (content) {
      items.push({
        id: id++,
        type,
        tag: tag || (type === 'new' ? 'Mới' : type === 'fix' ? 'Sửa lỗi' : type === 'improve' ? 'Cải tiến' : ''),
        content,
      });
    }
  }

  return items;
}
