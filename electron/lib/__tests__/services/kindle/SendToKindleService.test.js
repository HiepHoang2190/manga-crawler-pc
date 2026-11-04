const { createSendToKindleService } = require('../../../export/kindle/SendToKindleService');
const { SessionExpiredError } = require('../../../export/kindle/KindleAuthSession');

function baseParams(extra = {}) {
  return {
    absoluteMangaDir: '/manga/A',
    mangaTitle: 'A',
    chapters: [{ title: 'c1', folderBasename: 'c1' }],
    chapterFolderFormat: {},
    ...extra,
  };
}

describe('SendToKindleService.send', () => {
  test('returns needLogin when not signed in', async () => {
    const auth = { isLoggedIn: jest.fn().mockResolvedValue(false), login: jest.fn() };
    const svc = createSendToKindleService({
      auth,
      uploadClient: { uploadFile: jest.fn() },
      prepareKindleFiles: jest.fn(),
    });
    const res = await svc.send(baseParams());
    expect(res).toEqual({ ok: false, needLogin: true });
  });

  test('uploads every prepared part and aggregates results', async () => {
    const auth = { isLoggedIn: jest.fn().mockResolvedValue(true), login: jest.fn() };
    const uploadFile = jest.fn().mockResolvedValue({ ok: true, sku: 'S' });
    const prepare = jest.fn().mockResolvedValue({ ok: true, files: ['/t/Part 01.pdf', '/t/Part 02.pdf'] });

    const svc = createSendToKindleService({ auth, uploadClient: { uploadFile }, prepareKindleFiles: prepare });
    const res = await svc.send(baseParams());

    expect(res.ok).toBe(true);
    expect(res.results).toHaveLength(2);
    expect(res.results.every((r) => r.ok)).toBe(true);
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });

  test('re-logs in once and retries on a session-expired upload', async () => {
    const auth = {
      isLoggedIn: jest.fn().mockResolvedValue(true),
      login: jest.fn().mockResolvedValue(true),
    };
    const uploadFile = jest
      .fn()
      .mockRejectedValueOnce(new SessionExpiredError())
      .mockResolvedValueOnce({ ok: true });
    const prepare = jest.fn().mockResolvedValue({ ok: true, files: ['/t/only.pdf'] });

    const svc = createSendToKindleService({ auth, uploadClient: { uploadFile }, prepareKindleFiles: prepare });
    const res = await svc.send(baseParams());

    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(true);
  });

  test('aborts with needLogin if re-login is cancelled', async () => {
    const auth = {
      isLoggedIn: jest.fn().mockResolvedValue(true),
      login: jest.fn().mockResolvedValue(false),
    };
    const uploadFile = jest.fn().mockRejectedValue(new SessionExpiredError());
    const prepare = jest.fn().mockResolvedValue({ ok: true, files: ['/t/only.pdf'] });

    const svc = createSendToKindleService({ auth, uploadClient: { uploadFile }, prepareKindleFiles: prepare });
    const res = await svc.send(baseParams());
    expect(res.needLogin).toBe(true);
    expect(res.ok).toBe(false);
  });

  test('passes format through to prepareKindleFiles', async () => {
    const auth = { isLoggedIn: jest.fn().mockResolvedValue(true), login: jest.fn() };
    const prepare = jest.fn().mockResolvedValue({ ok: true, files: ['/t/a.epub'] });
    const uploadFile = jest.fn().mockResolvedValue({ ok: true });
    const svc = createSendToKindleService({ auth, uploadClient: { uploadFile }, prepareKindleFiles: prepare });
    await svc.send(baseParams({ format: 'epub', author: 'Me' }));
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'epub', author: 'Me' }),
      expect.any(Object)
    );
  });

  test('returns amazon library URL and localPath; keeps files when deleteLocalAfterUpload=false', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { AMAZON_PDOCS_URL } = require('../../../export/kindle/SendToKindleService');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-keep-'));
    const auth = { isLoggedIn: jest.fn().mockResolvedValue(true), login: jest.fn() };
    const uploadFile = jest.fn().mockResolvedValue({ ok: true });
    const prepare = jest.fn().mockImplementation(async (p) => {
      const f = path.join(p.outputDir, 'kept.epub');
      fs.writeFileSync(f, 'x');
      return { ok: true, files: [f] };
    });

    const svc = createSendToKindleService({
      auth,
      uploadClient: { uploadFile },
      prepareKindleFiles: prepare,
      tempRoot,
    });
    const res = await svc.send(baseParams({ deleteLocalAfterUpload: false }));

    expect(res.ok).toBe(true);
    expect(res.amazonLibraryUrl).toBe(AMAZON_PDOCS_URL);
    expect(res.deletedLocal).toBe(false);
    expect(res.outputDir).toBeTruthy();
    expect(res.results[0].localPath).toBeTruthy();
    expect(fs.existsSync(res.results[0].localPath)).toBe(true);
    expect(res.results[0].sizeBytes).toBe(1);
    expect(res.results[0].name).toBe('kept.epub');
  });

  test('deletes prepared files by default after upload', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-del-'));
    let writtenPath = '';
    const auth = { isLoggedIn: jest.fn().mockResolvedValue(true), login: jest.fn() };
    const uploadFile = jest.fn().mockResolvedValue({ ok: true });
    const prepare = jest.fn().mockImplementation(async (p) => {
      writtenPath = path.join(p.outputDir, 'gone.epub');
      fs.writeFileSync(writtenPath, 'x');
      return { ok: true, files: [writtenPath] };
    });

    const svc = createSendToKindleService({
      auth,
      uploadClient: { uploadFile },
      prepareKindleFiles: prepare,
      tempRoot,
    });
    const res = await svc.send(baseParams());

    expect(res.ok).toBe(true);
    expect(res.deletedLocal).toBe(true);
    expect(fs.existsSync(writtenPath)).toBe(false);
  });
});

describe('SendToKindleService.sendFile', () => {
  test('returns needLogin when not signed in', async () => {
    const auth = { isLoggedIn: jest.fn().mockResolvedValue(false), login: jest.fn() };
    const svc = createSendToKindleService({
      auth,
      uploadClient: { uploadFile: jest.fn() },
    });
    const res = await svc.sendFile({ filePath: '/tmp/a.pdf', title: 'A' });
    expect(res).toEqual({ ok: false, needLogin: true });
  });

  test('rejects unsupported extension', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-sf-'));
    const bad = path.join(dir, 'x.cbz');
    fs.writeFileSync(bad, 'x');
    const auth = { isLoggedIn: jest.fn().mockResolvedValue(true), login: jest.fn() };
    const svc = createSendToKindleService({
      auth,
      uploadClient: { uploadFile: jest.fn() },
    });
    const res = await svc.sendFile({ filePath: bad, title: 'X' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/epub|pdf|định dạng|format/i);
  });

  test('uploads a ready PDF and returns sizeBytes', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-sf-'));
    const pdf = path.join(dir, 'book.pdf');
    fs.writeFileSync(pdf, Buffer.alloc(2048, 1));
    const auth = { isLoggedIn: jest.fn().mockResolvedValue(true), login: jest.fn() };
    const uploadFile = jest.fn().mockResolvedValue({ ok: true });
    const svc = createSendToKindleService({ auth, uploadClient: { uploadFile } });
    const res = await svc.sendFile({ filePath: pdf, title: 'Book', author: 'Me' });
    expect(res.ok).toBe(true);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].ok).toBe(true);
    expect(res.results[0].sizeBytes).toBe(2048);
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: pdf, title: 'Book', author: 'Me' })
    );
  });
});
