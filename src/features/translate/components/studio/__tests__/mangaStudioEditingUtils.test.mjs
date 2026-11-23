import {
  MAX_HISTORY_ENTRIES,
  extractLayersSnapshot,
  applyLayersSnapshot,
  pushHistoryStack,
  applyTypographyStyleToPages,
  nudgeLayerBbox,
  countBatchFindMatches,
  batchReplaceLayerTexts,
} from '../mangaStudioEditingUtils.mjs';

describe('mangaStudioEditingUtils', () => {
  const makePages = () => [
    {
      id: 'page-0',
      imagePath: '/ch/01.jpg',
      dataUrl: 'data:image/jpeg;base64,HUGE_IMAGE_BLOB_1',
      cleanDataUrl: 'data:image/jpeg;base64,CLEAN_BLOB_1',
      width: 800,
      height: 1200,
      layers: [
        {
          id: 'l1',
          text: 'Xin chào anh Hùng',
          sourceText: 'こんにちは',
          bbox: [100, 200, 120, 80],
          textBbox: [110, 210, 100, 60],
          fontFamily: 'WildWords',
          fontSize: '18',
          color: '#000000',
          strokeWidth: 1.5,
        },
        {
          id: 'l2',
          text: 'Hùng đi đâu thế?',
          sourceText: 'どこ行くの',
          bbox: [300, 400, 140, 90],
          fontFamily: 'Arial',
          fontSize: '14',
          color: '#111111',
          strokeWidth: 0,
        },
      ],
    },
    {
      id: 'page-1',
      imagePath: '/ch/02.jpg',
      dataUrl: 'data:image/jpeg;base64,HUGE_IMAGE_BLOB_2',
      width: 800,
      height: 1200,
      layers: [
        {
          id: 'l3',
          text: 'Hùng ơi đợi đã (100%)',
          bbox: [50, 60, 100, 50],
          fontFamily: 'Arial',
          color: '#222222',
        },
      ],
    },
  ];

  test('extractLayersSnapshot omits heavy dataUrls and applyLayersSnapshot restores layers cleanly', () => {
    const pages = makePages();
    const snap = extractLayersSnapshot(pages);
    expect(JSON.stringify(snap)).not.toContain('HUGE_IMAGE_BLOB');

    // Mutate pages
    const mutated = pages.map((p, idx) =>
      idx === 0 ? { ...p, layers: [{ ...p.layers[0], text: 'Edited' }] } : p
    );
    const restored = applyLayersSnapshot(mutated, snap);
    expect(restored[0].dataUrl).toBe('data:image/jpeg;base64,HUGE_IMAGE_BLOB_1');
    expect(restored[0].cleanDataUrl).toBe('data:image/jpeg;base64,CLEAN_BLOB_1');
    expect(restored[0].layers).toHaveLength(2);
    expect(restored[0].layers[0].text).toBe('Xin chào anh Hùng');
  });

  test('pushHistoryStack caps history at MAX_HISTORY_ENTRIES', () => {
    let stack = [];
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 10; i += 1) {
      stack = pushHistoryStack(stack, [{ step: i }]);
    }
    expect(stack).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(stack[0]).toEqual([{ step: 10 }]);
    expect(stack[MAX_HISTORY_ENTRIES - 1]).toEqual([{ step: MAX_HISTORY_ENTRIES + 9 }]);
  });

  test('applyTypographyStyleToPages updates typography and tracks changedLayers accurately', () => {
    const pages = makePages();
    const source = {
      ...pages[0].layers[0],
      fontFamily: 'ComicNeue',
      fontSize: '20',
      color: '#ff0000',
      strokeWidth: 2,
      strokeColor: '#ffffff',
    };

    const pageRes = applyTypographyStyleToPages(pages, source, { scope: 'page', activePageIndex: 0 });
    expect(pageRes.affectedPages).toBe(1);
    expect(pageRes.affectedLayers).toBe(2);
    expect(pageRes.changedLayers).toBe(2);
    expect(pageRes.nextPages[0].layers[1].fontFamily).toBe('ComicNeue');
    expect(pageRes.nextPages[0].layers[1].text).toBe('Hùng đi đâu thế?');
    expect(pageRes.nextPages[1].layers[0].fontFamily).toBe('Arial');

    const chapRes = applyTypographyStyleToPages(pages, source, { scope: 'all', activePageIndex: 0 });
    expect(chapRes.affectedPages).toBe(2);
    expect(chapRes.affectedLayers).toBe(3);
    expect(chapRes.changedLayers).toBe(3);
    expect(chapRes.nextPages[1].layers[0].fontFamily).toBe('ComicNeue');
    expect(chapRes.nextPages[1].layers[0].color).toBe('#ff0000');

    // No-op when applying a single layer's own style to its single-layer page
    const singlePageRes = applyTypographyStyleToPages(pages, pages[1].layers[0], { scope: 'page', activePageIndex: 1 });
    expect(singlePageRes.changedLayers).toBe(0);
  });

  test('nudgeLayerBbox preserves relative offset between bbox and textBbox when clamped at edges', () => {
    const layer = makePages()[0].layers[0]; // bbox x=100, textBbox x=110 (offset +10)
    const moved = nudgeLayerBbox(layer, -150, 50, { width: 800, height: 1200 });
    expect(moved.bbox).toEqual([0, 250, 120, 80]);
    expect(moved.textBbox).toEqual([10, 260, 100, 60]);

    const clampedMax = nudgeLayerBbox(layer, 1000, 2000, { width: 800, height: 1200 });
    expect(clampedMax.bbox).toEqual([680, 1120, 120, 80]);
    expect(clampedMax.textBbox).toEqual([690, 1130, 100, 60]);
  });

  test('countBatchFindMatches and batchReplaceLayerTexts handle Vietnamese, regex chars, and recalculate hasResidualJapanese', () => {
    const pages = makePages();

    expect(countBatchFindMatches(pages, { findText: 'hùng', scope: 'current', activePageIndex: 0 })).toEqual({
      totalMatches: 2,
      matchedLayers: 2,
    });
    expect(countBatchFindMatches(pages, { findText: 'hùng', scope: 'all', caseSensitive: true })).toEqual({
      totalMatches: 0,
      matchedLayers: 0,
    });
    expect(countBatchFindMatches(pages, { findText: '(100%)', scope: 'all' })).toEqual({
      totalMatches: 1,
      matchedLayers: 1,
    });

    const replaced = batchReplaceLayerTexts(pages, {
      findText: 'Hùng',
      replaceText: 'Minh',
      scope: 'all',
      caseSensitive: false,
    });
    expect(replaced.totalMatches).toBe(3);
    expect(replaced.replacedLayers).toBe(3);
    expect(replaced.nextPages[0].layers[0].text).toBe('Xin chào anh Minh');
    expect(replaced.nextPages[1].layers[0].text).toBe('Minh ơi đợi đã (100%)');

    // Residual Japanese flag clears when replacing leftover Japanese with Vietnamese
    const withResidual = [
      {
        id: 'p0',
        layers: [{ id: 'r1', text: 'Chào 先輩 nhé', hasResidualJapanese: true, isTranslated: false }],
      },
    ];
    const cleared = batchReplaceLayerTexts(withResidual, { findText: '先輩', replaceText: 'Tiền bối' });
    expect(cleared.nextPages[0].layers[0].text).toBe('Chào Tiền bối nhé');
    expect(cleared.nextPages[0].layers[0].hasResidualJapanese).toBe(false);
    expect(cleared.nextPages[0].layers[0].isTranslated).toBe(true);
  });
});
