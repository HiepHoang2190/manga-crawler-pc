import { TAB_HELP_MAP } from './helpTabMapping';
import { helpArticles } from './helpArticles';
import { DEFAULT_MENU_ORDER } from '../../utils/menuOrderPrefs.mjs';

describe('TAB_HELP_MAP & helpArticles', () => {
  test('every tab in DEFAULT_MENU_ORDER has a valid mapping in TAB_HELP_MAP', () => {
    for (const tabId of DEFAULT_MENU_ORDER) {
      expect(TAB_HELP_MAP[tabId]).toBeDefined();
      expect(Array.isArray(TAB_HELP_MAP[tabId])).toBe(true);
      expect(TAB_HELP_MAP[tabId].length).toBeGreaterThan(0);
    }
  });

  test('all mapped article IDs exist in both vi and en helpArticles', () => {
    const viIds = new Set(helpArticles.vi.map((a) => a.id));
    const enIds = new Set(helpArticles.en.map((a) => a.id));

    for (const [tabId, articleIds] of Object.entries(TAB_HELP_MAP)) {
      for (const articleId of articleIds) {
        expect(viIds.has(articleId)).toBe(true);
        expect(enIds.has(articleId)).toBe(true);
      }
    }
  });

  test('queue tab mapping has correct step order: queue first, then queue-management, then queue-progress', () => {
    expect(TAB_HELP_MAP.queue).toEqual([
      'queue',
      'queue-management',
      'queue-progress',
    ]);
  });

  test('queue articles have correct step numbers in titles', () => {
    const viQueue = helpArticles.vi.find((a) => a.id === 'queue');
    const viQueueMgmt = helpArticles.vi.find((a) => a.id === 'queue-management');
    const viQueueProgress = helpArticles.vi.find((a) => a.id === 'queue-progress');
    expect(viQueue.title).toMatch(/Bước 1/);
    expect(viQueueMgmt.title).toMatch(/Bước 2/);
    expect(viQueueProgress.title).toMatch(/Bước 3/);

    const enQueue = helpArticles.en.find((a) => a.id === 'queue');
    const enQueueMgmt = helpArticles.en.find((a) => a.id === 'queue-management');
    const enQueueProgress = helpArticles.en.find((a) => a.id === 'queue-progress');
    expect(enQueue.title).toMatch(/Step 1/);
    expect(enQueueMgmt.title).toMatch(/Step 2/);
    expect(enQueueProgress.title).toMatch(/Step 3/);
  });

  test('history tab has valid mapping and uses library-history.png', () => {
    expect(TAB_HELP_MAP.history).toEqual(['history']);
    const viHistory = helpArticles.vi.find((a) => a.id === 'history');
    const enHistory = helpArticles.en.find((a) => a.id === 'history');
    expect(viHistory.image).toContain('library-history.png');
    expect(enHistory.image).toContain('library-history.png');
  });

  test('home tab mapping includes crawler, queue, history, and reader articles', () => {
    expect(TAB_HELP_MAP.home).toEqual([
      'overview',
      'sidebar',
      'mangaInfo',
      'chapters',
      'chapters-cover',
      'queue',
      'queue-management',
      'queue-progress',
      'history',
      'reader',
    ]);
  });

  test('mangaInfo article accurately documents Open Drawer and Enqueue All without obsolete export buttons', () => {
    const viMangaInfo = helpArticles.vi.find((a) => a.id === 'mangaInfo');
    const viText = viMangaInfo.paragraphs.join(' ');
    expect(viText).not.toMatch(/Đóng gói CBZ/);
    expect(viText).not.toMatch(/Xuất PDF/);
    expect(viText).not.toMatch(/Đọc trong app/);
    expect(viText).toMatch(/Mở danh sách/);
    expect(viText).toMatch(/Thêm tất cả vào hàng đợi/);

    const enMangaInfo = helpArticles.en.find((a) => a.id === 'mangaInfo');
    const enText = enMangaInfo.paragraphs.join(' ');
    expect(enText).not.toMatch(/Export CBZ/);
    expect(enText).not.toMatch(/Export PDF/);
    expect(enText).not.toMatch(/Read in app/);
    expect(enText).toMatch(/Open.*chapter list/i);
    expect(enText).toMatch(/Enqueue all/i);
  });

  test('sidebar article includes information about the Cookie button', () => {
    const viSidebar = helpArticles.vi.find((a) => a.id === 'sidebar');
    const viText = viSidebar.paragraphs.join(' ');
    expect(viText).toMatch(/Cookie/i);
    expect(viText).toMatch(/Cloudflare/i);

    const enSidebar = helpArticles.en.find((a) => a.id === 'sidebar');
    const enText = enSidebar.paragraphs.join(' ');
    expect(enText).toMatch(/Cookie/i);
    expect(enText).toMatch(/Cloudflare/i);
  });

  test('crop-image article matches tools-crop.png and tools-crop-preview.png, not tools-deskew.png', () => {
    const viCrop = helpArticles.vi.find((a) => a.id === 'crop-image');
    expect(viCrop).toBeDefined();
    expect(viCrop.images[0].src).toContain('tools-crop.png');
    expect(viCrop.images[0].src).not.toContain('tools-deskew.png');
    expect(viCrop.images[1].src).toContain('tools-crop-preview.png');
    expect(viCrop.images[1].src).not.toContain('tools-deskew.png');

    const enCrop = helpArticles.en.find((a) => a.id === 'crop-image');
    expect(enCrop).toBeDefined();
    expect(enCrop.images[0].src).toContain('tools-crop.png');
    expect(enCrop.images[0].src).not.toContain('tools-deskew.png');
    expect(enCrop.images[1].src).toContain('tools-crop-preview.png');
    expect(enCrop.images[1].src).not.toContain('tools-deskew.png');
  });

  test('ebookStudio tab mapping matches real subtabs, excludes image-convert-tab, and uses correct screenshots', () => {
    // 1. Must not contain image-convert-tab
    expect(TAB_HELP_MAP.ebookStudio).not.toContain('image-convert-tab');

    // 2. Must contain the real subtabs of Convert (Ebook Studio)
    expect(TAB_HELP_MAP.ebookStudio).toEqual([
      'ebook-studio',
      'cbz-export-tab',
      'pdf-export',
      'ebook-converter',
      'ebook-tools',
      'send-to-kindle',
    ]);

    for (const lang of ['vi', 'en']) {
      const articles = helpArticles[lang];
      const cbzArt = articles.find((a) => a.id === 'cbz-export-tab');
      const pdfArt = articles.find((a) => a.id === 'pdf-export');
      const convArt = articles.find((a) => a.id === 'ebook-converter');
      const toolsArt = articles.find((a) => a.id === 'ebook-tools');
      const kindleArt = articles.find((a) => a.id === 'send-to-kindle');

      expect(cbzArt).toBeDefined();
      expect(cbzArt.image).toContain('ebook-cbz.png');
      expect(cbzArt.image).not.toContain('download-queue.png');

      expect(pdfArt).toBeDefined();
      expect(pdfArt.image).toContain('ebook-pdf.png');
      expect(pdfArt.image).not.toContain('download-queue.png');

      expect(convArt).toBeDefined();
      expect(convArt.image).toContain('ebook-converter.png');

      expect(toolsArt).toBeDefined();
      expect(toolsArt.image).toContain('ebook-tools.png');

      expect(kindleArt).toBeDefined();
      expect(kindleArt.image).toContain('ebook-kindle.png');
    }
  });

  test('explore tab mapping contains distinct articles with no duplicate screenshots', () => {
    expect(TAB_HELP_MAP.explore).toEqual([
      'explore',
      'latest-updates',
      'bulk-scan',
    ]);

    for (const lang of ['vi', 'en']) {
      const articles = helpArticles[lang];
      const exploreArt = articles.find((a) => a.id === 'explore');
      const latestArt = articles.find((a) => a.id === 'latest-updates');
      const bulkArt = articles.find((a) => a.id === 'bulk-scan');

      expect(exploreArt).toBeDefined();
      // Overview article should not have an image duplicating subtabs below it
      expect(exploreArt.image).toBeUndefined();

      expect(latestArt).toBeDefined();
      expect(latestArt.image).toContain('explore-latest-updates.png');

      expect(bulkArt).toBeDefined();
      expect(bulkArt.image).toContain('explore-bulk-scan.png');
    }
  });

  test('tools studio help leads with the image pipeline article', () => {
    expect(TAB_HELP_MAP.toolsStudio).toEqual(['tools-studio', 'image-pipeline', 'rename-tab', 'duplicates', 'upscale']);
    expect(TAB_HELP_MAP.imagePipeline).toEqual(['image-pipeline']);
  });
});


