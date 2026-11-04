export function evaluateFreeUserChapterGate({ shouldConsume, ensureResult }) {
  if (!shouldConsume) {
    return { block: false, showExhaustedModal: false, remaining: null, error: null };
  }
  if (ensureResult?.skipped) {
    return { block: false, showExhaustedModal: false, remaining: null, error: null };
  }
  if (!ensureResult || ensureResult.ok !== true) {
    return {
      block: true,
      showExhaustedModal: false,
      remaining: null,
      error: ensureResult?.error || null,
    };
  }
  const remaining_token_count = Number.isFinite(Number(ensureResult.remainingTokens))
    ? Math.max(0, Math.floor(Number(ensureResult.remainingTokens)))
    : 0;
  if (remaining_token_count <= 0) {
    return {
      block: true,
      showExhaustedModal: true,
      remaining: remaining_token_count,
      error: null,
    };
  }
  return {
    block: false,
    showExhaustedModal: false,
    remaining: remaining_token_count,
    error: null,
  };
}
