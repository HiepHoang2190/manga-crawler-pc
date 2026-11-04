const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  applyRenamePlan,
  applyUndoOps,
  requestCancelRename,
  resetRenameCancel,
} = require('../../../export/rename/renameApply');

describe('renameApply', () => {
  let temp_root;

  beforeEach(() => {
    resetRenameCancel();
    temp_root = fs.mkdtempSync(path.join(os.tmpdir(), 'rename-apply-'));
  });

  afterEach(() => {
    resetRenameCancel();
    fs.rmSync(temp_root, { recursive: true, force: true });
  });

  test('two-phase swap avoids clobber', async () => {
    const path_a = path.join(temp_root, 'A');
    const path_b = path.join(temp_root, 'B');
    fs.writeFileSync(path_a, 'a');
    fs.writeFileSync(path_b, 'b');

    const apply_result = await applyRenamePlan({
      ops: [
        {
          fromAbs: path_a,
          toAbs: path.join(temp_root, 'B'),
          fromRel: 'A',
          toRel: 'B',
          kind: 'file',
        },
        {
          fromAbs: path_b,
          toAbs: path.join(temp_root, 'A'),
          fromRel: 'B',
          toRel: 'A',
          kind: 'file',
        },
      ],
    });

    expect(apply_result.ok).toBe(true);
    expect(apply_result.cancelled).toBe(false);
    expect(apply_result.renamed).toBe(2);
    expect(fs.readFileSync(path.join(temp_root, 'A'), 'utf8')).toBe('b');
    expect(fs.readFileSync(path.join(temp_root, 'B'), 'utf8')).toBe('a');

    const undo_result = await applyUndoOps({ undoOps: apply_result.undoOps });
    expect(undo_result.ok).toBe(true);
    expect(fs.readFileSync(path_a, 'utf8')).toBe('a');
    expect(fs.readFileSync(path_b, 'utf8')).toBe('b');
  });

  test('cancel during phase A restores originals', async () => {
    const path_a = path.join(temp_root, 'A');
    const path_b = path.join(temp_root, 'B');
    fs.writeFileSync(path_a, 'a');
    fs.writeFileSync(path_b, 'b');

    const apply_result = await applyRenamePlan({
      ops: [
        {
          fromAbs: path_a,
          toAbs: path.join(temp_root, 'B'),
          fromRel: 'A',
          toRel: 'B',
          kind: 'file',
        },
        {
          fromAbs: path_b,
          toAbs: path.join(temp_root, 'A'),
          fromRel: 'B',
          toRel: 'A',
          kind: 'file',
        },
      ],
      onProgress: ({ done, phase }) => {
        if (phase === 'A' && done === 1) {
          requestCancelRename();
        }
      },
    });

    expect(apply_result.ok).toBe(false);
    expect(apply_result.cancelled).toBe(true);
    expect(apply_result.undoOps).toEqual([]);
    expect(fs.readFileSync(path_a, 'utf8')).toBe('a');
    expect(fs.readFileSync(path_b, 'utf8')).toBe('b');
  });

  test('parent folder and child file rename without ENOENT', async () => {
    const chap_one_dir = path.join(temp_root, 'Chap 1');
    const chap_ten_dir = path.join(temp_root, 'Chap 10');
    const page_file = path.join(chap_one_dir, 'page.jpg');
    fs.mkdirSync(chap_one_dir);
    fs.mkdirSync(chap_ten_dir);
    fs.writeFileSync(page_file, 'img');

    const folder_to = path.join(temp_root, 'Chap 001');
    const file_to = path.join(chap_one_dir, '001.jpg');

    const apply_result = await applyRenamePlan({
      ops: [
        {
          fromAbs: chap_one_dir,
          toAbs: folder_to,
          fromRel: 'Chap 1',
          toRel: 'Chap 001',
          kind: 'folder',
        },
        {
          fromAbs: page_file,
          toAbs: file_to,
          fromRel: path.join('Chap 1', 'page.jpg'),
          toRel: path.join('Chap 1', '001.jpg'),
          kind: 'file',
        },
      ],
    });

    expect(apply_result.ok).toBe(true);
    expect(apply_result.cancelled).toBe(false);
    expect(apply_result.renamed).toBe(2);
    expect(fs.existsSync(folder_to)).toBe(true);
    expect(fs.existsSync(path.join(folder_to, '001.jpg'))).toBe(true);
    expect(fs.readFileSync(path.join(folder_to, '001.jpg'), 'utf8')).toBe('img');
    expect(fs.existsSync(chap_one_dir)).toBe(false);
    expect(fs.existsSync(chap_ten_dir)).toBe(true);

    const undo_result = await applyUndoOps({ undoOps: apply_result.undoOps });
    expect(undo_result.ok).toBe(true);
    expect(fs.existsSync(chap_one_dir)).toBe(true);
    expect(fs.existsSync(page_file)).toBe(true);
    expect(fs.readFileSync(page_file, 'utf8')).toBe('img');
    expect(fs.existsSync(folder_to)).toBe(false);
  });

  test('applyUndoOps does not nest further undo', async () => {
    const path_a = path.join(temp_root, 'A');
    const path_c = path.join(temp_root, 'C');
    fs.writeFileSync(path_a, 'a');

    const apply_result = await applyRenamePlan({
      ops: [
        {
          fromAbs: path_a,
          toAbs: path_c,
          fromRel: 'A',
          toRel: 'C',
          kind: 'file',
        },
      ],
    });
    expect(apply_result.ok).toBe(true);
    expect(fs.readFileSync(path_c, 'utf8')).toBe('a');

    const undo_result = await applyUndoOps({ undoOps: apply_result.undoOps });
    expect(undo_result.ok).toBe(true);
    expect(undo_result.undoOps).toEqual([]);
    expect(fs.readFileSync(path_a, 'utf8')).toBe('a');
  });

  test('delete ops move .DS_Store via trashItem and skip undo', async () => {
    const chap_dir = path.join(temp_root, 'Chap 1');
    fs.mkdirSync(chap_dir);
    const ds_store_path = path.join(chap_dir, '.DS_Store');
    const page_path = path.join(chap_dir, '1.jpg');
    fs.writeFileSync(ds_store_path, 'meta');
    fs.writeFileSync(page_path, 'img');
    const trashed_paths = [];

    const apply_result = await applyRenamePlan({
      ops: [
        {
          fromAbs: ds_store_path,
          toAbs: ds_store_path,
          fromRel: path.join('Chap 1', '.DS_Store'),
          toRel: path.join('Chap 1', '.DS_Store'),
          kind: 'file',
          opType: 'delete',
        },
      ],
      trashItem: async (file_path) => {
        trashed_paths.push(file_path);
        fs.unlinkSync(file_path);
      },
    });

    expect(apply_result.ok).toBe(true);
    expect(apply_result.renamed).toBe(1);
    expect(apply_result.undoOps).toEqual([]);
    expect(trashed_paths).toEqual([ds_store_path]);
    expect(fs.existsSync(ds_store_path)).toBe(false);
    expect(fs.existsSync(page_path)).toBe(true);
  });
});
