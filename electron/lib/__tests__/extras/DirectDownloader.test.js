const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { downloadDirectFile } = require('../../extras/DirectDownloader');

describe('DirectDownloader', () => {
  let server;
  let serverPort;
  let tempDir;

  beforeAll((done) => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'direct-downloader-test-'));

    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${serverPort}`);

      if (url.pathname === '/file.zip') {
        const payload = Buffer.alloc(1024 * 100, 'a'); // 100KB
        res.writeHead(200, {
          'Content-Length': payload.length,
          'Content-Type': 'application/zip',
        });
        res.end(payload);
      } else if (url.pathname === '/redirect') {
        res.writeHead(302, { Location: `http://localhost:${serverPort}/file.zip` });
        res.end();
      } else if (url.pathname === '/slow') {
        res.writeHead(200, {
          'Content-Length': 1024 * 50,
          'Content-Type': 'application/octet-stream',
        });
        res.write(Buffer.alloc(1024 * 10, 'b'));
        setTimeout(() => {
          if (!res.destroyed) {
            res.end(Buffer.alloc(1024 * 40, 'b'));
          }
        }, 100);
      } else if (url.pathname === '/not-found') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(400);
        res.end();
      }
    });

    server.listen(0, () => {
      serverPort = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
      done();
    });
  });

  test('successfully downloads file directly', async () => {
    const dest = path.join(tempDir, 'test-download.zip');
    const progresses = [];

    const result = await downloadDirectFile(
      `http://localhost:${serverPort}/file.zip`,
      dest,
      (prog) => progresses.push(prog)
    );

    expect(result.destFilePath).toBe(dest);
    expect(result.totalBytes).toBe(1024 * 100);
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.statSync(dest).size).toBe(1024 * 100);
  });

  test('follows 302 redirect seamlessly', async () => {
    const dest = path.join(tempDir, 'redirect-download.zip');

    const result = await downloadDirectFile(
      `http://localhost:${serverPort}/redirect`,
      dest
    );

    expect(result.totalBytes).toBe(1024 * 100);
    expect(fs.existsSync(dest)).toBe(true);
  });

  test('handles abort signal and cleans up partial file', async () => {
    const dest = path.join(tempDir, 'aborted-download.zip');
    const controller = new AbortController();

    // Abort shortly after start
    setTimeout(() => controller.abort(), 20);

    await expect(
      downloadDirectFile(
        `http://localhost:${serverPort}/slow`,
        dest,
        () => {},
        controller.signal
      )
    ).rejects.toThrow('Download cancelled by user');

    // Dest file should be cleaned up
    expect(fs.existsSync(dest)).toBe(false);
  });

  test('rejects on HTTP error (e.g. 404) and removes file', async () => {
    const dest = path.join(tempDir, '404-download.zip');

    await expect(
      downloadDirectFile(`http://localhost:${serverPort}/not-found`, dest)
    ).rejects.toThrow('HTTP error 404');

    expect(fs.existsSync(dest)).toBe(false);
  });
});
