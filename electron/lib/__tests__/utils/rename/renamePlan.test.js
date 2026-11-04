const fs = require('fs');
const os = require('os');
const path = require('path');
const { namesEqual, pathsEqual, displayNamesDiffer } = require('../../../export/rename/pathCompare');
const { scanRenameTree } = require('../../../export/rename/scanRenameTree');

describe('pathCompare', () => {
  const original_platform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: original_platform });
  });

  test('namesEqual is case-sensitive on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(namesEqual('Chap 001', 'chap 001')).toBe(false);
  });

  test('namesEqual folds case on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(namesEqual('Chap 001', 'chap 001')).toBe(true);
  });

  test('namesEqual folds case on darwin (typical case-insensitive volumes)', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(namesEqual('Chap 001', 'chap 001')).toBe(true);
  });

  test('displayNamesDiffer is case-sensitive even when FS folds case', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(displayNamesDiffer('Photo', 'photo')).toBe(true);
    expect(displayNamesDiffer('Photo', 'Photo')).toBe(false);
  });

  test('namesEqual treats NFC and NFD as equal via Unicode normalization', () => {
    const nfc_name = 'caf\u00e9';
    const nfd_name = 'caf\u0065\u0301';
    expect(namesEqual(nfc_name, nfd_name)).toBe(true);
  });

  test('pathsEqual normalizes redundant separators', () => {
    const left_path = path.join('foo', 'bar', 'baz');
    const right_path = `foo${path.sep}${path.sep}bar${path.sep}baz`;
    expect(pathsEqual(left_path, right_path)).toBe(true);
  });

  test('pathsEqual is case-sensitive on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(pathsEqual('/Foo/Bar', '/foo/bar')).toBe(false);
  });

  test('pathsEqual folds path case on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(pathsEqual('C:\\Foo\\Bar', 'c:\\foo\\bar')).toBe(true);
  });

  test('pathsEqual folds path case on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(pathsEqual('/Foo/Bar', '/foo/bar')).toBe(true);
  });
});

describe('scanRenameTree', () => {
  let temp_root;

  beforeEach(() => {
    temp_root = fs.mkdtempSync(path.join(os.tmpdir(), 'rename-scan-'));
    fs.mkdirSync(path.join(temp_root, 'Chap 1'));
    fs.writeFileSync(path.join(temp_root, 'Chap 1', '1.jpg'), 'x');
    fs.mkdirSync(path.join(temp_root, 'Chap 1', 'nested'));
    fs.writeFileSync(path.join(temp_root, 'Chap 1', 'nested', '2.png'), 'y');
  });

  afterEach(() => {
    fs.rmSync(temp_root, { recursive: true, force: true });
  });

  test('rejects empty rootDir without scanning cwd', () => {
    const result = scanRenameTree({ rootDir: '' });
    expect(result).toEqual({ ok: false, error: 'Invalid root directory', entries: [] });
  });

  test('rejects missing rootDir without scanning cwd', () => {
    const result = scanRenameTree({});
    expect(result).toEqual({ ok: false, error: 'Invalid root directory', entries: [] });
  });

  test('scans recursively folders and files', () => {
    const result = scanRenameTree({
      rootDir: temp_root,
      includeFolders: true,
      includeFiles: true,
    });
    expect(result.ok).toBe(true);
    const rels = result.entries.map((e) => e.relPath).sort();
    expect(rels).toEqual(
      [
        path.join('Chap 1'),
        path.join('Chap 1', '1.jpg'),
        path.join('Chap 1', 'nested'),
        path.join('Chap 1', 'nested', '2.png'),
      ].sort()
    );
  });

  test('can include only files', () => {
    const result = scanRenameTree({
      rootDir: temp_root,
      includeFolders: false,
      includeFiles: true,
    });
    expect(result.entries.every((e) => e.kind === 'file')).toBe(true);
  });

  test('can include only folders', () => {
    const result = scanRenameTree({
      rootDir: temp_root,
      includeFolders: true,
      includeFiles: false,
    });
    expect(result.ok).toBe(true);
    expect(result.entries.every((e) => e.kind === 'folder')).toBe(true);
    expect(result.entries.map((e) => e.relPath).sort()).toEqual([
      path.join('Chap 1'),
      path.join('Chap 1', 'nested'),
    ].sort());
  });

  test('scans individual sourceFiles array directly', () => {
    const f1 = path.join(temp_root, 'Chap 1', '1.jpg');
    const f2 = path.join(temp_root, 'Chap 1', 'nested', '2.png');
    const result = scanRenameTree({
      sourceFiles: [f1, f2],
    });
    expect(result.ok).toBe(true);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.name).sort()).toEqual(['1.jpg', '2.png']);
    expect(result.entries.every((e) => e.kind === 'file')).toBe(true);
  });

  test('sourceFiles respects includeFiles: false', () => {
    const f1 = path.join(temp_root, 'Chap 1', '1.jpg');
    const result = scanRenameTree({
      sourceFiles: [f1],
      includeFiles: false,
    });
    expect(result.ok).toBe(true);
    expect(result.entries).toHaveLength(0);
  });

  test('respects includeSubfolders: false by not recursing into subdirectories', () => {
    const result = scanRenameTree({
      rootDir: temp_root,
      includeFolders: true,
      includeFiles: true,
      includeSubfolders: false,
    });
    expect(result.ok).toBe(true);
    const rels = result.entries.map((e) => e.relPath).sort();
    expect(rels).toEqual([path.join('Chap 1')]);
  });
});

describe('buildRenamePlan', () => {
  const { buildRenamePlan } = require('../../../export/rename/renamePlan');

  test('buildRenamePlan autoNormalize wires ops', () => {
    const entries = [
      { name: 'Chap 001', kind: 'folder', ext: '', absPath: '/r/Chap 001', relPath: 'Chap 001', parentRel: '' },
      { name: 'Chap 001.5', kind: 'folder', ext: '', absPath: '/r/Chap 001.5', relPath: 'Chap 001.5', parentRel: '' },
    ];
    const plan = buildRenamePlan({
      entries,
      category: 'autoNormalize',
      action: 'normalize',
      params: {},
      existsSync: () => false,
    });
    expect(plan.ok).toBe(true);
    expect(plan.ops.some((o) => o.toRel === 'Chap 001.0')).toBe(true);
  });

  test('duplicate targets are blocked', () => {
    const entries = [
      { name: 'a.jpg', kind: 'file', ext: '.jpg', absPath: '/r/a.jpg', relPath: 'a.jpg', parentRel: '' },
      { name: 'b.jpg', kind: 'file', ext: '.jpg', absPath: '/r/b.jpg', relPath: 'b.jpg', parentRel: '' },
    ];
    const plan = buildRenamePlan({
      entries,
      category: 'findReplace',
      action: 'literal',
      params: { find: 'b', replace: 'a', caseSensitive: true },
      existsSync: () => false,
    });
    // a.jpg unchanged; b.jpg → a.jpg collides with existing source name a.jpg
    expect(plan.blocked.length).toBeGreaterThan(0);
  });

  test('blocks target that exists on disk outside plan sources', () => {
    const entries = [
      { name: 'b.jpg', kind: 'file', ext: '.jpg', absPath: '/r/b.jpg', relPath: 'b.jpg', parentRel: '' },
    ];
    const plan = buildRenamePlan({
      entries,
      category: 'findReplace',
      action: 'literal',
      params: { find: 'b', replace: 'c', caseSensitive: true },
      existsSync: (check_path) => check_path === '/r/c.jpg',
    });
    expect(plan.ops).toHaveLength(0);
    expect(plan.blocked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromRel: 'b.jpg' }),
      ])
    );
  });

  test('allows rename onto path vacated by another op in the plan', () => {
    const entries = [
      { name: 'a.jpg', kind: 'file', ext: '.jpg', absPath: '/r/a.jpg', relPath: 'a.jpg', parentRel: '' },
      { name: 'b.jpg', kind: 'file', ext: '.jpg', absPath: '/r/b.jpg', relPath: 'b.jpg', parentRel: '' },
    ];
    const plan = buildRenamePlan({
      entries,
      category: 'findReplace',
      action: 'literal',
      params: { find: 'a', replace: 'x', caseSensitive: true },
      existsSync: (check_path) => check_path === '/r/a.jpg' || check_path === '/r/b.jpg',
    });
    // Only a.jpg → x.jpg; target does not exist; b unchanged
    expect(plan.ok).toBe(true);
    expect(plan.blocked).toHaveLength(0);
    expect(plan.ops.some((o) => o.fromRel === 'a.jpg' && o.toRel === 'x.jpg')).toBe(true);
  });

  test('allows case-only rename when existsSync sees the same path on case-insensitive FS', () => {
    const entries = [
      {
        name: 'Photo.JPG',
        kind: 'file',
        ext: '.JPG',
        absPath: '/r/Photo.JPG',
        relPath: 'Photo.JPG',
        parentRel: '',
      },
    ];
    const plan = buildRenamePlan({
      entries,
      category: 'changeCase',
      action: 'lower',
      params: {},
      // Case-insensitive volume: photo.JPG resolves to the same inode as Photo.JPG
      existsSync: (check_path) =>
        check_path === '/r/Photo.JPG' || check_path === '/r/photo.JPG',
    });
    expect(plan.ok).toBe(true);
    expect(plan.blocked).toHaveLength(0);
    expect(plan.ops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromRel: 'Photo.JPG', toRel: 'photo.JPG' }),
      ])
    );
  });

  test('non-cleanup categories ignore .DS_Store entries', () => {
    const entries = [
      {
        name: '.DS_Store',
        kind: 'file',
        ext: '',
        absPath: '/r/.DS_Store',
        relPath: '.DS_Store',
        parentRel: '',
      },
      {
        name: '1.jpg',
        kind: 'file',
        ext: '.jpg',
        absPath: '/r/1.jpg',
        relPath: '1.jpg',
        parentRel: '',
      },
      {
        name: '10.jpg',
        kind: 'file',
        ext: '.jpg',
        absPath: '/r/10.jpg',
        relPath: '10.jpg',
        parentRel: '',
      },
    ];
    const plan = buildRenamePlan({
      entries,
      category: 'autoNormalize',
      action: 'normalize',
      params: {},
      existsSync: () => false,
    });
    expect(plan.ok).toBe(true);
    expect(plan.ops.every((op_value) => !String(op_value.fromRel).endsWith('.DS_Store'))).toBe(true);
    expect(plan.ops.some((op_value) => op_value.toRel === '01.jpg')).toBe(true);
    expect(plan.unchangedCount).toBe(1);
  });

  test('cleanup category still plans .DS_Store deletes', () => {
    const entries = [
      {
        name: '.DS_Store',
        kind: 'file',
        ext: '',
        absPath: '/r/.DS_Store',
        relPath: '.DS_Store',
        parentRel: '',
      },
      {
        name: '1.jpg',
        kind: 'file',
        ext: '.jpg',
        absPath: '/r/1.jpg',
        relPath: '1.jpg',
        parentRel: '',
      },
    ];
    const plan = buildRenamePlan({
      entries,
      category: 'cleanup',
      action: 'deleteDsStore',
      params: {},
      existsSync: () => false,
    });
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0].opType).toBe('delete');
    expect(plan.ops[0].fromRel).toBe('.DS_Store');
  });

  test('returns unchanged ops array for unmutated items', () => {
    const entries = [
      { name: 'a.jpg', kind: 'file', ext: '.jpg', absPath: '/r/a.jpg', relPath: 'a.jpg', parentRel: '' },
      { name: 'b.jpg', kind: 'file', ext: '.jpg', absPath: '/r/b.jpg', relPath: 'b.jpg', parentRel: '' },
    ];
    const plan = buildRenamePlan({
      entries,
      category: 'findReplace',
      action: 'literal',
      params: { find: 'a', replace: 'c', caseSensitive: true },
      existsSync: () => false,
    });
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0].fromRel).toBe('a.jpg');
    expect(plan.ops[0].toRel).toBe('c.jpg');
    expect(plan.unchangedCount).toBe(1);
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.unchanged[0].fromRel).toBe('b.jpg');
    expect(plan.unchanged[0].toRel).toBe('b.jpg');
  });
});
