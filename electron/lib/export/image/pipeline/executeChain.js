'use strict';

const { getAction, resolveStepParams } = require('./actionRegistry');
const { hashParts } = require('./stepCache');

async function executeChain({
  baseFrame,
  actions,
  fileOverrides = {},
  stopBefore = actions.length,
  cache = null,
  cacheBase = '',
  isCancelled = () => false,
  context = {},
}) {
  let frames = [baseFrame];
  const stepInfos = [];
  const parts = [cacheBase];
  const end = Math.max(0, Math.min(stopBefore, actions.length));

  for (let i = 0; i < end; i++) {
    if (isCancelled()) throw new Error('CANCELLED');
    const action = actions[i];
    const { enabled, params } = resolveStepParams(action, fileOverrides[action.id]);
    parts.push(JSON.stringify([action.type, enabled, params, context.pageNumber]));
    if (!enabled) {
      stepInfos.push({ skipped: true });
      continue;
    }
    const key = cache ? hashParts(parts) : null;
    const hit = key ? cache.get(key) : undefined;
    if (hit) {
      frames = hit.frames;
      stepInfos.push(hit.info);
      continue;
    }
    const res = await getAction(action.type).apply(frames, params, context);
    frames = res.frames;
    const info = { frames: res.info };
    if (key) cache.set(key, { frames, info });
    stepInfos.push(info);
  }
  return { frames, stepInfos };
}

module.exports = { executeChain };
