function matchesPattern(value, pattern) {
  if (pattern instanceof RegExp) return pattern.test(String(value || ''));
  return String(value || '').includes(String(pattern));
}

function assertConnectorTestResult(result, entry) {
  const catalog_entry = entry || {};
  const expect_spec = catalog_entry.expect || {};

  expect(result).toBeDefined();
  expect(result.ok).toBe(true);

  if (result.steps && result.steps.custom) {
    expect(result.steps.custom.ok).toBe(true);
    return;
  }

  expect(result.steps.listing.ok).toBe(true);
  expect(result.steps.chapters.ok).toBe(true);
  expect(result.steps.download.ok).toBe(true);
  expect(result.testDetails.mangaUrl).toBeTruthy();

  if (expect_spec.titlePattern) {
    expect(matchesPattern(result.testDetails.mangaTitle, expect_spec.titlePattern)).toBe(true);
  }
  if (expect_spec.chapterUrlPattern) {
    expect(matchesPattern(result.testDetails.chapterUrl, expect_spec.chapterUrlPattern)).toBe(true);
  }
  const min_chapters = expect_spec.minChapters == null ? 1 : expect_spec.minChapters;
  expect(result.testDetails.chapterCount).toBeGreaterThanOrEqual(min_chapters);
}

module.exports = { assertConnectorTestResult };
