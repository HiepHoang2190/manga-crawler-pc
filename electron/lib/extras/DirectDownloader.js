const http = require('http');
const https = require('https');
const fs = require('fs');
const { URL } = require('url');

/**
 * Tải file trực tiếp từ URL (HTTP/HTTPS), hỗ trợ chuyển hướng 3xx (như GitHub Release CDN),
 * báo tiến độ % và dọn dẹp file tạm khi bị huỷ hoặc lỗi.
 *
 * @param {string} url - URL file cần tải
 * @param {string} destFilePath - Đường dẫn file đích lưu trên đĩa
 * @param {(progress: {receivedBytes: number, totalBytes: number, percent: number, speed: string}) => void} [onProgress]
 * @param {AbortSignal|null} [abortSignal]
 * @returns {Promise<{destFilePath: string, totalBytes: number}>}
 */
function downloadDirectFile(url, destFilePath, onProgress = () => {}, abortSignal = null) {
  if (!url || typeof url !== 'string') {
    return Promise.reject(new Error('Invalid URL provided to downloadDirectFile'));
  }

  return new Promise((resolve, reject) => {
    let redirectCount = 0;
    const MAX_REDIRECTS = 10;
    let fileStream = null;
    let activeReq = null;

    function cleanup() {
      if (fileStream) {
        try {
          fileStream.destroy();
        } catch (_) {}
      }
      try {
        if (fs.existsSync(destFilePath)) {
          fs.unlinkSync(destFilePath);
        }
      } catch (_) {}
    }

    function makeRequest(currentUrl) {
      if (abortSignal && abortSignal.aborted) {
        cleanup();
        return reject(new Error('Download cancelled by user'));
      }

      if (++redirectCount > MAX_REDIRECTS) {
        cleanup();
        return reject(new Error('Quá nhiều lượt chuyển hướng khi tải file'));
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(currentUrl);
      } catch (err) {
        cleanup();
        return reject(new Error(`Invalid URL: ${currentUrl}`));
      }

      const client = parsedUrl.protocol === 'http:' ? http : https;

      activeReq = client.get(
        parsedUrl,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 MangaCrawler/3.0',
            Accept: '*/*',
          },
        },
        (res) => {
          // Xử lý chuyển hướng HTTP 301, 302, 303, 307, 308 (Đặc thù GitHub Releases chuyển tiếp sang S3/Azure CDN)
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let nextUrl = res.headers.location;
            if (nextUrl.startsWith('/')) {
              nextUrl = `${parsedUrl.origin}${nextUrl}`;
            }
            res.resume(); // Tiêu thụ stream chuyển tiếp
            return makeRequest(nextUrl);
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            cleanup();
            return reject(new Error(`HTTP error ${res.statusCode} from ${parsedUrl.hostname}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let receivedBytes = 0;
          let lastReport = Date.now();
          let lastReceived = 0;

          fileStream = fs.createWriteStream(destFilePath);

          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            const now = Date.now();
            if (now - lastReport >= 250) {
              const durationSec = Math.max(0.1, (now - lastReport) / 1000);
              const bytesPerSec = (receivedBytes - lastReceived) / durationSec;
              const speed = `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
              const percent =
                totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0;

              onProgress({
                receivedBytes,
                totalBytes,
                percent,
                speed,
              });

              lastReport = now;
              lastReceived = receivedBytes;
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => {
              // Báo 100% tiến độ cuối cùng
              onProgress({
                receivedBytes,
                totalBytes: totalBytes > 0 ? totalBytes : receivedBytes,
                percent: 100,
                speed: '0.0 MB/s',
              });
              resolve({ destFilePath, totalBytes: receivedBytes });
            });
          });

          fileStream.on('error', (err) => {
            cleanup();
            reject(err);
          });
        }
      );

      activeReq.on('error', (err) => {
        cleanup();
        reject(err);
      });

      if (abortSignal) {
        abortSignal.addEventListener(
          'abort',
          () => {
            if (activeReq) activeReq.destroy();
            cleanup();
            reject(new Error('Download cancelled by user'));
          },
          { once: true }
        );
      }
    }

    makeRequest(url);
  });
}

module.exports = {
  downloadDirectFile,
};
