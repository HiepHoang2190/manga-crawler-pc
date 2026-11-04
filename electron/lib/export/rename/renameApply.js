const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

let renameCancelled = false;

function requestCancelRename() {
  renameCancelled = true;
}

function resetRenameCancel() {
  renameCancelled = false;
}

function isCancelled() {
  return renameCancelled;
}

function getPathDepth(abs_path) {
  const normalized_path = path.normalize(abs_path);
  return normalized_path.split(path.sep).filter((part) => part !== '').length;
}

/**
 * If abs_path is old_prefix or under it, rewrite the prefix to new_prefix.
 * @param {string} abs_path
 * @param {string} old_prefix
 * @param {string} new_prefix
 * @returns {string}
 */
function rewritePathPrefix(abs_path, old_prefix, new_prefix) {
  const normalized_path = path.normalize(abs_path);
  const normalized_old = path.normalize(old_prefix);
  const normalized_new = path.normalize(new_prefix);

  if (normalized_path === normalized_old) {
    return normalized_new;
  }

  const bordered_old = normalized_old.endsWith(path.sep)
    ? normalized_old
    : `${normalized_old}${path.sep}`;

  if (!normalized_path.startsWith(bordered_old)) {
    return abs_path;
  }

  return path.normalize(
    path.join(normalized_new, normalized_path.slice(bordered_old.length))
  );
}

/**
 * Rewrite only strict descendants (not the prefix path itself).
 * Needed so sibling swaps (A↔B) are not treated as nested renames.
 * @param {string} abs_path
 * @param {string} old_prefix
 * @param {string} new_prefix
 * @returns {string}
 */
function rewriteDescendantPathPrefix(abs_path, old_prefix, new_prefix) {
  const normalized_path = path.normalize(abs_path);
  const normalized_old = path.normalize(old_prefix);
  if (normalized_path === normalized_old) {
    return abs_path;
  }
  return rewritePathPrefix(abs_path, old_prefix, new_prefix);
}

/**
 * Rewrite destination paths so children land under renamed ancestors.
 * @param {Array<{ fromAbs: string, toAbs: string }>} ops
 * @returns {Array<{ fromAbs: string, toAbs: string }>}
 */
function resolveNestedDestinationPaths(ops) {
  const resolved_ops = ops.map((op_value) => ({
    fromAbs: op_value.fromAbs,
    toAbs: op_value.toAbs,
  }));
  const ancestors_first = [...resolved_ops].sort(
    (left, right) => getPathDepth(left.fromAbs) - getPathDepth(right.fromAbs)
  );

  for (const ancestor_op of ancestors_first) {
    for (const op_value of resolved_ops) {
      if (op_value === ancestor_op) {
        continue;
      }
      op_value.toAbs = rewriteDescendantPathPrefix(
        op_value.toAbs,
        ancestor_op.fromAbs,
        ancestor_op.toAbs
      );
    }
  }

  return resolved_ops;
}

function createTempAbs(from_abs) {
  const parent_dir = path.dirname(from_abs);
  const original_base = path.basename(from_abs);
  return path.join(parent_dir, `.__rename_tmp_${randomUUID()}__${original_base}`);
}

async function renamePath(from_abs, to_abs) {
  await fs.promises.rename(from_abs, to_abs);
}

async function bestEffortRename(from_abs, to_abs) {
  try {
    await renamePath(from_abs, to_abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * After moving old_prefix → new_prefix, update tempAbs on other entries still under it.
 * @param {Array<{ tempAbs: string }>} entries
 * @param {string} old_prefix
 * @param {string} new_prefix
 * @param {{ tempAbs: string } | null} skip_entry
 */
function remapTempAbsUnderPrefix(entries, old_prefix, new_prefix, skip_entry = null) {
  for (const entry of entries) {
    if (entry === skip_entry) {
      continue;
    }
    entry.tempAbs = rewritePathPrefix(entry.tempAbs, old_prefix, new_prefix);
  }
}

/**
 * Roll back phase-A temps to their original paths (best effort, reverse order).
 * @param {Array<{ fromAbs: string, tempAbs: string }>} phase_a_entries
 */
async function rollbackPhaseA(phase_a_entries) {
  for (let index = phase_a_entries.length - 1; index >= 0; index -= 1) {
    const entry = phase_a_entries[index];
    const old_temp_abs = entry.tempAbs;
    const restored = await bestEffortRename(old_temp_abs, entry.fromAbs);
    if (restored) {
      remapTempAbsUnderPrefix(phase_a_entries.slice(0, index), old_temp_abs, entry.fromAbs);
    }
  }
}

/**
 * On phase-B failure: reverse completed B renames, then restore remaining temps.
 * @param {Array<{ fromAbs: string, toAbs: string, tempAbs: string }>} completed_b_entries
 * @param {Array<{ fromAbs: string, toAbs: string, tempAbs: string }>} phase_a_entries
 */
async function rollbackPhaseBFailure(completed_b_entries, phase_a_entries) {
  for (let index = completed_b_entries.length - 1; index >= 0; index -= 1) {
    const entry = completed_b_entries[index];
    const old_to_abs = entry.toAbs;
    const restored = await bestEffortRename(old_to_abs, entry.tempAbs);
    if (restored) {
      remapTempAbsUnderPrefix(phase_a_entries, old_to_abs, entry.tempAbs, entry);
    }
  }
  await rollbackPhaseA(phase_a_entries);
}

async function applyRenamePlan(opts = {}) {
  resetRenameCancel();
  const all_ops = Array.isArray(opts.ops) ? opts.ops : [];
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const trash_item = typeof opts.trashItem === 'function' ? opts.trashItem : null;

  const delete_ops = all_ops.filter((op_value) => op_value.opType === 'delete');
  const rename_ops = all_ops.filter((op_value) => op_value.opType !== 'delete');

  let deleted_count = 0;
  if (delete_ops.length > 0) {
    if (!trash_item) {
      return {
        ok: false,
        renamed: 0,
        cancelled: false,
        error: 'trashItem is required for delete operations',
        undoOps: [],
      };
    }

    for (let index = 0; index < delete_ops.length; index += 1) {
      if (isCancelled()) {
        return {
          ok: false,
          renamed: deleted_count,
          cancelled: true,
          undoOps: [],
        };
      }
      const delete_op = delete_ops[index];
      try {
        await trash_item(delete_op.fromAbs);
        deleted_count += 1;
        onProgress({
          done: deleted_count,
          total: all_ops.length,
          phase: 'delete',
          currentFrom: delete_op.fromAbs,
        });
      } catch (delete_error) {
        return {
          ok: false,
          renamed: deleted_count,
          cancelled: false,
          error: String(delete_error?.message || delete_error),
          undoOps: [],
        };
      }
    }
  }

  if (rename_ops.length === 0) {
    return {
      ok: true,
      renamed: deleted_count,
      cancelled: false,
      undoOps: [],
    };
  }

  const rename_result = await applyRenameOpsOnly({
    ops: rename_ops,
    onProgress: (progress_payload) => {
      onProgress({
        ...progress_payload,
        done: deleted_count + (progress_payload.done || 0),
        total: all_ops.length,
      });
    },
  });

  return {
    ...rename_result,
    renamed: deleted_count + (rename_result.renamed || 0),
    // Delete-to-trash cannot be session-undone; only rename undoOps remain
    undoOps: rename_result.undoOps || [],
  };
}

/**
 * Two-phase rename: from → temp → to, with cancel and rollback support.
 * Phase A applies deepest paths first so parents do not invalidate child sources.
 * Phase B applies shallowest first so ancestors land before nested destinations.
 * @param {{ ops: Array<{ fromAbs: string, toAbs: string }>, onProgress?: Function }} opts
 */
async function applyRenameOpsOnly(opts = {}) {
  const rename_ops = Array.isArray(opts.ops) ? opts.ops : [];
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const total_count = rename_ops.length;

  if (total_count === 0) {
    return { ok: true, renamed: 0, cancelled: false, undoOps: [] };
  }

  const resolved_ops = resolveNestedDestinationPaths(rename_ops);
  const deepest_first_ops = [...resolved_ops].sort(
    (left, right) => getPathDepth(right.fromAbs) - getPathDepth(left.fromAbs)
  );

  const phase_a_entries = [];

  // Phase A: move each source to a unique temp name in the same parent (deepest first)
  for (let index = 0; index < deepest_first_ops.length; index += 1) {
    if (isCancelled()) {
      await rollbackPhaseA(phase_a_entries);
      onProgress({ done: index, total: total_count, phase: 'A', cancelled: true });
      return { ok: false, renamed: 0, cancelled: true, undoOps: [] };
    }

    const current_op = deepest_first_ops[index];
    const temp_abs = createTempAbs(current_op.fromAbs);
    try {
      await renamePath(current_op.fromAbs, temp_abs);
      const phase_entry = {
        fromAbs: current_op.fromAbs,
        toAbs: current_op.toAbs,
        tempAbs: temp_abs,
      };
      // Descendants already in temps moved with this ancestor — keep tempAbs valid
      remapTempAbsUnderPrefix(phase_a_entries, current_op.fromAbs, temp_abs);
      phase_a_entries.push(phase_entry);
      onProgress({
        done: index + 1,
        total: total_count,
        phase: 'A',
        currentFrom: current_op.fromAbs,
        currentTo: current_op.toAbs,
      });
    } catch (rename_error) {
      await rollbackPhaseA(phase_a_entries);
      return {
        ok: false,
        renamed: 0,
        cancelled: false,
        error: String(rename_error?.message || rename_error),
        undoOps: [],
      };
    }
  }

  const shallowest_first_entries = [...phase_a_entries].sort(
    (left, right) => getPathDepth(left.toAbs) - getPathDepth(right.toAbs)
  );
  const completed_b_entries = [];

  for (let index = 0; index < shallowest_first_entries.length; index += 1) {
    if (isCancelled()) {
      await rollbackPhaseBFailure(completed_b_entries, phase_a_entries);
      onProgress({
        done: index,
        total: total_count,
        phase: 'B',
        cancelled: true,
      });
      return { ok: false, renamed: 0, cancelled: true, undoOps: [] };
    }

    const entry = shallowest_first_entries[index];
    const old_temp_abs = entry.tempAbs;
    try {
      await renamePath(old_temp_abs, entry.toAbs);
      completed_b_entries.push(entry);
      // Nested temps that lived under this temp now live under the final path
      remapTempAbsUnderPrefix(phase_a_entries, old_temp_abs, entry.toAbs, entry);
      onProgress({
        done: index + 1,
        total: total_count,
        phase: 'B',
        currentFrom: entry.fromAbs,
        currentTo: entry.toAbs,
      });
    } catch (rename_error) {
      await rollbackPhaseBFailure(completed_b_entries, phase_a_entries);
      return {
        ok: false,
        renamed: 0,
        cancelled: false,
        error: String(rename_error?.message || rename_error),
        undoOps: [],
      };
    }
  }

  const undo_ops = phase_a_entries.map((entry) => ({
    fromAbs: entry.toAbs,
    toAbs: entry.fromAbs,
  }));

  return {
    ok: true,
    renamed: total_count,
    cancelled: false,
    undoOps: undo_ops,
  };
}

/**
 * Apply reverse rename ops (session undo). Does not produce nested undoOps.
 * @param {{ undoOps: Array<{ fromAbs: string, toAbs: string }>, onProgress?: Function }} opts
 */
async function applyUndoOps(opts = {}) {
  resetRenameCancel();
  const undo_ops = Array.isArray(opts.undoOps) ? opts.undoOps : [];
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  const apply_result = await applyRenamePlan({
    ops: undo_ops,
    onProgress,
  });

  return {
    ok: apply_result.ok,
    renamed: apply_result.renamed,
    cancelled: apply_result.cancelled,
    error: apply_result.error,
    undoOps: [],
  };
}

module.exports = {
  requestCancelRename,
  resetRenameCancel,
  applyRenamePlan,
  applyUndoOps,
  // Exported for unit testing helpers
  getPathDepth,
  rewritePathPrefix,
  resolveNestedDestinationPaths,
};
