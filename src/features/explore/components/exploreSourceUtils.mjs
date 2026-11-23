/**
 * Count actual selectable connector sources inside an options list,
 * excluding synthetic empty / 'all' placeholder entries.
 *
 * @param {Array<{ value?: string }>} options
 * @returns {number}
 */
export function countSourceOptions(options) {
  if (!Array.isArray(options)) return 0;
  return options.filter((opt) => {
    const val = String(opt?.value ?? '').trim();
    return val !== '' && val !== 'all';
  }).length;
}

/**
 * Build unified source dropdown options for FollowedMangaPanel, restricted
 * strictly to connectors that have at least one bookmarked manga (`siteBreakdown`).
 *
 * @param {object} params
 * @param {Array} [params.connectors]
 * @param {Array} [params.siteBreakdown]
 * @param {{ labels?: Map, icons?: Map }|null} [params.siteMap]
 * @param {string} [params.allSourcesLabel]
 * @param {(domain: string) => string} [params.extractHost]
 */
export function buildFollowedSourceOptions({
  connectors = [],
  siteBreakdown = [],
  siteMap = null,
  allSourcesLabel = '',
  extractHost = null,
} = {}) {
  const list = [
    {
      value: '',
      label: allSourcesLabel,
      icon: 'public',
    },
  ];
  const breakdown = Array.isArray(siteBreakdown) ? siteBreakdown : [];
  const followedSiteIds = new Set(breakdown.map((s) => s?.siteId).filter(Boolean));
  if (followedSiteIds.size === 0) return list;

  const seen = new Set();
  const sortedConnectors = (Array.isArray(connectors) ? connectors : [])
    .filter((c) => c && c.id && followedSiteIds.has(c.id))
    .slice()
    .sort((a, b) =>
      String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, {
        sensitivity: 'base',
      }),
    );

  for (const c of sortedConnectors) {
    seen.add(c.id);
    const name = String(c.label || c.id);
    const host = typeof extractHost === 'function' ? extractHost(c.domain) : '';
    list.push({
      value: c.id,
      label: host ? `${name} (${host})` : name,
      icon: c.icon || 'language',
    });
  }

  for (const s of breakdown) {
    if (!s?.siteId || seen.has(s.siteId)) continue;
    seen.add(s.siteId);
    const label = siteMap?.labels?.get(s.siteId) || s.siteId;
    const icon = siteMap?.icons?.get(s.siteId);
    list.push({
      value: s.siteId,
      label,
      icon: icon || 'language',
    });
  }

  return list;
}
