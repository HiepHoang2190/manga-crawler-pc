const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  createAdapters,
  parseRangeValues,
  matchesRange,
} = require('../../workflow/adapters');
const { WorkflowEngine } = require('../../workflow/workflowEngine');

describe('Workflow Adapters & Execution', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-adapter-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('parseRangeValues parses various range expressions', () => {
    expect(parseRangeValues('1-5')).toEqual([{ type: 'range', min: 1, max: 5 }]);
    expect(parseRangeValues('8')).toEqual([{ type: 'single', val: 8 }]);
    expect(parseRangeValues('1-3, 7, 10-12')).toEqual([
      { type: 'range', min: 1, max: 3 },
      { type: 'single', val: 7 },
      { type: 'range', min: 10, max: 12 },
    ]);
  });

  test('matchesRange tests number inclusion correctly', () => {
    const ranges = parseRangeValues('1-3, 7, 10-12');
    expect(matchesRange(1, ranges)).toBe(true);
    expect(matchesRange(2, ranges)).toBe(true);
    expect(matchesRange(3, ranges)).toBe(true);
    expect(matchesRange(5, ranges)).toBe(false);
    expect(matchesRange(7, ranges)).toBe(true);
    expect(matchesRange(11, ranges)).toBe(true);
    expect(matchesRange(15, ranges)).toBe(false);
  });

  test('chapter_selector filters chapters with latest strategy', async () => {
    const adapters = createAdapters();
    const node = { data: { strategy: 'latest', latestCount: 2 } };
    const inputs = {
      chapter_list: [
        { id: '1', title: 'Chapter 1', chapterNumber: 1, url: 'https://site.com/c1' },
        { id: '2', title: 'Chapter 2', chapterNumber: 2, url: 'https://site.com/c2' },
        { id: '3', title: 'Chapter 3', chapterNumber: 3, url: 'https://site.com/c3' },
      ],
      mangaTitle: 'Test Manga',
    };

    const out = await adapters.chapter_selector(node, inputs, () => {});
    expect(out.chapter_list.length).toBe(2);
    expect(out.chapter_list.map((c) => c.id)).toEqual(['2', '3']);
    expect(out.mangaTitle).toBe('Test Manga');
  });

  test('chapter_selector filters chapters with range strategy', async () => {
    const adapters = createAdapters();
    const node = { data: { strategy: 'range', rangeValue: '1, 3' } };
    const inputs = {
      chapter_list: [
        { id: '1', title: 'Chapter 1', chapterNumber: 1, url: 'https://site.com/c1' },
        { id: '2', title: 'Chapter 2', chapterNumber: 2, url: 'https://site.com/c2' },
        { id: '3', title: 'Chapter 3', chapterNumber: 3, url: 'https://site.com/c3' },
      ],
      mangaTitle: 'Test Manga',
    };

    const out = await adapters.chapter_selector(node, inputs, () => {});
    expect(out.chapter_list.length).toBe(2);
    expect(out.chapter_list.map((c) => c.id)).toEqual(['1', '3']);
  });

  test('executes end-to-end flow: manual_trigger -> chapter_selector -> downloader -> export_cbz', async () => {
    const mockChapters = [
      { id: 'c1', title: 'Chapter 1', chapterNumber: 1, url: 'https://cuutruyen.net/manga/1/c1' },
      { id: 'c2', title: 'Chapter 2', chapterNumber: 2, url: 'https://cuutruyen.net/manga/1/c2' },
    ];

    const mockConnectors = {
      detectSiteIdFromUrl: () => 'cuutruyen',
      load: async () => ({
        ok: true,
        manga: { title: 'One Piece' },
        chapters: mockChapters,
      }),
      downloadChapter: async (siteId, payload) => {
        const chapDir = path.join(payload.baseSaveDir, payload.mangaTitle, payload.chapterTitle);
        fs.mkdirSync(chapDir, { recursive: true });
        fs.writeFileSync(path.join(chapDir, '001.jpg'), 'image-bytes');
        return { ok: true, outputDir: chapDir };
      },
    };

    const downloadDest = path.join(tempDir, 'custom_downloads');
    const cbzDest = path.join(tempDir, 'cbz_output');

    const adapters = createAdapters({ connectors: mockConnectors });
    const engine = new WorkflowEngine({ adapters });

    const graph = {
      nodes: [
        { id: 'n1', type: 'manual_trigger', data: { defaultUrl: 'https://cuutruyen.net/manga/1' } },
        { id: 'n2', type: 'chapter_selector', data: { strategy: 'latest', latestCount: 1 } },
        { id: 'n3', type: 'downloader', data: { outputBaseDir: downloadDest } },
        { id: 'n4', type: 'export_cbz', data: { outputDir: cbzDest } },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'url', target: 'n2', targetHandle: 'url' },
        { id: 'e2', source: 'n2', sourceHandle: 'chapter_list', target: 'n3', targetHandle: 'chapter_list' },
        { id: 'e3', source: 'n3', sourceHandle: 'images_dir', target: 'n4', targetHandle: 'images_dir' },
      ],
    };

    const progressEvents = [];
    const runResult = await engine.run('test_run_e2e', graph, (evt) => progressEvents.push(evt));

    expect(runResult.status).toBe('completed');
    expect(runResult.nodeStates.n1.status).toBe('completed');
    expect(runResult.nodeStates.n2.status).toBe('completed');
    expect(runResult.nodeStates.n3.status).toBe('completed');
    expect(runResult.nodeStates.n4.status).toBe('completed');

    // Verify downloader created images
    expect(fs.existsSync(downloadDest)).toBe(true);

    // Verify export_cbz created .cbz file
    const cbzFile = runResult.nodeStates.n4.outputData.book_file.path;
    expect(fs.existsSync(cbzFile)).toBe(true);
    expect(path.extname(cbzFile)).toBe('.cbz');

    // Verify all_completed event includes targetPath
    const allCompletedEvt = progressEvents.find((e) => e.event === 'all_completed');
    expect(allCompletedEvt).toBeDefined();
    expect(allCompletedEvt.targetPath).toBe(cbzFile);
  });

  test('downloader defaults to ipc_context.readSettings().lastSaveDir when outputBaseDir is empty', async () => {
    const defaultSettingsDir = path.join(tempDir, 'settings_downloads');
    const mockIpcContext = {
      readSettings: () => ({ lastSaveDir: defaultSettingsDir }),
      getDefaultMangaSaveDir: () => path.join(tempDir, 'system_default_manga'),
    };

    const mockConnectors = {
      downloadChapter: async (siteId, payload) => {
        const chapDir = path.join(payload.baseSaveDir, payload.mangaTitle, payload.chapterTitle);
        fs.mkdirSync(chapDir, { recursive: true });
        return { ok: true, outputDir: chapDir };
      },
    };

    const adapters = createAdapters({ ipc_context: mockIpcContext, connectors: mockConnectors });
    const node = { data: {} };
    const inputs = {
      chapter_list: [{ title: 'Chapter 1', url: 'https://site.com/c1' }],
      mangaTitle: 'Settings Manga Test',
    };

    const out = await adapters.downloader(node, inputs, () => {});
    expect(out.baseSaveDir).toBe(defaultSettingsDir);
    expect(fs.existsSync(defaultSettingsDir)).toBe(true);
  });

  test('trash_cleanup safely trashes images_dir and preserves book_file', async () => {
    const rawImagesDir = path.join(tempDir, 'raw_manga_folder');
    fs.mkdirSync(rawImagesDir, { recursive: true });
    fs.writeFileSync(path.join(rawImagesDir, '001.jpg'), 'image content');

    // Create a book file outside the folder
    const cbzFile = path.join(tempDir, 'comic.cbz');
    fs.writeFileSync(cbzFile, 'cbz content');

    const trashedPaths = [];
    const mockIpcContext = {
      trashItem: async (p) => {
        trashedPaths.push(p);
        fs.rmSync(p, { recursive: true, force: true });
      },
    };

    const adapters = createAdapters({ ipc_context: mockIpcContext });
    const node = { data: { preserveBookFiles: true } };
    const inputs = {
      images_dir: rawImagesDir,
      book_file: { path: cbzFile, format: 'cbz' },
    };

    const out = await adapters.trash_cleanup(node, inputs, () => {});

    expect(out.signal.status).toBe('success');
    expect(trashedPaths).toContain(rawImagesDir);
    expect(fs.existsSync(rawImagesDir)).toBe(false);
    expect(fs.existsSync(cbzFile)).toBe(true);
  });

  test('trash_cleanup protects book_file if nested inside images_dir before trashing', async () => {
    const rawImagesDir = path.join(tempDir, 'nested_manga_folder');
    fs.mkdirSync(rawImagesDir, { recursive: true });
    fs.writeFileSync(path.join(rawImagesDir, '001.jpg'), 'image content');

    // Create a book file INSIDE the folder that is about to be trashed
    const insideCbz = path.join(rawImagesDir, 'nested_manga.cbz');
    fs.writeFileSync(insideCbz, 'nested cbz content');

    const trashedPaths = [];
    const mockIpcContext = {
      trashItem: async (p) => {
        trashedPaths.push(p);
        fs.rmSync(p, { recursive: true, force: true });
      },
    };

    const adapters = createAdapters({ ipc_context: mockIpcContext });
    const node = { data: { preserveBookFiles: true } };
    const inputs = {
      images_dir: rawImagesDir,
      book_file: { path: insideCbz, format: 'cbz' },
    };

    const out = await adapters.trash_cleanup(node, inputs, () => {});

    expect(out.signal.status).toBe('success');
    expect(fs.existsSync(rawImagesDir)).toBe(false);
    // Verified that out.book_file.path was moved out to parent and preserved!
    expect(fs.existsSync(out.book_file.path)).toBe(true);
    expect(out.book_file.path).not.toBe(insideCbz);
    expect(path.dirname(out.book_file.path)).toBe(tempDir);
  });

  test('executes end-to-end flow with trash_cleanup: downloader -> export_cbz -> trash_cleanup', async () => {
    const mockChapters = [
      { id: '1', title: 'Chapter 1', chapterNumber: 1, url: 'https://cuutruyen.net/manga/1/c1' },
    ];

    const mockConnectors = {
      detectSiteIdFromUrl: () => 'cuutruyen',
      load: async () => ({
        ok: true,
        manga: { title: 'Clean Manga' },
        chapters: mockChapters,
      }),
      downloadChapter: async (siteId, payload) => {
        const chapDir = path.join(payload.baseSaveDir, payload.mangaTitle, payload.chapterTitle);
        fs.mkdirSync(chapDir, { recursive: true });
        fs.writeFileSync(path.join(chapDir, '001.jpg'), 'image-bytes');
        return { ok: true, outputDir: chapDir };
      },
    };

    const downloadDest = path.join(tempDir, 'e2e_downloads');
    const trashedItems = [];
    const mockIpcContext = {
      trashItem: async (p) => {
        trashedItems.push(p);
        fs.rmSync(p, { recursive: true, force: true });
      },
    };

    const adapters = createAdapters({ connectors: mockConnectors, ipc_context: mockIpcContext });
    const engine = new WorkflowEngine({ adapters });

    const graph = {
      nodes: [
        { id: 'n1', type: 'manual_trigger', data: { defaultUrl: 'https://cuutruyen.net/manga/1' } },
        { id: 'n2', type: 'chapter_selector', data: { strategy: 'latest', latestCount: 1 } },
        { id: 'n3', type: 'downloader', data: { outputBaseDir: downloadDest } },
        { id: 'n4', type: 'export_cbz', data: {} },
        { id: 'n5', type: 'trash_cleanup', data: { preserveBookFiles: true } },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'url', target: 'n2', targetHandle: 'url' },
        { id: 'e2', source: 'n2', sourceHandle: 'chapter_list', target: 'n3', targetHandle: 'chapter_list' },
        { id: 'e3', source: 'n3', sourceHandle: 'images_dir', target: 'n4', targetHandle: 'images_dir' },
        { id: 'e4', source: 'n4', sourceHandle: 'images_dir', target: 'n5', targetHandle: 'images_dir' },
      ],
    };

    const runResult = await engine.run('test_run_cleanup_e2e', graph);

    expect(runResult.status).toBe('completed');
    expect(runResult.nodeStates.n4.status).toBe('completed');
    expect(runResult.nodeStates.n5.status).toBe('completed');

    // CBZ file exists and is intact
    const cbzPath = runResult.nodeStates.n4.outputData.book_file.path;
    expect(fs.existsSync(cbzPath)).toBe(true);

    // Downloaded raw images were moved to trash
    expect(trashedItems.length).toBeGreaterThan(0);
  });

  test('chapter_selector defaults to strategy: all and selects all chapters', async () => {
    const adapters = createAdapters();
    const node = { data: {} }; // no strategy specified -> defaults to 'all'
    const inputs = {
      chapter_list: [
        { id: 'c1', title: 'Chapter 1', chapterNumber: 1 },
        { id: 'c2', title: 'Chapter 2', chapterNumber: 2 },
        { id: 'c3', title: 'Chapter 3', chapterNumber: 3 },
      ],
      mangaTitle: 'Default All Manga',
    };

    const out = await adapters.chapter_selector(node, inputs, () => {});
    expect(out.chapter_list.length).toBe(3);
    expect(out.chapter_list.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  test('chapter_selector supports strategy: custom with selectedChapterIds', async () => {
    const adapters = createAdapters();
    const node = {
      data: {
        strategy: 'custom',
        selectedChapterIds: ['c1', 'c3'],
      },
    };
    const inputs = {
      chapter_list: [
        { id: 'c1', title: 'Chapter 1', chapterNumber: 1 },
        { id: 'c2', title: 'Chapter 2', chapterNumber: 2 },
        { id: 'c3', title: 'Chapter 3', chapterNumber: 3 },
      ],
    };

    const out = await adapters.chapter_selector(node, inputs, () => {});
    expect(out.chapter_list.length).toBe(2);
    expect(out.chapter_list.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  test('downloader clamps concurrency strictly to maximum 5', async () => {
    let passedConcurrency = null;
    const mockConnectors = {
      downloadChapter: async (siteId, payload) => {
        passedConcurrency = payload.numberOfThreads;
        const chapDir = path.join(payload.baseSaveDir, payload.mangaTitle, payload.chapterTitle);
        fs.mkdirSync(chapDir, { recursive: true });
        return { ok: true, outputDir: chapDir };
      },
    };

    const adapters = createAdapters({ connectors: mockConnectors });
    const node = {
      data: {
        concurrency: 12, // Attempt to set higher than 5
        outputBaseDir: tempDir,
      },
    };
    const inputs = {
      chapter_list: [{ title: 'Chapter 1', url: 'https://site.com/c1' }],
      mangaTitle: 'Concurrency Clamp Test',
    };

    await adapters.downloader(node, inputs, () => {});
    expect(passedConcurrency).toBe(5);
  });

  test('rename_folder auto-normalizes chapter folders to padded format like Tab Doi Ten', async () => {
    const mangaDir = path.join(tempDir, 'normalize_test_manga');
    const chap1Dir = path.join(mangaDir, 'Chap 1');
    const chap10Dir = path.join(mangaDir, 'Chap 10');
    fs.mkdirSync(chap1Dir, { recursive: true });
    fs.mkdirSync(chap10Dir, { recursive: true });
    fs.writeFileSync(path.join(chap1Dir, '001.jpg'), 'img');
    fs.writeFileSync(path.join(chap10Dir, '001.jpg'), 'img');

    const adapters = createAdapters();
    const node = { data: { mode: 'autoNormalize' } };
    const inputs = { images_dir: mangaDir, mangaTitle: 'Normalize Test Manga' };

    const out = await adapters.rename_folder(node, inputs, () => {});
    expect(out.images_dir).toBe(mangaDir);

    // Verify subfolders are now padded
    expect(fs.existsSync(path.join(mangaDir, 'Chap 01')) || fs.existsSync(path.join(mangaDir, 'Chap 001'))).toBe(true);
    expect(fs.existsSync(path.join(mangaDir, 'Chap 10'))).toBe(true);
  });

  test('duplicate_cleaner skips groups with count < minDuplicateCount and trashes extras for groups >= minDuplicateCount', async () => {
    const mangaDir = path.join(tempDir, 'dup_test_manga');
    fs.mkdirSync(mangaDir, { recursive: true });

    const trashedPaths = [];
    const mockIpcContext = {
      trashItem: async (p) => {
        trashedPaths.push(p);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      },
    };

    const duplicateScanner = require('../../export/image/duplicateImageScanner');
    const originalFindDuplicates = duplicateScanner.findDuplicatesInDirectory;

    // Mock duplicate scanner to return 1 small group (< 3) and 1 qualified group (>= 3)
    const file1 = path.join(mangaDir, 'p1.jpg');
    const file2 = path.join(mangaDir, 'p2.jpg');
    const file3 = path.join(mangaDir, 'dup_a.jpg');
    const file4 = path.join(mangaDir, 'dup_b.jpg');
    const file5 = path.join(mangaDir, 'dup_c.jpg');

    [file1, file2, file3, file4, file5].forEach((f) => fs.writeFileSync(f, 'dummy content'));

    duplicateScanner.findDuplicatesInDirectory = async () => ({
      duplicateGroups: [
        {
          hash: 'hash_small',
          files: [{ fullPath: file1 }, { fullPath: file2 }], // length 2 (< minDuplicateCount 3) -> SKIP
        },
        {
          hash: 'hash_big',
          files: [{ fullPath: file3 }, { fullPath: file4 }, { fullPath: file5 }], // length 3 (>= minDuplicateCount 3) -> CLEAN
        },
      ],
    });

    try {
      const adapters = createAdapters({ ipc_context: mockIpcContext });
      const node = {
        data: {
          minDuplicateCount: 3,
          action: 'trash',
        },
      };
      const inputs = { images_dir: mangaDir, mangaTitle: 'Dup Test' };

      await adapters.duplicate_cleaner(node, inputs, () => {});

      // file1 and file2 should NOT be trashed because group has only 2 files
      expect(trashedPaths).not.toContain(file1);
      expect(trashedPaths).not.toContain(file2);

      // In the qualified group (dup_a, dup_b, dup_c), 1 is kept (first one), the others are trashed
      expect(trashedPaths.length).toBe(2);
      expect(trashedPaths).toContain(file4);
      expect(trashedPaths).toContain(file5);
      expect(trashedPaths).not.toContain(file3);
    } finally {
      duplicateScanner.findDuplicatesInDirectory = originalFindDuplicates;
    }
  });

  test('upload_google_drive (desktop_sync) copies book file to Google Drive sync folder', async () => {
    const gdriveSyncDir = path.join(tempDir, 'mock_google_drive_folder');
    const sourceBookDir = path.join(tempDir, 'source_books');
    fs.mkdirSync(sourceBookDir, { recursive: true });
    const bookFilePath = path.join(sourceBookDir, 'Naruto_Chap_001.cbz');
    fs.writeFileSync(bookFilePath, 'fake cbz content');

    const adapters = createAdapters({});
    const node = {
      data: {
        uploadMode: 'desktop_sync',
        syncFolderPath: gdriveSyncDir,
        deleteAfterUpload: false,
      },
    };
    const inputs = {
      book_file: { path: bookFilePath, name: 'Naruto_Chap_001.cbz' },
    };

    const progressMsgs = [];
    const result = await adapters.upload_google_drive(node, inputs, (evt) => progressMsgs.push(evt.message));

    expect(result.signal.status).toBe('uploaded');
    expect(result.signal.mode).toBe('desktop_sync');
    const expectedDest = path.join(gdriveSyncDir, 'Naruto_Chap_001.cbz');
    expect(fs.existsSync(expectedDest)).toBe(true);
    expect(fs.readFileSync(expectedDest, 'utf8')).toBe('fake cbz content');
    // Source file should still exist because deleteAfterUpload is false
    expect(fs.existsSync(bookFilePath)).toBe(true);
  });

  test('upload_google_drive (desktop_sync with deleteAfterUpload) removes source file', async () => {
    const gdriveSyncDir = path.join(tempDir, 'mock_google_drive_folder_del');
    const sourceBookDir = path.join(tempDir, 'source_books_del');
    fs.mkdirSync(sourceBookDir, { recursive: true });
    const bookFilePath = path.join(sourceBookDir, 'OnePiece_001.cbz');
    fs.writeFileSync(bookFilePath, 'one piece cbz content');

    const adapters = createAdapters({});
    const node = {
      data: {
        uploadMode: 'desktop_sync',
        syncFolderPath: gdriveSyncDir,
        deleteAfterUpload: true,
      },
    };
    const inputs = {
      book_file: { path: bookFilePath },
    };

    const result = await adapters.upload_google_drive(node, inputs, () => {});

    expect(result.signal.status).toBe('uploaded');
    const expectedDest = path.join(gdriveSyncDir, 'OnePiece_001.cbz');
    expect(fs.existsSync(expectedDest)).toBe(true);
    // Source file was removed/trashed
    expect(fs.existsSync(bookFilePath)).toBe(false);
  });

  test('upload_google_drive throws error if missing files or access token', async () => {
    const adapters = createAdapters({});

    // Missing file
    await expect(
      adapters.upload_google_drive({ data: { uploadMode: 'desktop_sync' } }, {})
    ).rejects.toThrow('Không tìm thấy tệp sách hoặc thư mục hợp lệ để tải lên Google Drive');

    // Missing token in API mode
    const fakeBook = path.join(tempDir, 'test.cbz');
    fs.writeFileSync(fakeBook, 'abc');
    await expect(
      adapters.upload_google_drive(
        { data: { uploadMode: 'api_token', accessToken: '' } },
        { book_file: { path: fakeBook } }
      )
    ).rejects.toThrow('Chưa cung cấp Google Drive Access Token.');
  });

  test('folder_trigger returns images_dir and mangaTitle when folder exists', async () => {
    const mockMangaDir = path.join(tempDir, 'OnePiece_Local');
    fs.mkdirSync(mockMangaDir, { recursive: true });

    const adapters = createAdapters({});
    const node = {
      data: {
        folderPath: mockMangaDir,
        mangaTitle: 'One Piece Custom',
      },
    };

    const result = await adapters.folder_trigger(node, {}, () => {});
    expect(result.images_dir).toBe(mockMangaDir);
    expect(result.mangaTitle).toBe('One Piece Custom');
    expect(result.signal.status).toBe('ready');
  });

  test('folder_trigger throws error when folderPath is empty or not found', async () => {
    const adapters = createAdapters({});

    await expect(
      adapters.folder_trigger({ data: { folderPath: '' } }, {}, () => {})
    ).rejects.toThrow('Chưa chọn thư mục đầu vào trong khối "Thư Mục Trên Máy"');

    await expect(
      adapters.folder_trigger({ data: { folderPath: '/non/existent/path/999' } }, {}, () => {})
    ).rejects.toThrow('Thư mục không tồn tại');
  });

  test('manga_crawler adapter throws error when URL is empty', async () => {
    const adapters = createAdapters({});
    await expect(
      adapters.manga_crawler({ data: { defaultUrl: '' } }, {}, () => {})
    ).rejects.toThrow('Chưa nhập URL truyện đầu vào trong khối "Tải Truyện Từ Web"');
  });

  test('manga_crawler adapter successfully fetches chapters, filters, and downloads', async () => {
    const mockSaveDir = path.join(tempDir, 'crawler_output');
    fs.mkdirSync(mockSaveDir, { recursive: true });

    const fakeConnectors = {
      detectSiteIdFromUrl: () => 'mock_site',
      load: jest.fn().mockResolvedValue({
        ok: true,
        manga: { title: 'Spy x Family', coverUrl: 'http://img.test/cover.jpg' },
        chapters: [
          { id: 'ch1', title: 'Chapter 1', url: 'http://site.test/ch1', chapterNumber: 1 },
          { id: 'ch2', title: 'Chapter 2', url: 'http://site.test/ch2', chapterNumber: 2 },
          { id: 'ch3', title: 'Chapter 3', url: 'http://site.test/ch3', chapterNumber: 3 },
        ],
      }),
      downloadChapter: jest.fn().mockImplementation(async (siteId, optsOrUrl, maybeDir) => {
        const chDir = typeof optsOrUrl === 'object'
          ? path.join(optsOrUrl.baseSaveDir, optsOrUrl.mangaTitle || 'Manga', optsOrUrl.chapterTitle || 'Chap')
          : (maybeDir || path.join(mockSaveDir, 'ch'));
        fs.mkdirSync(chDir, { recursive: true });
        fs.writeFileSync(path.join(chDir, '001.jpg'), 'fake-image-bytes');
        return { ok: true, count: 1, outputDir: chDir };
      }),
    };

    const adapters = createAdapters({
      connectors: fakeConnectors,
      ipc_context: {
        readSettings: () => ({ lastSaveDir: mockSaveDir }),
      },
    });

    const node = {
      data: {
        defaultUrl: 'https://site.test/manga/spyxfamily',
        strategy: 'latest',
        latestCount: 2,
        outputBaseDir: mockSaveDir,
        concurrency: 2,
      },
    };

    const progressLogs = [];
    const result = await adapters.manga_crawler(node, {}, (p) => progressLogs.push(p));

    expect(result.mangaTitle).toBe('Spy x Family');
    expect(result.totalChapters).toBe(2);
    expect(result.completedChapters.length).toBe(2);
    expect(fs.existsSync(result.images_dir)).toBe(true);
    expect(progressLogs.some((l) => l.step === 'download')).toBe(true);
  });

  test('duplicate_cleaner uses data.folderPath when inputs.images_dir is missing (standalone mode)', async () => {
    const localDir = path.join(tempDir, 'cleaner_standalone');
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(path.join(localDir, 'test.jpg'), 'fake-image');

    const adapters = createAdapters({});
    const node = {
      data: {
        folderPath: localDir,
        minDuplicateCount: 3,
      },
    };

    const progressMessages = [];
    const result = await adapters.duplicate_cleaner(node, {}, (p) => progressMessages.push(p.message));
    expect(result.images_dir).toBe(localDir);
    expect(progressMessages.some((m) => m.includes('Đang quét ảnh trùng lặp'))).toBe(true);
  });

  test('duplicate_cleaner throws descriptive error when neither input nor data.folderPath is provided', async () => {
    const adapters = createAdapters({});
    const node = { data: { folderPath: '' } };

    await expect(adapters.duplicate_cleaner(node, {}, () => {}))
      .rejects.toThrow('Chưa kết nối thư mục đầu vào hoặc chưa chọn thư mục trong phần cài đặt của khối Lọc & Xoá Ảnh Trùng.');
  });

  test('upload_google_drive (desktop_sync) handles same source and destination without error or deletion', async () => {
    const syncDir = path.join(tempDir, 'same_dir_sync');
    fs.mkdirSync(syncDir, { recursive: true });
    const bookFilePath = path.join(syncDir, 'OnePiece_001.cbz');
    fs.writeFileSync(bookFilePath, 'same dir content');

    const adapters = createAdapters({});
    const node = {
      data: {
        uploadMode: 'desktop_sync',
        syncFolderPath: syncDir,
        deleteAfterUpload: true,
      },
    };
    const inputs = {
      book_file: { path: bookFilePath },
    };

    const progressMessages = [];
    const result = await adapters.upload_google_drive(node, inputs, (p) => progressMessages.push(p.message));

    expect(result.signal.status).toBe('uploaded');
    expect(fs.existsSync(bookFilePath)).toBe(true);
    expect(fs.readFileSync(bookFilePath, 'utf-8')).toBe('same dir content');
    expect(progressMessages.some((m) => m.includes('đã nằm sẵn trong thư mục đích'))).toBe(true);
  });

  test('upload_google_drive (api_token) sets Content-Range header and strips Bearer prefix from accessToken', async () => {
    const axios = require('axios');
    const fakeBook = path.join(tempDir, 'sample_manga.cbz');
    fs.writeFileSync(fakeBook, 'fake cbz binary content');
    const fileSize = fs.statSync(fakeBook).size;

    let capturedPostHeaders = null;
    let capturedPutHeaders = null;

    const spyPost = jest.spyOn(axios, 'post').mockImplementation(async (_url, _data, config) => {
      capturedPostHeaders = config?.headers;
      return {
        headers: { location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock_session_123' },
      };
    });

    const spyPut = jest.spyOn(axios, 'put').mockImplementation(async (_url, stream, config) => {
      capturedPutHeaders = config?.headers;
      await new Promise((resolve) => {
        stream.on('data', () => {});
        stream.on('end', resolve);
        stream.on('error', resolve);
      });
      return {
        data: { id: 'drive_file_id_999', webViewLink: 'https://drive.google.com/file/d/drive_file_id_999/view' },
      };
    });

    try {
      const adapters = createAdapters({});
      const node = {
        data: {
          uploadMode: 'api_token',
          accessToken: 'Bearer  ya29.sample_oauth_token_with_bearer_prefix ',
          targetFolderId: 'folder_target_456',
        },
      };
      const inputs = {
        book_file: { path: fakeBook },
      };

      const result = await adapters.upload_google_drive(node, inputs, () => {});

      expect(result.signal.status).toBe('uploaded');
      expect(result.signal.fileId).toBe('drive_file_id_999');
      expect(result.signal.driveUrl).toBe('https://drive.google.com/file/d/drive_file_id_999/view');

      // Verify Authorization header was stripped of double Bearer
      expect(capturedPostHeaders?.Authorization).toBe('Bearer ya29.sample_oauth_token_with_bearer_prefix');

      // Verify Content-Range and Content-Length headers were set on PUT
      expect(capturedPutHeaders?.['Content-Length']).toBe(fileSize);
      expect(capturedPutHeaders?.['Content-Range']).toBe(`bytes 0-${fileSize - 1}/${fileSize}`);
    } finally {
      spyPost.mockRestore();
      spyPut.mockRestore();
    }
  });

  test('upload_google_drive (api_token) formats and surfaces Google API error response body', async () => {
    const axios = require('axios');
    const fakeBook = path.join(tempDir, 'error_sample.cbz');
    fs.writeFileSync(fakeBook, 'some content');

    const apiError = new Error('Request failed with status code 401');
    apiError.response = {
      status: 401,
      data: {
        error: {
          code: 401,
          message: 'Invalid Credentials: token has expired',
        },
      },
    };

    const spyPost = jest.spyOn(axios, 'post').mockRejectedValue(apiError);

    try {
      const adapters = createAdapters({});
      const node = {
        data: {
          uploadMode: 'api_token',
          accessToken: 'ya29.expired_token',
        },
      };
      const inputs = {
        book_file: { path: fakeBook },
      };

      await expect(adapters.upload_google_drive(node, inputs, () => {}))
        .rejects.toThrow(/\[Google API 401\] Invalid Credentials: token has expired/);
    } finally {
      spyPost.mockRestore();
    }
  });

  test('export_epub creates .epub file and returns book_file in workflow', async () => {
    const imagesDir = path.join(tempDir, 'epub_flow_images');
    fs.mkdirSync(imagesDir, { recursive: true });
    fs.writeFileSync(path.join(imagesDir, '01.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

    const destDir = path.join(tempDir, 'epub_flow_out');
    const adapters = createAdapters({});
    const node = { data: { outputDir: destDir } };
    const inputs = { images_dir: imagesDir, mangaTitle: 'Epub Flow Test' };

    const result = await adapters.export_epub(node, inputs, () => {});
    expect(result.book_file.format).toBe('epub');
    expect(fs.existsSync(result.book_file.path)).toBe(true);
    expect(result.book_file.path.endsWith('.epub')).toBe(true);
  });

  test('convert_book converts book_file to target format (e.g. EPUB to CBZ)', async () => {
    const imagesDir = path.join(tempDir, 'convert_flow_images');
    fs.mkdirSync(imagesDir, { recursive: true });
    const imgPath = path.join(imagesDir, '01.png');
    fs.writeFileSync(imgPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    const epubPath = path.join(tempDir, 'source_book.epub');
    const { buildEpubFromImages } = require('../../export/epub/exportEpubCore');
    await buildEpubFromImages({
      images: [{ path: imgPath }],
      outputPath: epubPath,
    });

    const destDir = path.join(tempDir, 'convert_flow_out');
    const adapters = createAdapters({});
    const node = { data: { targetFormat: 'cbz', outputDir: destDir } };
    const inputs = { book_file: { path: epubPath } };

    const result = await adapters.convert_book(node, inputs, () => {});
    expect(result.book_file.format).toBe('cbz');
    expect(fs.existsSync(result.book_file.path)).toBe(true);
  });

  test('convert_book extracts book to images folder when targetFormat is folder', async () => {
    const imagesDir = path.join(tempDir, 'convert_to_folder_src');
    fs.mkdirSync(imagesDir, { recursive: true });
    const imgPath = path.join(imagesDir, '01.png');
    fs.writeFileSync(imgPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    const epubPath = path.join(tempDir, 'source_extract.epub');
    const { buildEpubFromImages } = require('../../export/epub/exportEpubCore');
    await buildEpubFromImages({
      images: [{ path: imgPath }],
      outputPath: epubPath,
    });

    const destDir = path.join(tempDir, 'convert_extracted_out');
    const adapters = createAdapters({});
    const node = { data: { targetFormat: 'folder', outputDir: destDir } };
    const inputs = { book_file: { path: epubPath } };

    const result = await adapters.convert_book(node, inputs, () => {});
    expect(result.book_file).toBeNull();
    expect(result.images_dir).toBeDefined();
    expect(fs.existsSync(result.images_dir)).toBe(true);
    expect(result.signal.status).toBe('success');
  });

  test('image_compress compresses images in-place and calls onProgress', async () => {
    const imagesDir = path.join(tempDir, 'compress_in_place');
    fs.mkdirSync(imagesDir, { recursive: true });
    const imgPath = path.join(imagesDir, '01.png');
    fs.writeFileSync(imgPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

    const progressMessages = [];
    const adapters = createAdapters({});
    const node = { data: { quality: 85, inPlace: true } };
    const inputs = { images_dir: imagesDir, mangaTitle: 'Compress Test' };

    const result = await adapters.image_compress(node, inputs, (p) => progressMessages.push(p.message));
    expect(result.images_dir).toBe(imagesDir);
    expect(result.signal.status).toBe('success');
    expect(fs.existsSync(imgPath)).toBe(true);
    expect(progressMessages.length).toBeGreaterThan(0);
  });

  test('image_compress outputs to custom directory when inPlace is false', async () => {
    const imagesDir = path.join(tempDir, 'compress_custom_in');
    const customOut = path.join(tempDir, 'compress_custom_out');
    fs.mkdirSync(imagesDir, { recursive: true });
    const imgPath = path.join(imagesDir, 'test.png');
    fs.writeFileSync(imgPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

    const adapters = createAdapters({});
    const node = { data: { quality: 80, inPlace: false, outputDir: customOut } };
    const inputs = { images_dir: imagesDir, mangaTitle: 'Compress Custom' };

    const result = await adapters.image_compress(node, inputs, () => {});
    expect(result.images_dir).toBe(customOut);
    expect(result.signal.status).toBe('success');
    expect(fs.existsSync(path.join(customOut, 'test.png'))).toBe(true);
  });

  test('image_compress converts image format when format is specified (e.g. png to webp)', async () => {
    const imagesDir = path.join(tempDir, 'compress_format_in');
    fs.mkdirSync(imagesDir, { recursive: true });
    const imgPath = path.join(imagesDir, '01.png');
    fs.writeFileSync(imgPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

    const adapters = createAdapters({});
    const node = { data: { format: 'webp', quality: 90, inPlace: true } };
    const inputs = { images_dir: imagesDir, mangaTitle: 'Convert Format Test' };

    const result = await adapters.image_compress(node, inputs, () => {});
    expect(result.signal.status).toBe('success');
    expect(fs.existsSync(path.join(imagesDir, '01.webp'))).toBe(true);
  });

  test('image_compress gracefully skips if directory is empty or missing', async () => {
    const adapters = createAdapters({});
    const missingRes = await adapters.image_compress({ data: {} }, { images_dir: '/non/existent/dir' });
    expect(missingRes.signal.status).toBe('skipped');

    const emptyDir = path.join(tempDir, 'empty_compress_dir');
    fs.mkdirSync(emptyDir, { recursive: true });
    const emptyRes = await adapters.image_compress({ data: {} }, { images_dir: emptyDir });
    expect(emptyRes.signal.status).toBe('skipped');
  });

  test('image_upscale handles unavailable binary gracefully', async () => {
    const imagesDir = path.join(tempDir, 'upscale_no_bin');
    fs.mkdirSync(imagesDir, { recursive: true });
    fs.writeFileSync(path.join(imagesDir, '01.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

    class MockUnavailableBinaryManager {
      isBinaryAvailable() { return false; }
    }

    const progressMessages = [];
    const adapters = createAdapters({ ipc_context: { BinaryManager: MockUnavailableBinaryManager } });
    const node = { data: { engine: 'waifu2x', scale: 2 } };
    const inputs = { images_dir: imagesDir, mangaTitle: 'Upscale No Bin' };

    const result = await adapters.image_upscale(node, inputs, (p) => progressMessages.push(p.message));
    expect(result.signal.status).toBe('skipped');
    expect(result.signal.reason).toBe('binary_unavailable');
    expect(progressMessages.some((m) => m.includes('chưa có binary'))).toBe(true);
  });

  test('image_upscale executes batch with mocked UpscaleEngine', async () => {
    const imagesDir = path.join(tempDir, 'upscale_mock_in');
    const customOut = path.join(tempDir, 'upscale_mock_out');
    fs.mkdirSync(imagesDir, { recursive: true });
    const imgPath = path.join(imagesDir, '01.png');
    fs.writeFileSync(imgPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

    class MockUpscaleEngine {
      async upscaleBatch({ images, onProgress }) {
        for (let i = 0; i < images.length; i++) {
          fs.writeFileSync(images[i].output, 'upscaled-content');
          onProgress?.({
            current: i + 1,
            total: images.length,
            currentFile: path.basename(images[i].input),
            percent: 100,
          });
        }
        return { completed: images.length, failed: 0 };
      }
    }

    const adapters = createAdapters({ ipc_context: { UpscaleEngine: MockUpscaleEngine } });
    const progressList = [];
    const node = { data: { engine: 'realesrgan', scale: 4, inPlace: false, outputDir: customOut } };
    const inputs = { images_dir: imagesDir, mangaTitle: 'Mock Upscale' };

    const result = await adapters.image_upscale(node, inputs, (p) => progressList.push(p.message));
    expect(result.images_dir).toBe(customOut);
    expect(result.signal.status).toBe('success');
    expect(fs.existsSync(path.join(customOut, '01.png'))).toBe(true);
    expect(fs.readFileSync(path.join(customOut, '01.png'), 'utf-8')).toBe('upscaled-content');
    expect(progressList.length).toBeGreaterThan(0);
  });

  test('image_upscale supports inPlace execution with mock engine', async () => {
    const imagesDir = path.join(tempDir, 'upscale_mock_inplace');
    fs.mkdirSync(imagesDir, { recursive: true });
    const imgPath = path.join(imagesDir, '01.png');
    fs.writeFileSync(imgPath, 'original-content');

    class MockUpscaleEngine {
      async upscaleBatch({ images }) {
        for (const item of images) {
          fs.writeFileSync(item.output, 'new-upscaled-content');
        }
        return { completed: images.length, failed: 0 };
      }
    }

    const adapters = createAdapters({ ipc_context: { UpscaleEngine: MockUpscaleEngine } });
    const node = { data: { engine: 'waifu2x', scale: 2, inPlace: true } };
    const inputs = { images_dir: imagesDir, mangaTitle: 'InPlace Upscale' };

    const result = await adapters.image_upscale(node, inputs, () => {});
    expect(result.images_dir).toBe(imagesDir);
    expect(result.signal.status).toBe('success');
    expect(fs.readFileSync(imgPath, 'utf-8')).toBe('new-upscaled-content');
  });

  test('image_upscale defaults to mangajanai with realesrgan engine and 2x model', async () => {
    const imagesDir = path.join(tempDir, 'upscale_mock_mangajanai');
    fs.mkdirSync(imagesDir, { recursive: true });
    const imgPath = path.join(imagesDir, '01.png');
    fs.writeFileSync(imgPath, 'original-raw-manga');

    let passedOpts = null;
    class MockUpscaleEngine {
      async upscaleBatch(opts) {
        passedOpts = opts;
        for (const item of opts.images) {
          fs.writeFileSync(item.output, 'upscaled-mangajanai');
        }
        return { completed: opts.images.length, failed: 0 };
      }
    }

    const adapters = createAdapters({ ipc_context: { UpscaleEngine: MockUpscaleEngine } });
    const node = { data: {} };
    const inputs = { images_dir: imagesDir, mangaTitle: 'Default MangaJaNai' };

    const result = await adapters.image_upscale(node, inputs, () => {});
    expect(result.signal.status).toBe('success');
    expect(passedOpts).toBeDefined();
    expect(passedOpts.engineId).toBe('realesrgan');
    expect(passedOpts.modelId).toBe('mangajanai-2x-1600p');
    expect(passedOpts.scale).toBe(2);
  });
});
