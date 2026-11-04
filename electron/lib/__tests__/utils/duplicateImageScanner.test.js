/**
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const mockTrashItem = jest.fn();

jest.mock('electron', () => ({
  shell: {
    trashItem: (...args) => mockTrashItem(...args),
  },
}), { virtual: true });

const {
  isPathUnderAllowedRoots,
  deleteFilesUnderRoots,
  scanDuplicateImages,
  listImportedImages,
} = require('../../export/image/duplicateImageScanner');

describe('duplicateImageScanner - Path validation and Deletion', () => {
  let tmpDir;

  beforeEach(async () => {
    jest.clearAllMocks();
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dup-test-'));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('isPathUnderAllowedRoots', () => {
    it('returns true for files directly inside allowed root', () => {
      const root = path.join(tmpDir, 'manga');
      const file = path.join(root, '001.webp');
      expect(isPathUnderAllowedRoots(file, [root])).toBe(true);
    });

    it('returns true for files nested inside chapters', () => {
      const root = path.join(tmpDir, 'manga');
      const file = path.join(root, 'Chap 01', 'sub', '001.webp');
      expect(isPathUnderAllowedRoots(file, [root])).toBe(true);
    });

    it('returns false for files outside allowed root', () => {
      const root = path.join(tmpDir, 'manga');
      const file = path.join(tmpDir, 'other', '001.webp');
      expect(isPathUnderAllowedRoots(file, [root])).toBe(false);
    });
  });

  describe('deleteFilesUnderRoots', () => {
    it('successfully calls shell.trashItem and tracks deleted files', async () => {
      const testFile = path.join(tmpDir, 'test.webp');
      await fs.promises.writeFile(testFile, 'dummy data');
      mockTrashItem.mockResolvedValueOnce(undefined);

      const result = await deleteFilesUnderRoots([testFile], [tmpDir]);
      expect(result.deleted).toEqual([path.resolve(testFile)]);
      expect(result.errors).toEqual([]);
      expect(mockTrashItem).toHaveBeenCalledWith(path.resolve(testFile));
    });

    it('falls back to fs.promises.unlink when shell.trashItem fails (e.g. external drives without Recycle Bin)', async () => {
      const testFile = path.join(tmpDir, 'external_drive_file.webp');
      await fs.promises.writeFile(testFile, 'dummy data');
      // Simulate Windows external drive failing to move to Recycle Bin
      mockTrashItem.mockRejectedValueOnce(new Error('Failed to move item to trash (Recycle Bin not available)'));

      const result = await deleteFilesUnderRoots([testFile], [tmpDir]);
      expect(result.deleted).toEqual([path.resolve(testFile)]);
      expect(result.errors).toEqual([]);
      // Confirm file was deleted via unlink fallback
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('records an error if file is outside allowed roots without attempting deletion', async () => {
      const outsideDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'outside-'));
      const outsideFile = path.join(outsideDir, 'forbidden.webp');
      await fs.promises.writeFile(outsideFile, 'secret');

      const result = await deleteFilesUnderRoots([outsideFile], [tmpDir]);
      expect(result.deleted).toEqual([]);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toContain('Không nằm trong thư mục đã quét');
      expect(mockTrashItem).not.toHaveBeenCalled();
      expect(fs.existsSync(outsideFile)).toBe(true);

      await fs.promises.rm(outsideDir, { recursive: true, force: true });
    });

    it('allows deletion when allowedRoots contains file paths directly', async () => {
      const testFile = path.join(tmpDir, 'selected.webp');
      await fs.promises.writeFile(testFile, 'dummy data');

      const result = await deleteFilesUnderRoots([testFile], [testFile]);
      expect(result.deleted).toEqual([path.resolve(testFile)]);
      expect(result.errors).toEqual([]);
    });
  });

  describe('scanDuplicateImages with explicit files', () => {
    it('returns error when neither roots nor files are provided', async () => {
      const res = await scanDuplicateImages([], {});
      expect(res.ok).toBe(false);
      expect(res.error).toContain('Chưa chọn thư mục hoặc tệp');
    });

    it('creates selected_files bucket and scans provided files', async () => {
      const file1 = path.join(tmpDir, 'a.png');
      const file2 = path.join(tmpDir, 'b.png');
      await fs.promises.writeFile(file1, 'fake image 1');
      await fs.promises.writeFile(file2, 'fake image 2');

      const res = await scanDuplicateImages([], { files: [file1, file2] });
      expect(res.ok).toBe(true);
      expect(Array.isArray(res.buckets)).toBe(true);
      expect(Array.isArray(res.images)).toBe(true);
      expect(res.stats).toBeDefined();
      expect(typeof res.stats.total).toBe('number');
    });
  });

  describe('listImportedImages', () => {
    it('returns empty array when no sourceDir or sourceFiles provided', async () => {
      const res = await listImportedImages({});
      expect(res.ok).toBe(true);
      expect(res.files).toEqual([]);
      expect(res.total).toBe(0);
    });

    it('lists images quickly when sourceFiles are provided', async () => {
      const file1 = path.join(tmpDir, 'page01.jpg');
      const file2 = path.join(tmpDir, 'page02.png');
      const nonImage = path.join(tmpDir, 'notes.txt');
      await fs.promises.writeFile(file1, 'image data 1');
      await fs.promises.writeFile(file2, 'image data 2');
      await fs.promises.writeFile(nonImage, 'not an image');

      const res = await listImportedImages({ sourceFiles: [file1, file2, nonImage] });
      expect(res.ok).toBe(true);
      expect(res.total).toBe(2);
      expect(res.files.map((f) => f.name)).toEqual(['page01.jpg', 'page02.png']);
      expect(res.files[0].sizeBytes).toBeGreaterThan(0);
    });

    it('lists images in directory using sourceDir', async () => {
      const subDir = path.join(tmpDir, 'sub');
      await fs.promises.mkdir(subDir, { recursive: true });
      const f1 = path.join(tmpDir, 'root.webp');
      const f2 = path.join(subDir, 'nested.jpg');
      await fs.promises.writeFile(f1, 'root webp');
      await fs.promises.writeFile(f2, 'nested jpg');

      const resRec = await listImportedImages({ sourceDir: tmpDir, includeSubfolders: true });
      expect(resRec.ok).toBe(true);
      expect(resRec.total).toBe(2);

      const resNoRec = await listImportedImages({ sourceDir: tmpDir, includeSubfolders: false });
      expect(resNoRec.ok).toBe(true);
      expect(resNoRec.total).toBe(1);
      expect(resNoRec.files[0].name).toBe('root.webp');
    });

    it('lists images across multiple folders using folders array', async () => {
      const folderA = path.join(tmpDir, 'chapA');
      const folderB = path.join(tmpDir, 'chapB');
      await fs.promises.mkdir(folderA, { recursive: true });
      await fs.promises.mkdir(folderB, { recursive: true });
      await fs.promises.writeFile(path.join(folderA, '01.png'), 'a1');
      await fs.promises.writeFile(path.join(folderB, '01.png'), 'b1');

      const res = await listImportedImages({ folders: [folderA, folderB] });
      expect(res.ok).toBe(true);
      expect(res.total).toBe(2);
      expect(res.files.map((f) => f.relativePath)).toEqual(['chapA/01.png', 'chapB/01.png']);
    });
  });
});
