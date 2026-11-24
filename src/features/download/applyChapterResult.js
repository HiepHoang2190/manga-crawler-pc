/**
 * Apply download outcome to a chapter entry.
 * @param {object} chapter - current chapter object
 * @param {boolean} ok - whether download succeeded
 * @param {string} errorMsg - error message when !ok
 * @param {number} autoRetryMax - maximum retry attempts
 * @param {object} [errorMeta] - optional diagnostic metadata on final failure
 * @returns {object} updated chapter with status/retryCount
 */
export function applyChapterResult(chapter, ok, errorMsg, autoRetryMax, errorMeta) {
  const currentRetry = chapter.retryCount ?? 0;
  if (!ok && currentRetry < autoRetryMax) {
    return { ...chapter, status: 'waiting', retryCount: currentRetry + 1 };
  } else if (ok) {
    const {
      downloadError,
      errorAt,
      successCount,
      totalPages,
      failedPageIndices,
      ...rest
    } = chapter;
    return { ...rest, status: 'done', retryCount: 0 };
  } else {
    const {
      errorAt,
      successCount,
      totalPages,
      failedPageIndices,
      ...rest
    } = chapter;
    const next = { ...rest, status: 'done', downloadError: errorMsg };
    if (errorMeta && typeof errorMeta === 'object') {
      if (errorMeta.at) next.errorAt = errorMeta.at;
      if (errorMeta.successCount != null) next.successCount = errorMeta.successCount;
      if (errorMeta.totalPages != null) next.totalPages = errorMeta.totalPages;
      if (Array.isArray(errorMeta.failedPageIndices) && errorMeta.failedPageIndices.length > 0) {
        next.failedPageIndices = errorMeta.failedPageIndices;
      }
    }
    return next;
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
