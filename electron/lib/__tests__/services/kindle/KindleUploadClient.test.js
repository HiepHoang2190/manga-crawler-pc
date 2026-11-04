const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const {
  createUploadClient,
  makeDefaultPutFile,
} = require('../../../export/kindle/KindleUploadClient');
const { SessionExpiredError } = require('../../../export/kindle/KindleAuthSession');

function makeJsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) };
}

function writeTempFile(bytes, ext = 'pdf') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-upload-'));
  const p = path.join(dir, `doc.${ext}`);
  fs.writeFileSync(p, Buffer.alloc(bytes, 1));
  return p;
}

describe('KindleUploadClient.uploadFile', () => {
  test('runs the 4-step flow with correct headers/bodies and returns sku', async () => {
    const filePath = writeTempFile(1234, 'pdf');
    const fetch = jest.fn();
    fetch
      .mockResolvedValueOnce(makeJsonResponse(200, { uploadUrl: 'https://s3.example/put', stkToken: 'tok-1' }))
      .mockResolvedValueOnce(makeJsonResponse(200, { status: 1, sku: 'SKU-9' }));

    const auth = {
      getCsrfToken: jest.fn().mockResolvedValue('csrf-abc'),
      fetch,
    };
    const putFile = jest.fn().mockImplementation(async (_url, { onProgress }) => {
      onProgress?.(100);
      return { status: 200 };
    });

    const client = createUploadClient({ auth, putFile });
    const res = await client.uploadFile({ filePath, title: 'My Manga', author: 'Me' });

    expect(res).toEqual({ ok: true, sku: 'SKU-9' });
    expect(auth.getCsrfToken).toHaveBeenCalledTimes(1);
    expect(putFile).toHaveBeenCalledWith('https://s3.example/put', expect.objectContaining({
      filePath,
      contentType: 'application/pdf',
      size: 1234,
    }));

    const [initUrl, initInit] = fetch.mock.calls[0];
    expect(initUrl).toContain('/sendtokindle/init');
    expect(initInit.headers['anti-csrftoken-a2z']).toBe('csrf-abc');
    const initBody = JSON.parse(initInit.body);
    expect(initBody).toMatchObject({
      fileSize: 1234,
      contentType: 'application/pdf',
      appName: 'drag_drop_web',
      fileExtension: 'pdf',
    });

    const [sendUrl, sendInit] = fetch.mock.calls[1];
    expect(sendUrl).toContain('/sendtokindle/send-v2');
    const sendBody = JSON.parse(sendInit.body);
    expect(sendBody).toMatchObject({
      stkToken: 'tok-1',
      title: 'My Manga',
      author: 'Me',
      dataType: 'application/pdf',
      inputFileName: path.basename(filePath),
      archive: true,
    });
    expect(typeof sendBody.batchId).toBe('string');
    expect(sendBody.batchId.length).toBeGreaterThan(0);
  });

  test('rejects unsupported formats before any network call', async () => {
    const auth = { getCsrfToken: jest.fn(), fetch: jest.fn() };
    const client = createUploadClient({ auth, putFile: jest.fn() });
    await expect(client.uploadFile({ filePath: '/tmp/chapter.cbz' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    });
    expect(auth.getCsrfToken).not.toHaveBeenCalled();
  });

  test('surfaces SessionExpiredError when init returns 401', async () => {
    const filePath = writeTempFile(10, 'pdf');
    const auth = {
      getCsrfToken: jest.fn().mockResolvedValue('csrf'),
      fetch: jest.fn().mockResolvedValueOnce(makeJsonResponse(401, {})),
    };
    const client = createUploadClient({ auth, putFile: jest.fn() });
    await expect(client.uploadFile({ filePath })).rejects.toBeInstanceOf(SessionExpiredError);
  });

  test('retries the PUT step on transient failure then succeeds', async () => {
    const filePath = writeTempFile(50, 'pdf');
    const auth = {
      getCsrfToken: jest.fn().mockResolvedValue('csrf'),
      fetch: jest
        .fn()
        .mockResolvedValueOnce(makeJsonResponse(200, { uploadUrl: 'https://s3/put', stkToken: 'tok' }))
        .mockResolvedValueOnce(makeJsonResponse(200, { status: 1, sku: 'OK' })),
    };
    const putFile = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ status: 200 });

    const client = createUploadClient({ auth, putFile });
    const res = await client.uploadFile({ filePath });
    expect(res.ok).toBe(true);
    expect(putFile).toHaveBeenCalledTimes(2);
  });

  test('reports failure when all PUT attempts fail (injected)', async () => {
    const filePath = writeTempFile(50, 'pdf');
    const auth = {
      getCsrfToken: jest.fn().mockResolvedValue('csrf'),
      fetch: jest
        .fn()
        .mockResolvedValueOnce(makeJsonResponse(200, { uploadUrl: 'https://s3/put', stkToken: 'tok' })),
    };
    const putFile = jest.fn().mockRejectedValue(new Error('network down'));
    const client = createUploadClient({ auth, putFile });
    const res = await client.uploadFile({ filePath });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('UPLOAD_FAILED');
  });
});

describe('makeDefaultPutFile (Node http(s) stream PUT)', () => {
  test('streams body with Content-Length and reports progress to 100%', async () => {
    const filePath = writeTempFile(8192, 'pdf');
    let received = 0;
    let gotContentLength = null;
    let gotContentType = null;

    const server = http.createServer((req, res) => {
      gotContentLength = req.headers['content-length'];
      gotContentType = req.headers['content-type'];
      req.on('data', (chunk) => {
        received += chunk.length;
      });
      req.on('end', () => {
        res.statusCode = 200;
        res.end();
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const putFile = makeDefaultPutFile();

    let lastPct = 0;
    const result = await putFile(`http://127.0.0.1:${port}/put`, {
      filePath,
      contentType: 'application/pdf',
      size: 8192,
      onProgress: (p) => {
        lastPct = p;
      },
    });

    await new Promise((resolve) => server.close(resolve));
    expect(result).toEqual({ status: 200 });
    expect(gotContentLength).toBe('8192');
    expect(gotContentType).toBe('application/pdf');
    expect(received).toBe(8192);
    expect(lastPct).toBe(100);
  });
});
