describe('MangaStudio Export Verification Logic', () => {
  // Pure helper simulating the export filtering logic implemented in MangaStudioEditor
  function filterPagesForExport(pages, includeUntranslated) {
    const hasTranslation = (p) =>
      Array.isArray(p.layers) &&
      p.layers.some((l) => (l.text || '').trim().length > 0);

    const translatedPages = pages.filter(hasTranslation);
    const untranslatedPages = pages.filter((p) => !hasTranslation(p));

    if (untranslatedPages.length === 0 || includeUntranslated) {
      return {
        pagesToExport: pages,
        translatedCount: translatedPages.length,
        untranslatedCount: untranslatedPages.length,
        isPartial: untranslatedPages.length > 0 && translatedPages.length > 0,
        isAllUntranslated: translatedPages.length === 0,
      };
    }

    return {
      pagesToExport: translatedPages,
      translatedCount: translatedPages.length,
      untranslatedCount: untranslatedPages.length,
      isPartial: untranslatedPages.length > 0 && translatedPages.length > 0,
      isAllUntranslated: translatedPages.length === 0,
    };
  }

  const samplePages = [
    {
      id: 'page-1',
      filename: '001.png',
      layers: [
        { id: 'l1', sourceText: 'こんにちは', text: 'Xin chào' },
        { id: 'l2', sourceText: '世界', text: 'Thế giới' }
      ]
    },
    {
      id: 'page-2',
      filename: '002.png',
      layers: [] // No layers
    },
    {
      id: 'page-3',
      filename: '003.png',
      layers: [
        { id: 'l3', sourceText: 'テスト', text: '' } // Bubble detected with sourceText but empty translation
      ]
    },
    {
      id: 'page-4',
      filename: '004.png',
      layers: [
        { id: 'l4', sourceText: 'おはよう', text: 'Chào buổi sáng' }
      ]
    }
  ];

  it('correctly categorizes translated and untranslated pages', () => {
    const result = filterPagesForExport(samplePages, true);
    expect(result.translatedCount).toBe(2);
    expect(result.untranslatedCount).toBe(2);
    expect(result.isPartial).toBe(true);
    expect(result.isAllUntranslated).toBe(false);
  });

  it('exports all pages (including original untranslated) when includeUntranslated is true', () => {
    const result = filterPagesForExport(samplePages, true);
    expect(result.pagesToExport.length).toBe(4);
    expect(result.pagesToExport.map(p => p.id)).toEqual(['page-1', 'page-2', 'page-3', 'page-4']);
  });

  it('exports only translated pages when user unchecks includeUntranslated', () => {
    const result = filterPagesForExport(samplePages, false);
    expect(result.pagesToExport.length).toBe(2);
    expect(result.pagesToExport.map(p => p.id)).toEqual(['page-1', 'page-4']);
  });

  it('detects when entire chapter has no translations at all', () => {
    const emptyPages = [
      { id: 'p-1', filename: '01.png', layers: [] },
      { id: 'p-2', filename: '02.png', layers: [{ sourceText: 'raw', text: '   ' }] }
    ];
    const result = filterPagesForExport(emptyPages, true);
    expect(result.isAllUntranslated).toBe(true);
    expect(result.translatedCount).toBe(0);
    expect(result.untranslatedCount).toBe(2);
  });
});
