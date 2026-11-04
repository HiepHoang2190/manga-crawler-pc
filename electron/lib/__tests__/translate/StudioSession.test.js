const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock electron app with mock-prefixed variable
const mockTmpDir = path.join(os.tmpdir(), `test-manga-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

jest.mock('electron', () => ({
  app: {
    getPath: () => mockTmpDir,
  },
  ipcMain: {
    handle: jest.fn(),
  },
}));

const StudioSession = require('../../translate/StudioSession');

describe('StudioSession', () => {
  afterAll(() => {
    if (fs.existsSync(mockTmpDir)) {
      fs.rmSync(mockTmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    StudioSession.clearSession();
  });

  test('hasSession returns false when no session exists', () => {
    const res = StudioSession.hasSession();
    expect(res.hasSession).toBe(false);
  });

  test('saveSession writes session.json and stores dataUrls as blobs', () => {
    const sampleBase64 = Buffer.from('test-image-content').toString('base64');
    const sampleDataUrl = `data:image/png;base64,${sampleBase64}`;

    const sessionData = {
      activePageIndex: 0,
      pages: [
        {
          id: 'p1',
          filename: 'page1.png',
          imagePath: '/path/to/page1.png',
          cleanDataUrl: sampleDataUrl,
          layers: [
            {
              id: 'l1',
              text: 'Hello',
              translatedText: 'Xin chào',
            },
          ],
        },
      ],
    };

    const saveRes = StudioSession.saveSession(sessionData);
    expect(saveRes.success).toBe(true);
    expect(saveRes.pageCount).toBe(1);

    const hasRes = StudioSession.hasSession();
    expect(hasRes.hasSession).toBe(true);
    expect(hasRes.pageCount).toBe(1);

    // Verify session.json does NOT contain raw base64 dataUrl (content-addressed blob)
    const rawSession = JSON.parse(fs.readFileSync(StudioSession.getSessionFilePath(), 'utf-8'));
    expect(rawSession.pages[0].cleanDataUrl).toMatch(/^blob:\/\/[a-f0-9]{64}$/);

    // Verify loadSession restores original dataUrl
    const loadRes = StudioSession.loadSession();
    expect(loadRes.success).toBe(true);
    expect(loadRes.pages.length).toBe(1);
    expect(loadRes.pages[0].cleanDataUrl).toBe(sampleDataUrl);
    expect(loadRes.pages[0].layers[0].translatedText).toBe('Xin chào');
  });

  test('clearSession removes all session files', () => {
    StudioSession.saveSession({
      activePageIndex: 0,
      pages: [{ id: 'p1', filename: 'page1.png' }],
    });
    expect(StudioSession.hasSession().hasSession).toBe(true);

    const clearRes = StudioSession.clearSession();
    expect(clearRes.success).toBe(true);
    expect(StudioSession.hasSession().hasSession).toBe(false);
  });

  test('deletePageBlobs cleans unreferenced blobs', () => {
    const sampleBase64 = Buffer.from('blob-to-delete').toString('base64');
    const sampleDataUrl = `data:image/png;base64,${sampleBase64}`;

    const page = {
      id: 'p_del',
      imagePath: '/path/to/del.png',
      cleanDataUrl: sampleDataUrl,
    };

    StudioSession.saveSession({
      activePageIndex: 0,
      pages: [page],
    });

    const blobsDir = StudioSession.getBlobsDir();
    const hash = StudioSession.hashContent(sampleBase64);
    const blobPath = path.join(blobsDir, `${hash}.bin`);
    expect(fs.existsSync(blobPath)).toBe(true);

    // Now delete blobs for this page
    StudioSession.deletePageBlobs(page);
    expect(fs.existsSync(blobPath)).toBe(false);
  });

  test('saveSession with empty pages automatically clears session', () => {
    StudioSession.saveSession({
      activePageIndex: 0,
      pages: [{ id: 'p1', filename: 'page1.png' }],
    });
    expect(StudioSession.hasSession().hasSession).toBe(true);

    const emptyRes = StudioSession.saveSession({ pages: [] });
    expect(emptyRes.success).toBe(true);
    expect(StudioSession.hasSession().hasSession).toBe(false);
  });

  test('getDiskUsage returns size in bytes and cleans blobs when cleared', () => {
    const baseUsage = StudioSession.getDiskUsage();

    const sampleBase64 = Buffer.from('some-data-to-measure-with-a-larger-string-content-here').toString('base64');
    StudioSession.saveSession({
      activePageIndex: 0,
      pages: [{ id: 'p1', filename: 'p.png', cleanDataUrl: `data:image/png;base64,${sampleBase64}` }],
    });

    const withSessionUsage = StudioSession.getDiskUsage();
    expect(withSessionUsage).toBeGreaterThan(baseUsage);

    StudioSession.clearSession();
    expect(StudioSession.getDiskUsage()).toBeLessThan(withSessionUsage);
  });

  test('deletePageBlobs with remainingPages correctly protects shared blobs and deletes unreferenced', () => {
    const sharedBase64 = Buffer.from('shared-blob').toString('base64');
    const sharedDataUrl = `data:image/png;base64,${sharedBase64}`;
    const p1 = { id: 'p1', cleanDataUrl: sharedDataUrl };
    const p2 = { id: 'p2', cleanDataUrl: sharedDataUrl };

    StudioSession.saveSession({ pages: [p1, p2] });
    const blobsDir = StudioSession.getBlobsDir();
    const hash = StudioSession.hashContent(sharedBase64);
    const blobPath = path.join(blobsDir, `${hash}.bin`);
    expect(fs.existsSync(blobPath)).toBe(true);

    // Delete p1, with p2 remaining
    StudioSession.deletePageBlobs(p1, [p2]);
    expect(fs.existsSync(blobPath)).toBe(true); // Still exists because p2 references it

    // Delete p2 with empty remaining
    StudioSession.deletePageBlobs(p2, []);
    expect(fs.existsSync(blobPath)).toBe(false); // Deleted
  });

  test('Multi-Project: listProjects, createProject, switchProject, renameProject, deleteProject', () => {
    // 1. List initial projects
    const list1 = StudioSession.listProjects();
    expect(list1.projects.length).toBeGreaterThanOrEqual(1);
    const initialActiveId = list1.activeProjectId;

    // Save 1 page in initial project
    StudioSession.saveSession({
      activePageIndex: 0,
      pages: [{ id: 'page-proj1', filename: 'p1.png' }],
    });

    // 2. Create Project 2
    const createRes = StudioSession.createProject({ name: 'One Piece Chap 1' });
    expect(createRes.success).toBe(true);
    expect(createRes.project.name).toBe('One Piece Chap 1');
    expect(createRes.activeProjectId).toBe(createRes.project.id);
    expect(createRes.projects.length).toBe(list1.projects.length + 1);

    // Save pages in Project 2
    StudioSession.saveSession({
      activePageIndex: 0,
      pages: [
        { id: 'op-1', filename: '01.png' },
        { id: 'op-2', filename: '02.png' },
      ],
    });

    const opSession = StudioSession.loadSession(createRes.project.id);
    expect(opSession.pages.length).toBe(2);

    // 3. Switch back to initial project
    const switchRes = StudioSession.switchProject({ projectId: initialActiveId });
    expect(switchRes.success).toBe(true);
    expect(switchRes.activeProjectId).toBe(initialActiveId);
    expect(switchRes.session.pages.length).toBe(1);
    expect(switchRes.session.pages[0].id).toBe('page-proj1');

    // 4. Rename Project 2
    const renameRes = StudioSession.renameProject({
      projectId: createRes.project.id,
      name: 'One Piece Chapter 1090',
    });
    expect(renameRes.success).toBe(true);
    expect(renameRes.project.name).toBe('One Piece Chapter 1090');

    // 5. Delete Project 2
    const delRes = StudioSession.deleteProject({ projectId: createRes.project.id });
    expect(delRes.success).toBe(true);
    expect(delRes.projects.some((p) => p.id === createRes.project.id)).toBe(false);
  });

  test('Checkpoint & Resume: saves incremental page updates and identifies untranslated pages', () => {
    // Initial state: 3 pages, none translated
    const initialPages = [
      { id: 'p1', filename: '01.png', layers: [{ id: 'l1', text: '' }] },
      { id: 'p2', filename: '02.png', layers: [{ id: 'l2', text: '' }] },
      { id: 'p3', filename: '03.png', layers: [{ id: 'l3', text: '' }] },
    ];
    StudioSession.saveSession({ activePageIndex: 0, pages: initialPages });

    // Simulate batch translation streaming checkpoint: page 1 completes and gets check-pointed
    const page1Completed = [
      { id: 'p1', filename: '01.png', layers: [{ id: 'l1', text: 'Xin chào', originalText: 'こんにちは' }] },
      { id: 'p2', filename: '02.png', layers: [{ id: 'l2', text: '' }] },
      { id: 'p3', filename: '03.png', layers: [{ id: 'l3', text: '' }] },
    ];
    StudioSession.saveSession({ activePageIndex: 0, pages: page1Completed });

    // Load session to simulate app reboot / reload after crash
    const loaded = StudioSession.loadSession();
    expect(loaded.success).toBe(true);
    expect(loaded.pages.length).toBe(3);

    // Compute translated vs untranslated
    const translated = loaded.pages.filter((p) => p.layers?.some((l) => l.text?.trim()));
    const untranslated = loaded.pages.filter((p) => !p.layers?.some((l) => l.text?.trim()));

    expect(translated.length).toBe(1);
    expect(untranslated.length).toBe(2);
    expect(untranslated.map((p) => p.id)).toEqual(['p2', 'p3']);
  });
});

