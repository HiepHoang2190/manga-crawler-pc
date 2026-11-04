const crop = require('../../../export/image/pipeline/actions/crop');
const { frameFromInput } = require('../../../export/image/pipeline/frame');
const { borderedPagePng } = require('./fixtures');

describe('crop action', () => {
  test('validate fills defaults', () => {
    expect(crop.validate({})).toEqual({
      cropMode: 'autoTrim', pageScope: 'all', sampleMode: 'corner', sampleCorner: 'topLeft', specificColorType: 'black',
      customColorHex: '#000000', tolerance: 10,
      edges: { top: true, bottom: true, left: true, right: true },
      margins: { top: 0, bottom: 40, left: 0, right: 0 },
    });
  });

  test('validate accepts valid pageScope or falls back to all', () => {
    expect(crop.validate({ pageScope: 'odd' }).pageScope).toBe('odd');
    expect(crop.validate({ pageScope: 'even' }).pageScope).toBe('even');
    expect(crop.validate({ pageScope: 'unknown' }).pageScope).toBe('all');
  });

  test('autoTrim removes a uniform black border sampled from the corner', async () => {
    const frame = await frameFromInput(await borderedPagePng({ width: 600, height: 800, border: 40 }));
    const { frames, info } = await crop.apply([frame], crop.validate({}));
    expect(info[0].box).toEqual({ left: 40, top: 40, width: 520, height: 720 });
    expect(info[0].trimmed).toBe(true);
    expect(frames[0].info).toMatchObject({ width: 520, height: 720 });
  });

  test('specific white color does not trim a black border', async () => {
    const frame = await frameFromInput(await borderedPagePng());
    const { info } = await crop.apply([frame], crop.validate({ sampleMode: 'specific', specificColorType: 'white' }));
    expect(info[0].trimmed).toBe(false);
  });

  test('margins are given in source px and scaled to preview frames', async () => {
    const frame = await frameFromInput(await borderedPagePng({ width: 600, height: 800 }), { maxSize: 400 });
    const { frames } = await crop.apply([frame], crop.validate({ cropMode: 'margin', margins: { top: 0, bottom: 100, left: 0, right: 0 } }));
    expect(frames[0].info).toMatchObject({ width: 300, height: 350 });
  });

  test('a fixed box is given in source px and scaled to the frame', async () => {
    const frame = await frameFromInput(await borderedPagePng({ width: 600, height: 800 }), { maxSize: 400 });
    const params = crop.validate({ cropMode: 'box', box: { left: 0, top: 0, width: 200, height: 100 } });
    const { frames, info } = await crop.apply([frame], params);
    expect(frame.scale).toBeCloseTo(0.5);
    expect(info[0].manual).toBe(true);
    expect(frames[0].info).toMatchObject({ width: 100, height: 50 });
  });

  test('boxRatio override wins over automatic detection', async () => {
    const frame = await frameFromInput(await borderedPagePng({ width: 600, height: 800 }));
    const { frames, info } = await crop.apply([frame], crop.validate({ boxRatio: { left: 0.5, top: 0, width: 0.5, height: 0.5 } }));
    expect(info[0].manual).toBe(true);
    expect(frames[0].info).toMatchObject({ width: 300, height: 400 });
  });

  test('info box matches extractFrame after boxRatio rounding overflow', async () => {
    const frame = await frameFromInput(await borderedPagePng({ width: 50, height: 50, border: 2 }));
    const { frames, info } = await crop.apply(
      [frame],
      crop.validate({ boxRatio: { left: 0.01, top: 0, width: 0.99, height: 1 } }),
    );
    const { box, boxRatio } = info[0];
    expect(box.width).toBe(frames[0].info.width);
    expect(box.height).toBe(frames[0].info.height);
    expect(box.left + box.width).toBeLessThanOrEqual(frame.info.width);
    expect(boxRatio.left + boxRatio.width).toBeLessThanOrEqual(1);
  });

  test('pageScope: odd applies to odd page numbers and skips even page numbers', async () => {
    const frameOdd = await frameFromInput(await borderedPagePng({ width: 600, height: 800, border: 40 }));
    const params = crop.validate({ pageScope: 'odd' });

    // Page 1 (odd) -> applied
    const resOdd = await crop.apply([frameOdd], params, { pageNumber: 1 });
    expect(resOdd.info[0].skipped).toBeFalsy();
    expect(resOdd.info[0].trimmed).toBe(true);
    expect(resOdd.frames[0].info.width).toBe(520);

    // Page 2 (even) -> skipped
    const frameEven = await frameFromInput(await borderedPagePng({ width: 600, height: 800, border: 40 }));
    const resEven = await crop.apply([frameEven], params, { pageNumber: 2 });
    expect(resEven.info[0].skipped).toBe(true);
    expect(resEven.info[0].trimmed).toBe(false);
    expect(resEven.frames[0].info.width).toBe(600); // untouched
  });

  test('pageScope: even applies to even page numbers and skips odd page numbers', async () => {
    const frameEven = await frameFromInput(await borderedPagePng({ width: 600, height: 800, border: 40 }));
    const params = crop.validate({ pageScope: 'even' });

    // Page 2 (even) -> applied
    const resEven = await crop.apply([frameEven], params, { pageNumber: 2 });
    expect(resEven.info[0].skipped).toBeFalsy();
    expect(resEven.info[0].trimmed).toBe(true);
    expect(resEven.frames[0].info.width).toBe(520);

    // Page 3 (odd) -> skipped
    const frameOdd = await frameFromInput(await borderedPagePng({ width: 600, height: 800, border: 40 }));
    const resOdd = await crop.apply([frameOdd], params, { pageNumber: 3 });
    expect(resOdd.info[0].skipped).toBe(true);
    expect(resOdd.info[0].trimmed).toBe(false);
    expect(resOdd.frames[0].info.width).toBe(600); // untouched
  });
});
