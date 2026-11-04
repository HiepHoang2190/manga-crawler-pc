/**
 * Merge Cookie request-header strings (Settings paste + session cookies).
 */

/**
 * Merge two cookie header strings by name — later `extra` wins on duplicate names.
 */
function mergeCookieHeaders(base, extra) {
  const header_a = String(base || '').trim();
  const header_b = String(extra || '').trim();
  if (!header_a) return header_b;
  if (!header_b) return header_a;

  const cookie_map = new Map();
  for (const part of header_a.split(/;\s*/)) {
    const eq_index = part.indexOf('=');
    if (eq_index > 0) cookie_map.set(part.slice(0, eq_index).trim(), part.slice(eq_index + 1).trim());
  }
  for (const part of header_b.split(/;\s*/)) {
    const eq_index = part.indexOf('=');
    if (eq_index > 0) cookie_map.set(part.slice(0, eq_index).trim(), part.slice(eq_index + 1).trim());
  }
  return [...cookie_map.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

module.exports = {
  mergeCookieHeaders,
};
