const path = require('path');
const { planAutoNormalize } = require('../../../export/rename/autoNormalize');

function buildFolderEntry(name_value, parent_rel = '') {
  const rel_path = parent_rel ? path.join(parent_rel, name_value) : name_value;
  return {
    absPath: path.join('/root', rel_path),
    relPath: rel_path,
    parentRel: parent_rel,
    name: name_value,
    kind: 'folder',
    ext: '',
  };
}

function buildFileEntry(name_value, parent_rel = '') {
  const rel_path = parent_rel ? path.join(parent_rel, name_value) : name_value;
  return {
    absPath: path.join('/root', rel_path),
    relPath: rel_path,
    parentRel: parent_rel,
    name: name_value,
    kind: 'file',
    ext: path.extname(name_value),
  };
}

function buildResultMap(ops_value) {
  return Object.fromEntries(ops_value.map((op_value) => [op_value.fromRel, path.basename(op_value.toRel)]));
}

describe('planAutoNormalize', () => {
  test('pads bare file numbers by max sibling width', () => {
    const entries = [
      buildFileEntry('1.jpg'),
      buildFileEntry('10.jpg'),
      buildFileEntry('100.jpg'),
    ];

    const ops = planAutoNormalize({ entries });
    const result_map = buildResultMap(ops);

    expect(result_map['1.jpg']).toBe('001.jpg');
    expect(result_map['10.jpg']).toBe('010.jpg');
    expect(result_map['100.jpg']).toBeUndefined();
  });

  test('pads integer chapters and promotes integer to .0 when .5 sibling exists', () => {
    const entries = [buildFolderEntry('Chap 001'), buildFolderEntry('Chap 001.5')];

    const ops = planAutoNormalize({ entries });
    const result_map = buildResultMap(ops);

    expect(result_map['Chap 001']).toBe('Chap 001.0');
    expect(result_map['Chap 001.5']).toBeUndefined();
  });

  test('re-homes existing .0 before assigning a free slot below .5 to integer', () => {
    const entries = [buildFolderEntry('Chap 001'), buildFolderEntry('Chap 001.0')];

    const ops = planAutoNormalize({ entries });
    const result_map = buildResultMap(ops);

    expect(result_map['Chap 001.0']).toBe('Chap 001.5');
    expect(result_map['Chap 001']).toBe('Chap 001.1');
  });

  test('runs literal find replace before normalization', () => {
    const entries = [
      buildFolderEntry('Ch. 1'),
      buildFolderEntry('Ch. 10'),
      buildFolderEntry('Ch. 100'),
    ];

    const ops = planAutoNormalize({ entries, find: 'Ch.', replace: 'Chap' });
    const result_map = buildResultMap(ops);

    expect(result_map['Ch. 1']).toBe('Chap 001');
    expect(result_map['Ch. 10']).toBe('Chap 010');
    expect(result_map['Ch. 100']).toBe('Chap 100');
  });

  test('pads parenthetical page index for volume style files', () => {
    const entries = [
      buildFileEntry('Vol 1 (1).jpg'),
      buildFileEntry('Vol 1 (10).jpg'),
    ];

    const ops = planAutoNormalize({ entries });
    const result_map = buildResultMap(ops);

    expect(result_map['Vol 1 (1).jpg']).toBe('Vol 1 (01).jpg');
    expect(result_map['Vol 1 (10).jpg']).toBeUndefined();
  });

  test('keeps a lone integer chapter as padded integer without forcing .0', () => {
    const entries = [buildFolderEntry('Chap 1'), buildFolderEntry('Chap 10')];

    const ops = planAutoNormalize({ entries });
    const result_map = buildResultMap(ops);

    expect(result_map['Chap 1']).toBe('Chap 01');
    expect(result_map['Chap 10']).toBeUndefined();
  });

  test('pads integer part of existing decimals including .0', () => {
    const entries = [buildFolderEntry('Chap 1.0'), buildFolderEntry('Chap 10.0')];
    const ops = planAutoNormalize({ entries });
    const rel_map = Object.fromEntries(ops.map((op_value) => [op_value.fromRel, op_value.toRel]));

    expect(rel_map['Chap 1.0']).toBe('Chap 01.0');
    expect(rel_map['Chap 10.0']).toBeUndefined();
  });

  test('normalizes siblings independently per parent directory', () => {
    const entries = [
      buildFolderEntry('Chap 1', 'Season A'),
      buildFolderEntry('Chap 10', 'Season A'),
      buildFolderEntry('Chap 1', 'Season B'),
      buildFolderEntry('Chap 100', 'Season B'),
    ];

    const ops = planAutoNormalize({ entries });
    const rel_map = Object.fromEntries(ops.map((op_value) => [op_value.fromRel, op_value.toRel]));

    expect(rel_map[path.join('Season A', 'Chap 1')]).toBe(path.join('Season A', 'Chap 01'));
    expect(rel_map[path.join('Season B', 'Chap 1')]).toBe(path.join('Season B', 'Chap 001'));
  });
});
