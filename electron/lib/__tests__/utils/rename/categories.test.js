const path = require('path');
const {
  planFindReplace,
  planSequenceNumbers,
  planInsertRemove,
  planChangeCase,
  planRegexReplace,
  planTruncate,
  planExtension,
  planDeleteDsStore,
} = require('../../../export/rename/categories');

const file = (name) => ({
  name,
  kind: 'file',
  ext: path.extname(name),
  absPath: `/r/${name}`,
  relPath: name,
  parentRel: '',
});

const folder = (name) => ({
  name,
  kind: 'folder',
  ext: '',
  absPath: `/r/${name}`,
  relPath: name,
  parentRel: '',
});

describe('planFindReplace', () => {
  test('literal find replace on basename', () => {
    const ops = planFindReplace({
      entries: [file('Ch 01.jpg')],
      action: 'literal',
      params: { find: 'Ch ', replace: 'Chap ', caseSensitive: true },
    });
    expect(ops[0].toRel).toBe('Chap 01.jpg');
  });

  test('literal case-insensitive replace', () => {
    const ops = planFindReplace({
      entries: [file('Ch 01.jpg')],
      action: 'literal',
      params: { find: 'ch ', replace: 'Chap ', caseSensitive: false },
    });
    expect(ops[0].toRel).toBe('Chap 01.jpg');
  });

  test('regex action replaces on basename', () => {
    const ops = planFindReplace({
      entries: [file('Chap 01.jpg')],
      action: 'regex',
      params: { find: 'Chap\\s+(\\d+)', replace: 'Ch $1', caseSensitive: true },
    });
    expect(ops[0].toRel).toBe('Ch 01.jpg');
  });

  test('unchanged names produce no ops', () => {
    const ops = planFindReplace({
      entries: [file('Chap 01.jpg')],
      action: 'literal',
      params: { find: 'zzz', replace: 'x', caseSensitive: true },
    });
    expect(ops).toEqual([]);
  });
});

describe('planSequenceNumbers', () => {
  test('sequence numbers with padding and per-folder restart', () => {
    const entries = [
      { ...file('a.jpg'), absPath: '/r/sub/a.jpg', relPath: path.join('sub', 'a.jpg'), parentRel: 'sub', name: 'a.jpg' },
      { ...file('b.jpg'), absPath: '/r/sub/b.jpg', relPath: path.join('sub', 'b.jpg'), parentRel: 'sub', name: 'b.jpg' },
      { ...file('z.jpg'), absPath: '/r/other/z.jpg', relPath: path.join('other', 'z.jpg'), parentRel: 'other', name: 'z.jpg' },
    ];
    const ops = planSequenceNumbers({
      entries,
      params: {
        prefix: 'Chương ',
        suffix: '',
        start: 215,
        step: 1,
        padding: 3,
        sortEachFolderSeparately: true,
        sortFirst: 'nameAsc',
        sortThen: 'nameAsc',
      },
    });
    const map = Object.fromEntries(ops.map((o) => [o.fromRel, path.basename(o.toRel)]));
    expect(map[path.join('sub', 'a.jpg')]).toBe('Chương 215.jpg');
    expect(map[path.join('sub', 'b.jpg')]).toBe('Chương 216.jpg');
    expect(map[path.join('other', 'z.jpg')]).toBe('Chương 215.jpg');
  });

  test('nameSeqAsc sorts by first number then nameAsc tie-break', () => {
    const entries = [
      file('page10.jpg'),
      file('page2.jpg'),
      file('page2b.jpg'),
    ];
    const ops = planSequenceNumbers({
      entries,
      params: {
        prefix: '',
        suffix: '',
        start: 1,
        step: 1,
        padding: 2,
        sortEachFolderSeparately: false,
        sortFirst: 'nameSeqAsc',
        sortThen: 'nameAsc',
      },
    });
    const map = Object.fromEntries(ops.map((o) => [o.fromRel, o.toRel]));
    expect(map['page2.jpg']).toBe('01.jpg');
    expect(map['page2b.jpg']).toBe('02.jpg');
    expect(map['page10.jpg']).toBe('03.jpg');
  });
});

describe('planInsertRemove', () => {
  test('insert at start', () => {
    const ops = planInsertRemove({
      entries: [file('01.jpg')],
      action: 'insert',
      params: { text: 'Chap ', position: 'start' },
    });
    expect(ops[0].toRel).toBe('Chap 01.jpg');
  });

  test('insert at end', () => {
    const ops = planInsertRemove({
      entries: [file('01.jpg')],
      action: 'insert',
      params: { text: 'x', position: 'end' },
    });
    expect(ops[0].toRel).toBe('01x.jpg');
  });

  test('insert at index', () => {
    const ops = planInsertRemove({
      entries: [file('abcd.jpg')],
      action: 'insert',
      params: { text: 'X', position: 'index', index: 2 },
    });
    expect(ops[0].toRel).toBe('abXcd.jpg');
  });

  test('remove range from basename', () => {
    const ops = planInsertRemove({
      entries: [file('Chap 01.jpg')],
      action: 'remove',
      params: { startIndex: 0, length: 5 },
    });
    expect(ops[0].toRel).toBe('01.jpg');
  });
});

describe('planChangeCase', () => {
  test('change case lower keeps extension case', () => {
    const ops = planChangeCase({ entries: [file('Photo.JPG')], action: 'lower' });
    expect(ops[0].toRel).toBe('photo.JPG');
  });

  test('upper case', () => {
    const ops = planChangeCase({ entries: [file('photo.jpg')], action: 'upper' });
    expect(ops[0].toRel).toBe('PHOTO.jpg');
  });

  test('title case', () => {
    const ops = planChangeCase({ entries: [file('hello world.jpg')], action: 'title' });
    expect(ops[0].toRel).toBe('Hello World.jpg');
  });
});

describe('planRegexReplace', () => {
  test('replaces with global regex', () => {
    const ops = planRegexReplace({
      entries: [file('aa.jpg')],
      params: { pattern: 'a', replacement: 'b', caseInsensitive: false },
    });
    expect(ops[0].toRel).toBe('bb.jpg');
  });

  test('invalid regex throws', () => {
    expect(() =>
      planRegexReplace({
        entries: [file('a.jpg')],
        params: { pattern: '(', replacement: 'x', caseInsensitive: false },
      })
    ).toThrow();
  });
});

describe('planTruncate', () => {
  test('truncate from end', () => {
    const ops = planTruncate({
      entries: [file('abcdefghij.jpg')],
      action: 'fromEnd',
      params: { maxLength: 5 },
    });
    expect(ops[0].toRel).toBe('abcde.jpg');
  });

  test('truncate from start', () => {
    const ops = planTruncate({
      entries: [file('abcdefghij.jpg')],
      action: 'fromStart',
      params: { maxLength: 5 },
    });
    expect(ops[0].toRel).toBe('fghij.jpg');
  });
});

describe('planExtension', () => {
  test('set extension', () => {
    const ops = planExtension({
      entries: [file('a.jpg')],
      action: 'set',
      params: { extension: 'png' },
    });
    expect(ops[0].toRel).toBe('a.png');
  });

  test('remove extension', () => {
    const ops = planExtension({
      entries: [file('a.jpg')],
      action: 'remove',
      params: { extension: '' },
    });
    expect(ops[0].toRel).toBe('a');
  });

  test('addIfMissing only when missing', () => {
    const missing_ops = planExtension({
      entries: [file('a')],
      action: 'addIfMissing',
      params: { extension: 'jpg' },
    });
    expect(missing_ops[0].toRel).toBe('a.jpg');

    const existing_ops = planExtension({
      entries: [file('a.jpg')],
      action: 'addIfMissing',
      params: { extension: 'png' },
    });
    expect(existing_ops).toEqual([]);
  });

  test('folders produce no ops', () => {
    const ops = planExtension({
      entries: [folder('Chap 01')],
      action: 'set',
      params: { extension: 'png' },
    });
    expect(ops).toEqual([]);
  });
});

describe('planDeleteDsStore', () => {
  test('plans delete ops only for .DS_Store files', () => {
    const nested_ds = {
      name: '.DS_Store',
      kind: 'file',
      ext: '',
      absPath: path.join('/r', 'Chap 1', '.DS_Store'),
      relPath: path.join('Chap 1', '.DS_Store'),
      parentRel: 'Chap 1',
    };
    const ops = planDeleteDsStore({
      entries: [file('1.jpg'), file('.DS_Store'), nested_ds, folder('Chap 1')],
    });
    expect(ops).toHaveLength(2);
    expect(ops.every((op_value) => op_value.opType === 'delete')).toBe(true);
    expect(ops.map((op_value) => op_value.fromRel).sort()).toEqual(
      ['.DS_Store', path.join('Chap 1', '.DS_Store')].sort()
    );
    expect(ops[0].toRel).toBe(ops[0].fromRel);
  });

  test('ignores similarly named files that are not exactly .DS_Store', () => {
    const ops = planDeleteDsStore({
      entries: [file('DS_Store'), file('.ds_store'), file('._.DS_Store')],
    });
    expect(ops).toEqual([]);
  });
});
