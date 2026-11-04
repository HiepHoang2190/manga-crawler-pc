/**
 * Tests for removeEmptyChapterDir — only delete truly empty chapter folders.
 */
const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { removeEmptyChapterDir } = require('../../download/removeEmptyChapterDir');

describe('removeEmptyChapterDir', () => {
  let temp_root;

  beforeEach(() => {
    temp_root = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-chapter-dir-'));
  });

  afterEach(() => {
    if (fs.existsSync(temp_root)) {
      fs.rmSync(temp_root, { recursive: true, force: true });
    }
  });

  it('removes an empty directory and returns true', () => {
    const chapter_dir = path.join(temp_root, 'Chapter 1');
    fs.mkdirSync(chapter_dir, { recursive: true });

    const removed = removeEmptyChapterDir(chapter_dir);

    expect(removed).toBe(true);
    expect(fs.existsSync(chapter_dir)).toBe(false);
  });

  it('keeps directory when it contains a non-empty file', () => {
    const chapter_dir = path.join(temp_root, 'Chapter 2');
    fs.mkdirSync(chapter_dir, { recursive: true });
    fs.writeFileSync(path.join(chapter_dir, '001.jpg'), 'data');

    const removed = removeEmptyChapterDir(chapter_dir);

    expect(removed).toBe(false);
    expect(fs.existsSync(chapter_dir)).toBe(true);
    expect(fs.existsSync(path.join(chapter_dir, '001.jpg'))).toBe(true);
  });

  it('keeps directory when it only has an empty file (partial download residue)', () => {
    const chapter_dir = path.join(temp_root, 'Chapter 3');
    fs.mkdirSync(chapter_dir, { recursive: true });
    fs.writeFileSync(path.join(chapter_dir, '001.jpg'), '');

    const removed = removeEmptyChapterDir(chapter_dir);

    expect(removed).toBe(false);
    expect(fs.existsSync(chapter_dir)).toBe(true);
  });

  it('returns false when path does not exist', () => {
    const chapter_dir = path.join(temp_root, 'Missing');
    expect(removeEmptyChapterDir(chapter_dir)).toBe(false);
  });

  it('returns false when path is a file', () => {
    const file_path = path.join(temp_root, 'not-a-dir.txt');
    fs.writeFileSync(file_path, 'x');
    expect(removeEmptyChapterDir(file_path)).toBe(false);
    expect(fs.existsSync(file_path)).toBe(true);
  });

  it('ignores macOS AppleDouble junk and still removes if nothing else remains', () => {
    const chapter_dir = path.join(temp_root, 'Chapter 4');
    fs.mkdirSync(chapter_dir, { recursive: true });
    fs.writeFileSync(path.join(chapter_dir, '._001.jpg'), 'junk');
    fs.writeFileSync(path.join(chapter_dir, '.DS_Store'), 'junk');

    const removed = removeEmptyChapterDir(chapter_dir);

    expect(removed).toBe(true);
    expect(fs.existsSync(chapter_dir)).toBe(false);
  });

  it('ignores Windows junk files and still removes if nothing else remains', () => {
    const chapter_dir = path.join(temp_root, 'Chapter 5');
    fs.mkdirSync(chapter_dir, { recursive: true });
    fs.writeFileSync(path.join(chapter_dir, 'Thumbs.db'), 'junk');
    fs.writeFileSync(path.join(chapter_dir, 'desktop.ini'), 'junk');

    const removed = removeEmptyChapterDir(chapter_dir);

    expect(removed).toBe(true);
    expect(fs.existsSync(chapter_dir)).toBe(false);
  });
});
