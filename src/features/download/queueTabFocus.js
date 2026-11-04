/**
 * Next live signal for switching Home to the Queue tab.
 * 0 means no focus has been requested this session.
 */
export function nextQueueTabFocusNonce(currentNonce) {
  const parsed = Number(currentNonce);
  return (Number.isFinite(parsed) ? parsed : 0) + 1;
}
