function normalizeText(value) {
  return String(value ?? '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function extractPrimaryChapterNumber(title) {
  const raw = String(title ?? '').trim();
  if (!raw) return null;

  const keywordMatch = raw.match(
    /(?:chapter|chap|ch\.?|chương|chuong|episode|ep\.?|tập|tap)\s*(\d+(?:\.\d+)?)/i
  );
  if (keywordMatch) {
    const num = Number(keywordMatch[1]);
    return Number.isFinite(num) ? num : null;
  }

  const standaloneMatch = raw.match(/^(\d+(?:\.\d+)?)\b/);
  if (standaloneMatch) {
    const num = Number(standaloneMatch[1]);
    return Number.isFinite(num) ? num : null;
  }

  return null;
}

export function parseChapterRangeSelection(expr, chapters = []) {
  const raw = String(expr ?? '').trim();
  if (!raw || !Array.isArray(chapters) || chapters.length === 0) return [];

  const tokens = raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (tokens.length === 0) return [];

  const ranges = [];
  const exacts = [];

  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+(?:\.\d+)?)\s*[-~–]\s*(\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const a = Number(rangeMatch[1]);
      const b = Number(rangeMatch[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        ranges.push([Math.min(a, b), Math.max(a, b)]);
      }
      continue;
    }

    const singleNum = Number(token);
    if (Number.isFinite(singleNum)) {
      exacts.push(singleNum);
    }
  }

  if (ranges.length === 0 && exacts.length === 0) return [];

  const extractedNumbers = chapters.map((ch) => extractPrimaryChapterNumber(ch?.title));
  const hasAnyNumbered = extractedNumbers.some((n) => n !== null);

  const matchedUrls = [];
  const seenUrls = new Set();

  chapters.forEach((ch, idx) => {
    const url = ch?.url;
    if (!url || seenUrls.has(url)) return;

    const extracted = extractedNumbers[idx];
    const posVal = idx + 1;

    const inExact =
      extracted !== null
        ? exacts.some((x) => Math.abs(x - extracted) < 1e-6)
        : exacts.some((x) => Math.abs(x - posVal) < 1e-6);

    const rangeVal = extracted !== null ? extracted : (!hasAnyNumbered ? posVal : null);
    const inRange =
      rangeVal !== null &&
      ranges.some(([lo, hi]) => rangeVal >= lo - 1e-6 && rangeVal <= hi + 1e-6);

    if (inExact || inRange) {
      seenUrls.add(url);
      matchedUrls.push(url);
    }
  });

  return matchedUrls;
}

export function filterChaptersByQuery(chapters = [], query = '') {
  if (!Array.isArray(chapters)) return [];
  const q = normalizeText(query);
  if (!q) return chapters;

  return chapters.filter((ch) => {
    const titleNorm = normalizeText(ch?.title);
    const volNorm = ch?.volume != null ? normalizeText(`vol ${ch.volume}`) : '';
    return titleNorm.includes(q) || volNorm.includes(q);
  });
}

export function selectUndownloadedChapterUrls(chapters = [], getStatusKey) {
  if (!Array.isArray(chapters) || typeof getStatusKey !== 'function') return [];
  const result = [];
  const seen = new Set();

  for (const ch of chapters) {
    const url = ch?.url;
    if (!url || seen.has(url)) continue;
    if (getStatusKey(ch) === 'pending') {
      seen.add(url);
      result.push(url);
    }
  }

  return result;
}
