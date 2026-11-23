function getSortableRtt(result) {
  const rtt = Number(result?.rtt);
  return Number.isFinite(rtt) && rtt >= 0 ? rtt : null;
}

function getBrokenPriority(result) {
  if (result?.status === 'failed') return 0;
  if (result?.status === 'success') return 2;
  return 1; // untested or testing
}

export function sortConnectorsForChecker(connectors = [], results = {}, sortMode = 'default') {
  if (!Array.isArray(connectors)) return [];
  const list = [...connectors];
  if (sortMode === 'default') return list;

  if (sortMode === 'rttAsc') {
    return list.sort((a, b) => {
      const ra = getSortableRtt(results?.[a.id]);
      const rb = getSortableRtt(results?.[b.id]);
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return ra - rb;
    });
  }

  if (sortMode === 'rttDesc') {
    return list.sort((a, b) => {
      const ra = getSortableRtt(results?.[a.id]);
      const rb = getSortableRtt(results?.[b.id]);
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return rb - ra;
    });
  }

  if (sortMode === 'brokenFirst') {
    return list.sort((a, b) => {
      const pa = getBrokenPriority(results?.[a.id]);
      const pb = getBrokenPriority(results?.[b.id]);
      return pa - pb;
    });
  }

  return list;
}

export function buildHealthReportMarkdown(connectors = [], results = {}, stats = {}) {
  const total = Number.isFinite(stats?.total) ? stats.total : connectors.length;
  const working = Number.isFinite(stats?.working) ? stats.working : 0;
  const broken = Number.isFinite(stats?.broken) ? stats.broken : 0;

  const workingRtts = [];
  const brokenLines = [];

  for (const c of connectors) {
    const res = results?.[c.id];
    if (!res) continue;
    if (res.status === 'success') {
      const rtt = getSortableRtt(res);
      if (rtt !== null) workingRtts.push(rtt);
    } else if (res.status === 'failed') {
      const errText = String(res.error || 'Unknown error').replace(/\s+/g, ' ').trim();
      brokenLines.push(`- ${c.label || c.id} (${c.domain || c.id}): ${errText}`);
    }
  }

  const avgRtt =
    workingRtts.length > 0
      ? Math.round(workingRtts.reduce((sum, v) => sum + v, 0) / workingRtts.length)
      : null;

  const lines = [
    `# Site Health Report`,
    `- Working: ${working}/${total}`,
    `- Broken: ${broken}`,
  ];
  if (avgRtt !== null) {
    lines.push(`- Avg RTT (working): ${avgRtt}ms`);
  }
  if (brokenLines.length > 0) {
    lines.push('', '## Broken Connectors', ...brokenLines);
  }

  return lines.join('\n');
}
