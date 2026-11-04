const path = require('path');

function planFindReplace({ entries = [], action = 'literal', params = {} } = {}) {
  const { find = '', replace = '', caseSensitive = true } = params;
  if (!find) return [];

  if (action === 'regex') {
    const regex_flags = caseSensitive ? 'g' : 'gi';
    const find_regex = new RegExp(find, regex_flags);
    return mapChangedOps(entries, (entry_value) => transformBasename(entry_value, (base_name) => base_name.replace(find_regex, replace)));
  }

  return mapChangedOps(entries, (entry_value) => transformBasename(entry_value, (base_name) => {
    if (caseSensitive) {
      return base_name.split(find).join(replace);
    }
    return replaceLiteralInsensitive(base_name, find, replace);
  }));
}

function planSequenceNumbers({ entries = [], params = {} } = {}) {
  const {
    prefix = '',
    suffix = '',
    start = 1,
    step = 1,
    padding = 1,
    sortEachFolderSeparately = true,
    sortFirst = 'nameAsc',
    sortThen = 'nameAsc',
  } = params;

  const pad_width = Math.max(1, Number(padding) || 1);
  const start_value = Number(start);
  const step_value = Number(step);
  const ordered_groups = sortEachFolderSeparately
    ? groupByParent(entries)
    : [[...entries]];

  const rename_ops = [];
  for (const group_entries of ordered_groups) {
    const sorted_entries = sortEntries(group_entries, sortFirst, sortThen);
    let sequence_value = Number.isFinite(start_value) ? start_value : 1;
    for (const entry_value of sorted_entries) {
      const padded_number = String(sequence_value).padStart(pad_width, '0');
      const next_base = `${prefix}${padded_number}${suffix}`;
      const next_name = entry_value.kind === 'file' ? `${next_base}${entry_value.ext}` : next_base;
      const rename_op = buildOpIfChanged(entry_value, next_name);
      if (rename_op) rename_ops.push(rename_op);
      sequence_value += Number.isFinite(step_value) ? step_value : 1;
    }
  }
  return rename_ops;
}

function planInsertRemove({ entries = [], action = 'insert', params = {} } = {}) {
  if (action === 'remove') {
    const start_index = Math.max(0, Number(params.startIndex) || 0);
    const remove_length = Math.max(0, Number(params.length) || 0);
    return mapChangedOps(entries, (entry_value) => transformBasename(entry_value, (base_name) => {
      if (remove_length === 0) return base_name;
      return base_name.slice(0, start_index) + base_name.slice(start_index + remove_length);
    }));
  }

  const insert_text = String(params.text ?? '');
  const insert_position = params.position || 'start';
  return mapChangedOps(entries, (entry_value) => transformBasename(entry_value, (base_name) => {
    if (insert_position === 'end') return `${base_name}${insert_text}`;
    if (insert_position === 'index') {
      const insert_index = Math.max(0, Math.min(base_name.length, Number(params.index) || 0));
      return `${base_name.slice(0, insert_index)}${insert_text}${base_name.slice(insert_index)}`;
    }
    return `${insert_text}${base_name}`;
  }));
}

function planChangeCase({ entries = [], action = 'lower' } = {}) {
  return mapChangedOps(entries, (entry_value) => transformBasename(entry_value, (base_name) => {
    if (action === 'upper') return base_name.toUpperCase();
    if (action === 'title') return toTitleCase(base_name);
    return base_name.toLowerCase();
  }));
}

function planRegexReplace({ entries = [], params = {} } = {}) {
  const { pattern = '', replacement = '', caseInsensitive = false } = params;
  const regex_flags = caseInsensitive ? 'gi' : 'g';
  const replace_regex = new RegExp(pattern, regex_flags);
  return mapChangedOps(entries, (entry_value) => transformBasename(entry_value, (base_name) => base_name.replace(replace_regex, replacement)));
}

function planTruncate({ entries = [], action = 'fromEnd', params = {} } = {}) {
  const max_length = Math.max(0, Number(params.maxLength) || 0);
  return mapChangedOps(entries, (entry_value) => transformBasename(entry_value, (base_name) => {
    if (base_name.length <= max_length) return base_name;
    if (action === 'fromStart') return base_name.slice(base_name.length - max_length);
    return base_name.slice(0, max_length);
  }));
}

function planExtension({ entries = [], action = 'set', params = {} } = {}) {
  const normalized_ext = normalizeExtension(params.extension);
  const rename_ops = [];

  for (const entry_value of entries) {
    if (entry_value.kind !== 'file') continue;

    const base_name = stripExtension(entry_value.name, entry_value.ext);
    let next_name = entry_value.name;

    if (action === 'remove') {
      next_name = base_name;
    } else if (action === 'addIfMissing') {
      if (!entry_value.ext) next_name = `${base_name}${normalized_ext}`;
    } else {
      next_name = `${base_name}${normalized_ext}`;
    }

    const rename_op = buildOpIfChanged(entry_value, next_name);
    if (rename_op) rename_ops.push(rename_op);
  }

  return rename_ops;
}

function planDeleteDsStore({ entries = [] } = {}) {
  const delete_ops = [];
  for (const entry_value of entries) {
    if (entry_value.kind !== 'file') continue;
    if (entry_value.name !== '.DS_Store') continue;
    delete_ops.push({
      fromAbs: entry_value.absPath,
      toAbs: entry_value.absPath,
      fromRel: entry_value.relPath,
      toRel: entry_value.relPath,
      kind: 'file',
      opType: 'delete',
    });
  }
  return delete_ops;
}

function mapChangedOps(entries, transform_fn) {
  const rename_ops = [];
  for (const entry_value of entries) {
    const next_name = transform_fn(entry_value);
    const rename_op = buildOpIfChanged(entry_value, next_name);
    if (rename_op) rename_ops.push(rename_op);
  }
  return rename_ops;
}

function transformBasename(entry_value, mutate_fn) {
  if (entry_value.kind === 'file') {
    const base_name = stripExtension(entry_value.name, entry_value.ext);
    return `${mutate_fn(base_name)}${entry_value.ext}`;
  }
  return mutate_fn(entry_value.name);
}

function buildOpIfChanged(entry_value, next_name) {
  if (next_name === entry_value.name) return null;
  const parent_path = entry_value.parentRel || '';
  const target_rel = parent_path ? path.join(parent_path, next_name) : next_name;
  return {
    fromAbs: entry_value.absPath,
    toAbs: path.join(path.dirname(entry_value.absPath), next_name),
    fromRel: entry_value.relPath,
    toRel: target_rel,
    kind: entry_value.kind,
  };
}

function stripExtension(name_value, ext_value) {
  if (!ext_value) return name_value;
  return name_value.slice(0, name_value.length - ext_value.length);
}

function normalizeExtension(extension_value) {
  const raw_ext = String(extension_value ?? '').trim();
  if (!raw_ext) return '';
  return raw_ext.startsWith('.') ? raw_ext : `.${raw_ext}`;
}

function replaceLiteralInsensitive(input_value, find_value, replace_value) {
  const escaped_find = escapeRegExp(find_value);
  return input_value.replace(new RegExp(escaped_find, 'gi'), replace_value);
}

function escapeRegExp(input_value) {
  return String(input_value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toTitleCase(input_value) {
  return String(input_value).replace(/\S+/g, (word_value) => {
    if (!word_value) return word_value;
    return word_value.charAt(0).toUpperCase() + word_value.slice(1).toLowerCase();
  });
}

function groupByParent(entries) {
  const parent_groups = new Map();
  for (const entry_value of entries) {
    const group_key = entry_value.parentRel || '';
    const sibling_group = parent_groups.get(group_key) || [];
    sibling_group.push(entry_value);
    parent_groups.set(group_key, sibling_group);
  }
  return [...parent_groups.values()];
}

function sortEntries(entries, sort_first, sort_then) {
  return [...entries].sort((left_entry, right_entry) => {
    const first_compare = compareBySortKey(left_entry, right_entry, sort_first);
    if (first_compare !== 0) return first_compare;
    return compareBySortKey(left_entry, right_entry, sort_then);
  });
}

function compareBySortKey(left_entry, right_entry, sort_key) {
  if (sort_key === 'nameSeqAsc') {
    const left_seq = extractFirstNumber(left_entry.name);
    const right_seq = extractFirstNumber(right_entry.name);
    if (left_seq !== right_seq) return left_seq - right_seq;
    return left_entry.name.localeCompare(right_entry.name);
  }
  return left_entry.name.localeCompare(right_entry.name);
}

function extractFirstNumber(name_value) {
  const number_match = String(name_value).match(/(\d+)/);
  if (!number_match) return Number.POSITIVE_INFINITY;
  return Number(number_match[1]);
}

module.exports = {
  planFindReplace,
  planSequenceNumbers,
  planInsertRemove,
  planChangeCase,
  planRegexReplace,
  planTruncate,
  planExtension,
  planDeleteDsStore,
};
