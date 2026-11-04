const fs = require('fs');
const path = require('path');
const { namesEqual, pathsEqual, normalizeKey, displayNamesDiffer } = require('./pathCompare');
const { planAutoNormalize } = require('./autoNormalize');
const {
  planFindReplace,
  planSequenceNumbers,
  planInsertRemove,
  planChangeCase,
  planRegexReplace,
  planTruncate,
  planExtension,
  planDeleteDsStore,
} = require('./categories');

const CATEGORY_PLANNERS = {
  autoNormalize: ({ entries, params }) => planAutoNormalize({
    entries,
    find: params.find || '',
    replace: params.replace || '',
  }),
  findReplace: ({ entries, action, params }) => planFindReplace({ entries, action, params }),
  sequenceNumbers: ({ entries, params }) => planSequenceNumbers({ entries, params }),
  insertRemove: ({ entries, action, params }) => planInsertRemove({ entries, action, params }),
  changeCase: ({ entries, action }) => planChangeCase({ entries, action }),
  regex: ({ entries, params }) => planRegexReplace({ entries, params }),
  truncate: ({ entries, action, params }) => planTruncate({ entries, action, params }),
  extension: ({ entries, action, params }) => planExtension({ entries, action, params }),
  cleanup: ({ entries }) => planDeleteDsStore({ entries }),
};

function buildRenamePlan({
  entries = [],
  category,
  action,
  params = {},
  existsSync = fs.existsSync,
} = {}) {
  const planner_fn = CATEGORY_PLANNERS[category];
  if (!planner_fn) {
    return {
      ok: false,
      ops: [],
      unchangedCount: 0,
      blocked: [],
      error: `Unknown rename category: ${category}`,
    };
  }

  // .DS_Store is only actionable in cleanup; exclude it from every other category.
  const working_entries = category === 'cleanup'
    ? entries
    : entries.filter((entry_value) => entry_value.name !== '.DS_Store');

  let planned_ops;
  try {
    planned_ops = planner_fn({ entries: working_entries, action, params }) || [];
  } catch (err) {
    return {
      ok: false,
      ops: [],
      unchangedCount: 0,
      blocked: [],
      error: err.message || String(err),
    };
  }

  // Planners already drop no-ops; keep only ops whose display name actually changes.
  // Use displayNamesDiffer (not namesEqual) so case-only renames stay on case-insensitive FS.
  // Delete ops keep from===to intentionally — filter by opType instead.
  const changed_ops = planned_ops.filter((op_value) => {
    if (op_value.opType === 'delete') return true;
    return displayNamesDiffer(
      path.basename(op_value.fromRel),
      path.basename(op_value.toRel)
    );
  });

  const source_abs_set = new Set(changed_ops.map((op_value) => op_value.fromAbs));
  const moving_abs_set = new Set(changed_ops.map((op_value) => op_value.fromAbs));

  const staying_names_by_parent = new Map();
  for (const entry_value of working_entries) {
    if (moving_abs_set.has(entry_value.absPath)) continue;
    const parent_key = entry_value.parentRel || '';
    const sibling_names = staying_names_by_parent.get(parent_key) || [];
    sibling_names.push(entry_value.name);
    staying_names_by_parent.set(parent_key, sibling_names);
  }

  const target_counts = new Map();
  for (const op_value of changed_ops) {
    const collision_key = buildCollisionKey(op_value);
    target_counts.set(collision_key, (target_counts.get(collision_key) || 0) + 1);
  }

  const safe_ops = [];
  const blocked_ops = [];

  for (const op_value of changed_ops) {
    if (op_value.opType === 'delete') {
      safe_ops.push(op_value);
      continue;
    }

    const parent_key = parentKeyFromOp(op_value);
    const target_name = path.basename(op_value.toRel);
    const collision_key = buildCollisionKey(op_value);
    let block_reason = null;

    if ((target_counts.get(collision_key) || 0) > 1) {
      block_reason = 'duplicate target';
    } else if (hasStayingNameConflict(staying_names_by_parent.get(parent_key) || [], target_name)) {
      block_reason = 'target name occupied';
    } else if (
      existsSync(op_value.toAbs)
      && !isPlanSourcePath(op_value.toAbs, source_abs_set)
    ) {
      block_reason = 'target exists on disk';
    }

    if (block_reason) {
      blocked_ops.push({ fromRel: op_value.fromRel, reason: block_reason });
    } else {
      safe_ops.push(op_value);
    }
  }

  const unchanged_ops = [];
  for (const entry_value of working_entries) {
    if (moving_abs_set.has(entry_value.absPath)) continue;
    unchanged_ops.push({
      fromAbs: entry_value.absPath,
      toAbs: entry_value.absPath,
      fromRel: entry_value.relPath,
      toRel: entry_value.relPath,
      kind: entry_value.kind,
      opType: 'unchanged',
    });
  }

  return {
    ok: true,
    ops: safe_ops,
    unchangedCount: unchanged_ops.length,
    unchanged: unchanged_ops,
    blocked: blocked_ops,
    totalCount: working_entries.length,
  };
}

function parentKeyFromOp(op_value) {
  const parent_dir = path.dirname(op_value.fromRel);
  return !parent_dir || parent_dir === '.' ? '' : parent_dir;
}

function buildCollisionKey(op_value) {
  const parent_key = parentKeyFromOp(op_value);
  const target_name = path.basename(op_value.toRel);
  // Case/NFC folding for collision keys follows namesEqual via normalize through a sentinel pair.
  // Store parent + folded target by comparing against known keys when counting.
  return `${parent_key}\0${normalizeKey(target_name)}`;
}

function hasStayingNameConflict(staying_names, target_name) {
  return staying_names.some((staying_name) => namesEqual(staying_name, target_name));
}

function isPlanSourcePath(check_abs, source_abs_set) {
  if (source_abs_set.has(check_abs)) return true;
  for (const source_abs of source_abs_set) {
    if (pathsEqual(source_abs, check_abs)) return true;
  }
  return false;
}

module.exports = {
  buildRenamePlan,
};
