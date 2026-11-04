const { normalizeActions, resolveStepParams, listActionTypes } = require('../../../export/image/pipeline/actionRegistry');
const { createStepCache, hashParts } = require('../../../export/image/pipeline/stepCache');
const { executeChain } = require('../../../export/image/pipeline/executeChain');
const crop = require('../../../export/image/pipeline/actions/crop');
const { frameFromInput } = require('../../../export/image/pipeline/frame');
const { borderedPagePng, doublePagePng } = require('./fixtures');

describe('action registry', () => {
  test('lists registered action types and drops unknown ones', () => {
    expect(listActionTypes()).toEqual(['crop', 'desaturate', 'deskew', 'splitPage']);
    const out = normalizeActions([{ id: 'x', type: 'watermark' }, { id: 'c', type: 'crop', enabled: false, params: { tolerance: 500 } }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'c', type: 'crop', enabled: false });
    expect(out[0].params.tolerance).toBe(100);
  });

  test('override enabled/params win over the global action', () => {
    const [action] = normalizeActions([{ id: 'c', type: 'crop', params: { tolerance: 20 } }]);
    expect(resolveStepParams(action, { enabled: false, params: { tolerance: 30 } })).toMatchObject({ enabled: false, params: { tolerance: 30 } });
    expect(resolveStepParams(action).enabled).toBe(true);
  });
});

describe('step cache', () => {
  test('evicts least recently used entries by count and bytes', () => {
    const cache = createStepCache({ maxEntries: 2, maxBytes: 100 });
    const v = (n) => ({ frames: [{ data: Buffer.alloc(n) }], info: null });
    cache.set('a', v(10));
    cache.set('b', v(10));
    cache.get('a');
    cache.set('c', v(10));
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
    cache.set('d', v(95));
    expect(cache.size).toBe(1);
    expect(hashParts(['x', 'y'])).not.toBe(hashParts(['xy']));
  });
});

describe('executeChain', () => {
  test('applies crop then split; split runs on the cropped frame', async () => {
    const baseFrame = await frameFromInput(await doublePagePng({ width: 1600, height: 1100 }));
    const actions = normalizeActions([
      { id: 'c', type: 'crop', params: { cropMode: 'margin', margins: { top: 0, bottom: 100, left: 0, right: 0 } } },
      { id: 's', type: 'splitPage' },
    ]);
    const { frames, stepInfos } = await executeChain({ baseFrame, actions });
    expect(frames).toHaveLength(2);
    expect(frames[0].info.height).toBe(1000);
    expect(stepInfos[1].frames[0].willSplit).toBe(true);
  });

  test('disabled steps and per-file disabled overrides are skipped', async () => {
    const baseFrame = await frameFromInput(await doublePagePng());
    const actions = normalizeActions([{ id: 's', type: 'splitPage' }]);
    const res = await executeChain({ baseFrame, actions, fileOverrides: { s: { enabled: false } } });
    expect(res.frames).toHaveLength(1);
    expect(res.stepInfos[0]).toEqual({ skipped: true });
  });

  test('cache hit for unchanged prefix; changing an earlier step misses', async () => {
    const baseFrame = await frameFromInput(await borderedPagePng());
    const cache = createStepCache();
    const spy = jest.spyOn(crop, 'apply');
    const actions = normalizeActions([{ id: 'c', type: 'crop' }, { id: 's', type: 'splitPage' }]);
    await executeChain({ baseFrame, actions, cache, cacheBase: 'f1' });
    await executeChain({ baseFrame, actions: normalizeActions([{ id: 'c', type: 'crop' }, { id: 's', type: 'splitPage', params: { minWidth: 300 } }]), cache, cacheBase: 'f1' });
    expect(spy).toHaveBeenCalledTimes(1);
    await executeChain({ baseFrame, actions: normalizeActions([{ id: 'c', type: 'crop', params: { tolerance: 50 } }]), cache, cacheBase: 'f1' });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  test('stopBefore limits the steps and isCancelled aborts', async () => {
    const baseFrame = await frameFromInput(await doublePagePng());
    const actions = normalizeActions([{ id: 's', type: 'splitPage' }]);
    expect((await executeChain({ baseFrame, actions, stopBefore: 0 })).frames[0]).toBe(baseFrame);
    await expect(executeChain({ baseFrame, actions, isCancelled: () => true })).rejects.toThrow('CANCELLED');
  });
});
