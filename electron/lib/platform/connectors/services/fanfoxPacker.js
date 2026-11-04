/**
 * Dean Edwards packer used by FanFox for the chapter guidkey and chapterfun.ashx.
 */

function readJsSingleQuotedString(source, open_index) {
  if (source[open_index] !== "'") return null;
  let value = '';
  for (let index = open_index + 1; index < source.length; index += 1) {
    const current_char = source[index];
    if (current_char === '\\') {
      const next_char = source[index + 1];
      if (next_char === undefined) return null;
      if (next_char === 'n') value += '\n';
      else if (next_char === 'r') value += '\r';
      else if (next_char === 't') value += '\t';
      else value += next_char;
      index += 1;
      continue;
    }
    if (current_char === "'") {
      return { value, end_index: index };
    }
    value += current_char;
  }
  return null;
}

function parsePackerCall(source) {
  const marker_index = source.indexOf('function(p,a,c,k,e,d)');
  if (marker_index < 0) return null;
  const call_index = source.indexOf("}('", marker_index);
  if (call_index < 0) return null;

  const packed_payload = readJsSingleQuotedString(source, call_index + 2);
  if (!packed_payload) return null;

  const header_match = source.slice(packed_payload.end_index + 1).match(/^,(\d+),(\d+),/);
  if (!header_match) return null;

  const keyword_open_index = packed_payload.end_index + 1 + header_match[0].length;
  const keyword_string = readJsSingleQuotedString(source, keyword_open_index);
  if (!keyword_string) return null;

  return {
    packed_payload: packed_payload.value,
    radix: Number(header_match[1]),
    word_count: Number(header_match[2]),
    keyword_list: keyword_string.value.split('|'),
  };
}

function encodePackerIndex(index, radix) {
  const digit = index % radix;
  const prefix = index < radix ? '' : encodePackerIndex(Math.floor(index / radix), radix);
  const encoded_digit = digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36);
  return prefix + encoded_digit;
}

function unpackDeanEdwardsPacker(source) {
  const parsed_call = parsePackerCall(String(source || ''));
  if (!parsed_call) return '';

  let unpacked_script = parsed_call.packed_payload;
  let cursor = parsed_call.word_count;
  while (cursor) {
    cursor -= 1;
    const keyword = parsed_call.keyword_list[cursor];
    if (!keyword) continue;
    const token = encodePackerIndex(cursor, parsed_call.radix);
    unpacked_script = unpacked_script.replace(new RegExp(`\\b${token}\\b`, 'g'), keyword);
  }
  return unpacked_script;
}

function extractGuidKey(chapter_html) {
  const unpacked_script = unpackDeanEdwardsPacker(chapter_html);
  if (!unpacked_script) return '';
  const quoted_chars = [...unpacked_script.matchAll(/'([0-9a-fA-F])'/g)].map((match) => match[1]);
  if (quoted_chars.length) return quoted_chars.join('');
  const direct_match = unpacked_script.match(/guidkey\s*=\s*['"]([0-9a-fA-F]+)['"]/);
  return direct_match ? direct_match[1] : '';
}

function toHttpsUrl(raw_url) {
  const trimmed_url = String(raw_url || '').trim();
  if (trimmed_url.startsWith('//')) return `https:${trimmed_url}`;
  return trimmed_url;
}

function parseInlineChapterImageUrls(chapter_html) {
  const source_text = String(chapter_html || '');
  const unpacked_script = source_text.includes('function(p,a,c,k,e,d)')
    ? unpackDeanEdwardsPacker(source_text)
    : source_text;
  if (!unpacked_script) return [];

  const array_match = unpacked_script.match(/newImgs\s*=\s*\[([\s\S]*?)\]/);
  if (!array_match) return [];

  return [...array_match[1].matchAll(/['"]([^'"]+)['"]/g)]
    .map((match) => toHttpsUrl(match[1]))
    .filter((image_url) => /\.(?:jpg|jpeg|png|webp|gif)(?:\?|$)/i.test(image_url));
}

function parseChapterFunImageUrls(packed_source) {
  const source_text = String(packed_source || '');
  const unpacked_script = source_text.includes('function(p,a,c,k,e,d)')
    ? unpackDeanEdwardsPacker(source_text)
    : source_text;
  if (!unpacked_script) return [];

  const pix_match = unpacked_script.match(/pix="([^"]+)"/);
  if (!pix_match) return [];

  const relative_urls = [
    ...unpacked_script.matchAll(/"(\/[^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)"/gi),
  ].map((match) => match[1]);

  return relative_urls.map((relative_url) => toHttpsUrl(`${pix_match[1]}${relative_url}`));
}

/**
 * chapterfun.ashx returns the current page and the next page.
 * Page numbers equal to imagecount come back empty, so an odd count
 * also requests the last valid page.
 */
function buildChapterFunPageNumbers(image_count) {
  const safe_count = Math.max(0, Math.floor(Number(image_count) || 0));
  if (safe_count <= 1) return [1];

  const page_numbers = [];
  for (let page_number = 1; page_number < safe_count; page_number += 2) {
    page_numbers.push(page_number);
  }
  const last_page_number = safe_count - 1;
  if (page_numbers[page_numbers.length - 1] !== last_page_number) {
    page_numbers.push(last_page_number);
  }
  return page_numbers;
}

module.exports = {
  unpackDeanEdwardsPacker,
  extractGuidKey,
  parseInlineChapterImageUrls,
  parseChapterFunImageUrls,
  buildChapterFunPageNumbers,
};
