const { describe, it, expect, jest, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { downloadCoverIfNeeded, downloadImageToFile, downloadImageWithRetry } = require('../../download/connector/connectorDownloadUtils');

// Mock fetch globally
global.fetch = jest.fn();

describe('connectorDownloadUtils', () => {
  let tempDir;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'connector-test-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('downloadCoverIfNeeded', () => {
    it('should download cover if it does not exist', async () => {
      const mockLog = jest.fn();
      const mockBuffer = Buffer.from('fake-image-data');
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });

      await downloadCoverIfNeeded(
        'https://example.com/cover.jpg',
        tempDir,
        'https://example.com',
        'TestAgent',
        mockLog
      );

      const coverPath = path.join(tempDir, 'cover.jpg');
      expect(fs.existsSync(coverPath)).toBe(true);
      expect(fs.readFileSync(coverPath)).toEqual(mockBuffer);
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Đã lưu cover'), 'success');
    });

    it('should skip download if cover already exists', async () => {
      const coverPath = path.join(tempDir, 'cover.jpg');
      fs.writeFileSync(coverPath, 'existing-data');
      
      const mockLog = jest.fn();
      
      await downloadCoverIfNeeded(
        'https://example.com/cover.jpg',
        tempDir,
        'https://example.com',
        'TestAgent',
        mockLog
      );

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockLog).not.toHaveBeenCalled();
    });

    it('should handle empty cover URL', async () => {
      const mockLog = jest.fn();
      
      await downloadCoverIfNeeded('', tempDir, 'https://example.com', 'TestAgent', mockLog);
      
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle null cover URL', async () => {
      const mockLog = jest.fn();
      
      await downloadCoverIfNeeded(null, tempDir, 'https://example.com', 'TestAgent', mockLog);
      
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle relative URLs', async () => {
      const mockLog = jest.fn();
      const mockBuffer = Buffer.from('fake-image-data');
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });

      await downloadCoverIfNeeded(
        '/images/cover.jpg',
        tempDir,
        'https://example.com',
        'TestAgent',
        mockLog
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/images/cover.jpg',
        expect.any(Object)
      );
    });

    it('should handle invalid relative URLs', async () => {
      const mockLog = jest.fn();
      
      await downloadCoverIfNeeded(
        'not-a-valid-url',
        tempDir,
        'invalid-referer',
        'TestAgent',
        mockLog
      );

      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('không hợp lệ'), 'warn');
    });

    it('should handle fetch errors', async () => {
      const mockLog = jest.fn();
      
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await downloadCoverIfNeeded(
        'https://example.com/cover.jpg',
        tempDir,
        'https://example.com',
        'TestAgent',
        mockLog
      );

      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Lỗi tải cover'), 'warn');
    });

    it('should handle non-ok response', async () => {
      const mockLog = jest.fn();
      
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await downloadCoverIfNeeded(
        'https://example.com/cover.jpg',
        tempDir,
        'https://example.com',
        'TestAgent',
        mockLog
      );

      const coverPath = path.join(tempDir, 'cover.jpg');
      expect(fs.existsSync(coverPath)).toBe(false);
    });

    it('should handle empty response buffer', async () => {
      const mockLog = jest.fn();
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
      });

      await downloadCoverIfNeeded(
        'https://example.com/cover.jpg',
        tempDir,
        'https://example.com',
        'TestAgent',
        mockLog
      );

      const coverPath = path.join(tempDir, 'cover.jpg');
      expect(fs.existsSync(coverPath)).toBe(false);
    });
  });

  describe('downloadImageToFile', () => {
    it('should download image successfully', async () => {
      const mockBuffer = Buffer.from('image-data');
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });

      const filePath = path.join(tempDir, 'test.jpg');
      const result = await downloadImageToFile(
        'https://example.com/image.jpg',
        filePath,
        { Referer: 'https://example.com' }
      );

      expect(result.ok).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath)).toEqual(mockBuffer);
    });

    it('should create parent directories if needed', async () => {
      const mockBuffer = Buffer.from('image-data');
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });

      const filePath = path.join(tempDir, 'nested', 'dir', 'test.jpg');
      const result = await downloadImageToFile(
        'https://example.com/image.jpg',
        filePath,
        {}
      );

      expect(result.ok).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should handle non-ok response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const filePath = path.join(tempDir, 'test.jpg');
      const result = await downloadImageToFile(
        'https://example.com/image.jpg',
        filePath,
        {}
      );

      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should handle empty buffer', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
      });

      const filePath = path.join(tempDir, 'test.jpg');
      const result = await downloadImageToFile(
        'https://example.com/image.jpg',
        filePath,
        {}
      );

      expect(result.ok).toBe(false);
    });

    it('should handle fetch errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const filePath = path.join(tempDir, 'test.jpg');
      const result = await downloadImageToFile(
        'https://example.com/image.jpg',
        filePath,
        {}
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should follow redirects', async () => {
      const mockBuffer = Buffer.from('image-data');
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });

      const filePath = path.join(tempDir, 'test.jpg');
      await downloadImageToFile('https://example.com/image.jpg', filePath, {});

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        expect.objectContaining({ redirect: 'follow' })
      );
    });
  });

  describe('downloadImageWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockBuffer = Buffer.from('image-data');
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });

      const filePath = path.join(tempDir, 'test.jpg');
      const result = await downloadImageWithRetry(
        'https://example.com/image.jpg',
        filePath,
        {},
        3
      );

      expect(result.ok).toBe(true);
      expect(result.fileSize).toBeGreaterThan(0);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const mockBuffer = Buffer.from('image-data');
      
      // First attempt fails, second succeeds
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => mockBuffer.buffer,
        });

      const filePath = path.join(tempDir, 'test.jpg');
      const result = await downloadImageWithRetry(
        'https://example.com/image.jpg',
        filePath,
        {},
        3
      );

      expect(result.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should fail after max attempts', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 500 });

      const filePath = path.join(tempDir, 'test.jpg');
      const result = await downloadImageWithRetry(
        'https://example.com/image.jpg',
        filePath,
        {},
        3
      );

      expect(result.ok).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should wait 1 second between retries', async () => {
      jest.useFakeTimers();
      
      global.fetch.mockResolvedValue({ ok: false, status: 500 });

      const filePath = path.join(tempDir, 'test.jpg');
      const promise = downloadImageWithRetry(
        'https://example.com/image.jpg',
        filePath,
        {},
        3
      );

      // Fast-forward through retries
      await jest.advanceTimersByTimeAsync(2000);
      
      const result = await promise;
      
      expect(result.ok).toBe(false);
      
      jest.useRealTimers();
    });

    it('should verify file size after download', async () => {
      const mockBuffer = Buffer.from('');
      
      global.fetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });

      const filePath = path.join(tempDir, 'test.jpg');
      const result = await downloadImageWithRetry(
        'https://example.com/image.jpg',
        filePath,
        {},
        3
      );

      expect(result.ok).toBe(false);
    });

    it('should use default max attempts of 3', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 500 });

      const filePath = path.join(tempDir, 'test.jpg');
      const result = await downloadImageWithRetry(
        'https://example.com/image.jpg',
        filePath,
        {}
      );

      expect(result.ok).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should handle custom max attempts', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 500 });

      const filePath = path.join(tempDir, 'test.jpg');
      const result = await downloadImageWithRetry(
        'https://example.com/image.jpg',
        filePath,
        {},
        5
      );

      expect(result.ok).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(5);
    });
  });
});
