const https = require('https');
const { EventEmitter } = require('events');
const { checkForUpdate, resolveGitHubDownloadInfo, isNewerVersion } = require('../platform/connectors/api-clients/updater');

describe('Updater Architecture & Multi-Platform Resolution', () => {
  describe('isNewerVersion', () => {
    it('returns true when remote version is higher than local', () => {
      expect(isNewerVersion('3.0.23', '3.0.22')).toBe(true);
      expect(isNewerVersion('3.1.0', '3.0.22')).toBe(true);
      expect(isNewerVersion('4.0.0', '3.0.22')).toBe(true);
    });

    it('returns false when remote version is same or lower', () => {
      expect(isNewerVersion('3.0.22', '3.0.22')).toBe(false);
      expect(isNewerVersion('3.0.21', '3.0.22')).toBe(false);
    });
  });

  describe('checkForUpdate', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    function spyHttps(onRequest) {
      return jest.spyOn(https, 'get').mockImplementation((url, options, callback) => {
        const cb = typeof options === 'function' ? options : callback;
        const req = new EventEmitter();
        req.destroy = jest.fn();
        process.nextTick(() => onRequest(String(url), cb, req));
        return req;
      });
    }

    it('rejects the GitHub error and does not request Google Sheet', async () => {
      const urls = [];
      spyHttps((url, _cb, req) => {
        urls.push(url);
        req.emit('error', new Error('GitHub unreachable'));
      });

      await expect(checkForUpdate()).rejects.toThrow('GitHub unreachable');
      expect(urls.some((url) => url.includes('docs.google.com') || url.includes('spreadsheets'))).toBe(false);
      expect(urls.some((url) => url.includes('api.github.com'))).toBe(true);
    });

    it('checks GitHub when a Google Sheet URL is passed', async () => {
      const urls = [];
      spyHttps((url, _cb, req) => {
        urls.push(url);
        req.emit('error', new Error('GitHub unreachable'));
      });

      await expect(
        checkForUpdate('https://docs.google.com/spreadsheets/d/abc/gviz/tq?tqx=out:csv')
      ).rejects.toThrow('GitHub unreachable');
      expect(urls.every((url) => url.includes('api.github.com'))).toBe(true);
    });

    it('maps GitHub HTTP 403 to a rate-limit message with the releases page', async () => {
      spyHttps((_url, cb) => {
        const res = new EventEmitter();
        res.statusCode = 403;
        res.headers = {};
        res.resume = jest.fn();
        process.nextTick(() => cb(res));
      });

      await expect(checkForUpdate()).rejects.toThrow(
        'Đã vượt quá giới hạn lượt kiểm tra của GitHub, vui lòng thử lại sau vài phút. Tải thủ công: https://github.com/suutamebooktruyentranh2025-hub/manga-crawler-pc-releases/releases/latest'
      );
    });

    it('keeps the status code for other GitHub API errors', async () => {
      spyHttps((_url, cb) => {
        const res = new EventEmitter();
        res.statusCode = 500;
        res.headers = {};
        res.resume = jest.fn();
        process.nextTick(() => cb(res));
      });

      await expect(checkForUpdate()).rejects.toThrow('GitHub API HTTP 500');
    });

    it('returns the GitHub release without a sheet source', async () => {
      const urls = [];
      spyHttps((url, cb) => {
        urls.push(url);
        const res = new EventEmitter();
        res.statusCode = 200;
        res.headers = {};
        process.nextTick(() => {
          cb(res);
          res.emit('data', JSON.stringify({
            tag_name: 'v9.9.9',
            body: 'notes',
            published_at: '2026-01-01T00:00:00Z',
            html_url: 'https://github.com/example/releases/tag/v9.9.9',
            assets: [],
          }));
          res.emit('end');
        });
      });

      const result = await checkForUpdate();
      expect(result.source).toBe('github');
      expect(result.remoteVersion).toBe('9.9.9');
      expect(urls.some((url) => url.includes('docs.google.com'))).toBe(false);
    });
  });

  describe('resolveGitHubDownloadInfo', () => {
    const mockAssets = [
      {
        name: 'Manga Crawler Setup 3.0.37.exe',
        browser_download_url: 'https://github.com/releases/download/v3.0.37/Manga%20Crawler%20Setup%203.0.37.exe',
        size: 150000000,
      },
      {
        name: 'Manga Crawler-3.0.37-arm64.dmg',
        browser_download_url: 'https://github.com/releases/download/v3.0.37/Manga%20Crawler-3.0.37-arm64.dmg',
        size: 140000000,
      },
      {
        name: 'Manga Crawler-3.0.37-x64.dmg',
        browser_download_url: 'https://github.com/releases/download/v3.0.37/Manga%20Crawler-3.0.37-x64.dmg',
        size: 145000000,
      },
    ];

    it('resolves windows installer (.exe) on win32', () => {
      const info = resolveGitHubDownloadInfo(mockAssets, 'win32', 'x64', '3.0.37');
      expect(info).not.toBeNull();
      expect(info.filename).toBe('Manga Crawler Setup 3.0.37.exe');
      expect(info.url).toContain('.exe');
      expect(info.arch).toBe('x64');
    });

    it('resolves apple silicon dmg on darwin arm64', () => {
      const info = resolveGitHubDownloadInfo(mockAssets, 'darwin', 'arm64', '3.0.37');
      expect(info).not.toBeNull();
      expect(info.filename).toBe('Manga Crawler-3.0.37-arm64.dmg');
      expect(info.arch).toBe('arm64');
    });

    it('resolves intel dmg on darwin x64', () => {
      const info = resolveGitHubDownloadInfo(mockAssets, 'darwin', 'x64', '3.0.37');
      expect(info).not.toBeNull();
      expect(info.filename).toBe('Manga Crawler-3.0.37-x64.dmg');
      expect(info.arch).toBe('x64');
    });

    it('returns null if assets array is empty or no matching platform', () => {
      expect(resolveGitHubDownloadInfo([], 'win32', 'x64')).toBeNull();
      expect(resolveGitHubDownloadInfo([{ name: 'other.zip' }], 'win32', 'x64')).toBeNull();
    });
  });
});
