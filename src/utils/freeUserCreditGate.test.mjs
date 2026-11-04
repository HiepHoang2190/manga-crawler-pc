import { evaluateFreeUserChapterGate } from './freeUserCreditGate.mjs';

describe('evaluateFreeUserChapterGate', () => {
  test('does not block members who skip credit consume', () => {
    expect(
      evaluateFreeUserChapterGate({
        shouldConsume: true,
        ensureResult: { ok: true, skipped: true },
      }),
    ).toEqual({
      block: false,
      showExhaustedModal: false,
      remaining: null,
      error: null,
    });
  });

  test('does not block when credit consume is not required', () => {
    expect(
      evaluateFreeUserChapterGate({
        shouldConsume: false,
        ensureResult: { ok: true, remainingTokens: 0 },
      }),
    ).toEqual({
      block: false,
      showExhaustedModal: false,
      remaining: null,
      error: null,
    });
  });

  test('blocks online read and shows register modal when remaining tokens are 0', () => {
    expect(
      evaluateFreeUserChapterGate({
        shouldConsume: true,
        ensureResult: { ok: true, remainingTokens: 0 },
      }),
    ).toEqual({
      block: true,
      showExhaustedModal: true,
      remaining: 0,
      error: null,
    });
  });

  test('blocks fetch when credit ensure fails without treating it as exhausted', () => {
    expect(
      evaluateFreeUserChapterGate({
        shouldConsume: true,
        ensureResult: { ok: false, error: 'network' },
      }),
    ).toEqual({
      block: true,
      showExhaustedModal: false,
      remaining: null,
      error: 'network',
    });
  });

  test('blocks when remaining tokens are missing on a successful ensure', () => {
    expect(
      evaluateFreeUserChapterGate({
        shouldConsume: true,
        ensureResult: { ok: true },
      }),
    ).toEqual({
      block: true,
      showExhaustedModal: true,
      remaining: 0,
      error: null,
    });
  });

  test('allows online read when remaining tokens are positive', () => {
    expect(
      evaluateFreeUserChapterGate({
        shouldConsume: true,
        ensureResult: { ok: true, remainingTokens: 12 },
      }),
    ).toEqual({
      block: false,
      showExhaustedModal: false,
      remaining: 12,
      error: null,
    });
  });
});
