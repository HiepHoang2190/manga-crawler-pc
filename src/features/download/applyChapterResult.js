/**
 * Apply download outcome to a chapter entry.
 * @param {object} chapter - current chapter object
 * @param {boolean} ok - whether download succeeded
 * @param {string} errorMsg - error message when !ok
 * @param {number} autoRetryMax - maximum retry attempts
 * @returns {object} updated chapter with status/retryCount
 */
export function applyChapterResult(chapter, ok, errorMsg, autoRetryMax) {
  const currentRetry = chapter.retryCount ?? 0;
  if (!ok && currentRetry < autoRetryMax) {
    return { ...chapter, status: 'waiting', retryCount: currentRetry + 1 };
  } else if (ok) {
    const { downloadError, ...rest } = chapter;
    return { ...rest, status: 'done', retryCount: 0 };
  } else {
    return { ...chapter, status: 'done', downloadError: errorMsg };
  }
}

/**
 * Build log message for an auto-retry attempt.
 * @param {Function} t - i18n translate function
 * @param {string} mangaTitle
 * @param {string} chapterTitle
 * @param {number} retryCount - current retry attempt (1-based)
 * @param {number} maxRetry - maximum retry attempts
 * @returns {string}
 */
export function buildRetryLogMessage(t, mangaTitle, chapterTitle, retryCount, maxRetry) {
  return t('app.log.retryChapter', {
    retryCount,
    maxRetry,
    mangaTitle,
    chapterTitle,
  });
}
