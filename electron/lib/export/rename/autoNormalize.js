const path = require('path');

function planAutoNormalize({ entries = [], find = '', replace = '' } = {}) {
  const parent_groups = new Map();
  const state_list = entries.map((entry_value) => buildEntryState(entry_value, find, replace));

  for (const entry_state of state_list) {
    const group_key = entry_state.entry.parentRel || '';
    const sibling_group = parent_groups.get(group_key) || [];
    sibling_group.push(entry_state);
    parent_groups.set(group_key, sibling_group);
  }

  for (const sibling_group of parent_groups.values()) {
    normalizeSiblingGroup(sibling_group);
  }

  return state_list
    .filter((entry_state) => entry_state.final_name !== entry_state.entry.name)
    .map((entry_state) => {
      const parent_path = entry_state.entry.parentRel || '';
      const target_rel = parent_path ? path.join(parent_path, entry_state.final_name) : entry_state.final_name;
      return {
        fromAbs: entry_state.entry.absPath,
        toAbs: path.join(path.dirname(entry_state.entry.absPath), entry_state.final_name),
        fromRel: entry_state.entry.relPath,
        toRel: target_rel,
        kind: entry_state.entry.kind,
      };
    });
}

function buildEntryState(entry_value, find_value, replace_value) {
  const original_base = entry_value.kind === 'file'
    ? entry_value.name.slice(0, entry_value.name.length - entry_value.ext.length)
    : entry_value.name;
  const working_base = applyFindReplace(original_base, find_value, replace_value);

  return {
    entry: entry_value,
    working_base,
    final_base: working_base,
    final_name: entry_value.kind === 'file' ? `${working_base}${entry_value.ext}` : working_base,
    parsed_token: parseToken(working_base),
  };
}

function applyFindReplace(input_value, find_value, replace_value) {
  if (!find_value) return String(input_value);
  return String(input_value).split(String(find_value)).join(String(replace_value ?? ''));
}

function parseToken(base_value) {
  const volume_match = /^(Vol\s+)(\d+)(\s*\()(\d+)(\))$/.exec(base_value);
  if (volume_match) {
    return {
      pattern_kind: 'volParen',
      group_key: `${volume_match[1]}::${volume_match[2]}`,
      prefix_text: volume_match[1],
      volume_digits: volume_match[2],
      paren_open: volume_match[3],
      paren_digits: volume_match[4],
      paren_close: volume_match[5],
    };
  }

  const chapter_match = /^(.*?)(\d+)(?:\.(\d+))?$/.exec(base_value);
  if (!chapter_match) return null;

  const prefix_text = chapter_match[1];
  return {
    pattern_kind: prefix_text ? 'chapterLike' : 'bareNumber',
    group_key: prefix_text,
    prefix_text,
    integer_digits: chapter_match[2],
    integer_value: Number(chapter_match[2]),
    fraction_digits: chapter_match[3] ?? null,
  };
}

function normalizeSiblingGroup(sibling_group) {
  const chapter_groups = new Map();
  const volume_groups = new Map();

  for (const entry_state of sibling_group) {
    if (!entry_state.parsed_token) continue;

    if (entry_state.parsed_token.pattern_kind === 'volParen') {
      const group_key = entry_state.parsed_token.group_key;
      const family_group = volume_groups.get(group_key) || [];
      family_group.push(entry_state);
      volume_groups.set(group_key, family_group);
      continue;
    }

    const group_key = entry_state.parsed_token.group_key;
    const family_group = chapter_groups.get(group_key) || [];
    family_group.push(entry_state);
    chapter_groups.set(group_key, family_group);
  }

  for (const family_group of chapter_groups.values()) {
    normalizeChapterFamily(family_group);
  }

  for (const family_group of volume_groups.values()) {
    normalizeVolumeFamily(family_group);
  }
}

function normalizeChapterFamily(family_group) {
  const integer_width = family_group.reduce((width_value, entry_state) => {
    return Math.max(width_value, entry_state.parsed_token.integer_digits.length);
  }, 0);
  const integer_groups = new Map();

  for (const entry_state of family_group) {
    const integer_key = String(entry_state.parsed_token.integer_value);
    const bucket_group = integer_groups.get(integer_key) || [];
    bucket_group.push(entry_state);
    integer_groups.set(integer_key, bucket_group);
  }

  for (const bucket_group of integer_groups.values()) {
    assignChapterTargets(bucket_group, integer_width);
  }
}

function assignChapterTargets(bucket_group, integer_width) {
  const used_fraction = new Set();
  let integer_entry = null;
  let zero_entry = null;

  for (const entry_state of bucket_group) {
    const fraction_digits = entry_state.parsed_token.fraction_digits;
    if (fraction_digits == null) {
      integer_entry = entry_state;
      continue;
    }
    used_fraction.add(fraction_digits);
    if (fraction_digits === '0' && !zero_entry) {
      zero_entry = entry_state;
    }
  }

  if (zero_entry && integer_entry) {
    const move_fraction = allocateFraction(used_fraction, buildMoveCandidates());
    used_fraction.delete('0');
    used_fraction.add(move_fraction);
    zero_entry.final_base = formatChapterBase(zero_entry.parsed_token, integer_width, move_fraction);

    const integer_fraction = allocateFraction(used_fraction, buildIntegerCandidates());
    used_fraction.add(integer_fraction);
    integer_entry.final_base = formatChapterBase(integer_entry.parsed_token, integer_width, integer_fraction);
  } else if (integer_entry && hasNonZeroFraction(used_fraction)) {
    integer_entry.final_base = formatChapterBase(integer_entry.parsed_token, integer_width, '0');
  } else if (integer_entry) {
    integer_entry.final_base = formatChapterBase(integer_entry.parsed_token, integer_width, null);
  }

  for (const entry_state of bucket_group) {
    const fraction_digits = entry_state.parsed_token.fraction_digits;
    if (entry_state === integer_entry) continue;
    if (entry_state === zero_entry && integer_entry) continue;
    entry_state.final_base = formatChapterBase(entry_state.parsed_token, integer_width, fraction_digits);
  }

  if (zero_entry && zero_entry !== integer_entry) {
    zero_entry.final_name = attachExtension(zero_entry);
  }
  if (integer_entry) {
    integer_entry.final_name = attachExtension(integer_entry);
  }

  for (const entry_state of bucket_group) {
    if (entry_state === integer_entry) continue;
    if (entry_state === zero_entry && integer_entry) continue;
    entry_state.final_name = attachExtension(entry_state);
  }
}

function hasNonZeroFraction(used_fraction) {
  for (const fraction_value of used_fraction) {
    if (fraction_value !== '0') return true;
  }
  return false;
}

function normalizeVolumeFamily(family_group) {
  const paren_width = family_group.reduce((width_value, entry_state) => {
    return Math.max(width_value, entry_state.parsed_token.paren_digits.length);
  }, 0);

  for (const entry_state of family_group) {
    const parsed_token = entry_state.parsed_token;
    const padded_paren = parsed_token.paren_digits.padStart(paren_width, '0');
    entry_state.final_base = `${parsed_token.prefix_text}${parsed_token.volume_digits}${parsed_token.paren_open}${padded_paren}${parsed_token.paren_close}`;
    entry_state.final_name = attachExtension(entry_state);
  }
}

function formatChapterBase(parsed_token, integer_width, fraction_digits) {
  const padded_integer = padInteger(parsed_token.integer_value, integer_width);
  if (fraction_digits == null) {
    return `${parsed_token.prefix_text}${padded_integer}`;
  }
  return `${parsed_token.prefix_text}${padded_integer}.${fraction_digits}`;
}

function padInteger(integer_value, width_value) {
  return String(integer_value).padStart(width_value, '0');
}

function attachExtension(entry_state) {
  return entry_state.entry.kind === 'file'
    ? `${entry_state.final_base}${entry_state.entry.ext}`
    : entry_state.final_base;
}

function allocateFraction(used_fraction, candidate_list) {
  for (const fraction_value of candidate_list) {
    if (!used_fraction.has(fraction_value)) {
      return fraction_value;
    }
  }
  for (let index_value = 10; index_value <= 9999; index_value += 1) {
    const fraction_value = String(index_value);
    if (!used_fraction.has(fraction_value)) {
      return fraction_value;
    }
  }
  throw new Error('Unable to allocate unique fraction digit');
}

function buildMoveCandidates() {
  const candidate_list = ['5', '6', '7', '8', '9', '4', '3', '2', '1'];
  for (let leading_index = 5; leading_index <= 9; leading_index += 1) {
    for (let trailing_index = 1; trailing_index <= 9; trailing_index += 1) {
      candidate_list.push(`${leading_index}${trailing_index}`);
    }
  }
  for (let leading_index = 4; leading_index >= 0; leading_index -= 1) {
    for (let trailing_index = 9; trailing_index >= 1; trailing_index -= 1) {
      candidate_list.push(`${leading_index}${trailing_index}`);
    }
  }
  return candidate_list;
}

function buildIntegerCandidates() {
  const candidate_list = ['1', '2', '3', '4'];
  for (let leading_index = 1; leading_index <= 4; leading_index += 1) {
    for (let trailing_index = 1; trailing_index <= 9; trailing_index += 1) {
      candidate_list.push(`${leading_index}${trailing_index}`);
    }
  }
  return candidate_list;
}

module.exports = {
  planAutoNormalize,
  applyFindReplace,
  parseToken,
  padInteger,
};
