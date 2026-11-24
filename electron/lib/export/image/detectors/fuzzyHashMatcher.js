const { getSharp } = require('../../../shared/checkSharp');

/**
 * Compute 64-bit dHash (difference hash on 9x8 grayscale grid).
 * @param {Buffer} imageBuffer
 * @returns {Promise<string>} 64-char binary string ('0' / '1')
 */
async function computeDHash(imageBuffer) {
  const sharp = getSharp();
  if (!sharp) throw new Error('Sharp is not available');

  const { data } = await sharp(imageBuffer)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = '';
  for (let y = 0; y < 8; y += 1) {
    const rowOffset = y * 9;
    for (let x = 0; x < 8; x += 1) {
      hash += data[rowOffset + x] < data[rowOffset + x + 1] ? '1' : '0';
    }
  }
  return hash;
}

/**
 * Compute 64-bit dHash directly from a pre-decoded raw buffer by box-averaging cells to 9x8.
 * Composites alpha-channel images onto white background so alpha-drawn strokes produce accurate hashes.
 * @param {Buffer|Uint8Array} data
 * @param {{ width: number, height: number, channels: number }} info
 * @returns {string}
 */
function computeDHashFromRaw36x32(data, info) {
  if (
    !data ||
    !info ||
    !Number.isInteger(info.width) ||
    !Number.isInteger(info.height) ||
    !Number.isInteger(info.channels)
  ) {
    return '0'.repeat(64);
  }
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  if (w <= 0 || h <= 0 || ch <= 0 || data.length < w * h * ch) {
    return '0'.repeat(64);
  }

  const colorCh = ch >= 3 ? 3 : 1;
  const hasAlpha = ch === 2 || ch === 4;
  const cellW = w / 9;
  const cellH = h / 8;
  const grid = new Float64Array(72);

  for (let gy = 0; gy < 8; gy += 1) {
    const y0 = Math.floor(gy * cellH);
    const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * cellH));
    for (let gx = 0; gx < 9; gx += 1) {
      const x0 = Math.floor(gx * cellW);
      const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * cellW));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        const rowOffset = y * w;
        for (let x = x0; x < x1; x += 1) {
          const base = (rowOffset + x) * ch;
          let luma = colorCh === 3
            ? (data[base] * 77 + data[base + 1] * 150 + data[base + 2] * 29) >> 8
            : data[base];
          if (hasAlpha) {
            const alpha = data[base + ch - 1];
            luma = (luma * alpha + 255 * (255 - alpha)) / 255;
          }
          sum += luma;
          count += 1;
        }
      }
      grid[gy * 9 + gx] = count > 0 ? sum / count : 0;
    }
  }

  let hash = '';
  for (let y = 0; y < 8; y += 1) {
    const rowOffset = y * 9;
    for (let x = 0; x < 8; x += 1) {
      hash += grid[rowOffset + x] < grid[rowOffset + x + 1] ? '1' : '0';
    }
  }
  return hash;
}

function popcount32(x) {
  let n = x >>> 0;
  n -= (n >>> 1) & 0x55555555;
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/**
 * Compute Hamming distance between two 64-bit binary hash strings.
 * @param {string} hashA
 * @param {string} hashB
 * @returns {number} Bit difference count (returns 64 on invalid/mismatched inputs)
 */
function hammingDistance(hashA, hashB) {
  if (
    !hashA ||
    !hashB ||
    typeof hashA !== 'string' ||
    typeof hashB !== 'string' ||
    hashA.length !== hashB.length
  ) {
    return 64;
  }

  if (hashA.length === 64 && /^[01]{64}$/.test(hashA) && /^[01]{64}$/.test(hashB)) {
    const hi = (parseInt(hashA.slice(0, 32), 2) ^ parseInt(hashB.slice(0, 32), 2)) >>> 0;
    const lo = (parseInt(hashA.slice(32), 2) ^ parseInt(hashB.slice(32), 2)) >>> 0;
    return popcount32(hi) + popcount32(lo);
  }

  let dist = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    if (hashA[i] !== hashB[i]) dist += 1;
  }
  return dist;
}

/**
 * Check whether two hashes fall within maxDistance Hamming threshold.
 * @param {string} hashA
 * @param {string} hashB
 * @param {number} [maxDistance=4]
 * @returns {boolean}
 */
function isSimilar(hashA, hashB, maxDistance = 4) {
  if (!hashA || !hashB) return false;
  return hammingDistance(hashA, hashB) <= maxDistance;
}

/**
 * Ensure two images have compatible aspect ratios before considering them visual duplicates.
 * Missing dimensions on either item return true so test fixtures / hash-only inputs still match.
 */
function areAspectRatiosCompatible(a, b, maxRatioDiff = 0.35) {
  const wA = Number(a?.width || 0);
  const hA = Number(a?.height || 0);
  const wB = Number(b?.width || 0);
  const hB = Number(b?.height || 0);
  if (wA <= 0 || hA <= 0 || wB <= 0 || hB <= 0) return true;

  const rA = wA / hA;
  const rB = wB / hB;
  const larger = Math.max(rA, rB);
  const smaller = Math.min(rA, rB);
  return larger / smaller <= 1 + maxRatioDiff;
}

/**
 * Cluster visually similar non-blank images using exact hash collapsing + Union-Find fuzzy merge.
 * @param {Array<{ fullPath: string, hash: string, width?: number, height?: number }>} items
 * @param {{ maxDistance?: number, maxRatioDiff?: number }} [options]
 * @returns {Array<{ representative: object, items: object[], matchType: 'exact' | 'fuzzy' }>}
 */
function clusterSimilarImages(items, { maxDistance = 4, maxRatioDiff = 0.35 } = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];

  // 1. Collapse exact hash matches while keeping incompatible aspect ratios separated
  const byExactHash = new Map();
  const baseClusters = [];

  for (const item of items) {
    if (!item?.hash) continue;
    let bucketList = byExactHash.get(item.hash);
    if (!bucketList) {
      bucketList = [];
      byExactHash.set(item.hash, bucketList);
    }

    let matched = null;
    for (const sub of bucketList) {
      if (areAspectRatiosCompatible(sub.representative, item, maxRatioDiff)) {
        matched = sub;
        break;
      }
    }

    if (matched) {
      matched.items.push(item);
    } else {
      const sub = {
        hash: item.hash,
        representative: item,
        items: [item],
        hi: /^[01]{64}$/.test(item.hash) ? parseInt(item.hash.slice(0, 32), 2) >>> 0 : null,
        lo: /^[01]{64}$/.test(item.hash) ? parseInt(item.hash.slice(32), 2) >>> 0 : null,
      };
      bucketList.push(sub);
      baseClusters.push(sub);
    }
  }

  const n = baseClusters.length;
  if (n === 0) return [];

  // 2. Union-Find fuzzy merge across base clusters using Multi-Index Hashing for 64-bit hashes (Pigeonhole Principle)
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;

  const find = (x) => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    let cur = x;
    while (cur !== root) {
      const next = parent[cur];
      parent[cur] = root;
      cur = next;
    }
    return root;
  };

  const tryMergeClusters = (i, j) => {
    const rA = find(i);
    const rB = find(j);
    if (rA === rB) return;

    const repA = baseClusters[rA];
    const repB = baseClusters[rB];
    let dist;
    if (repA.hi !== null && repB.hi !== null) {
      const hiDist = popcount32(repA.hi ^ repB.hi);
      if (hiDist > maxDistance) return;
      dist = hiDist + popcount32(repA.lo ^ repB.lo);
    } else {
      dist = hammingDistance(repA.hash, repB.hash);
    }

    if (dist <= maxDistance && areAspectRatiosCompatible(repA.representative, repB.representative, maxRatioDiff)) {
      parent[rB] = rA;
    }
  };

  const all64Bit = baseClusters.every((c) => c.hi !== null);

  if (maxDistance > 0 && n > 1) {
    if (all64Bit && maxDistance <= 7) {
      // Split 64-bit hash into (maxDistance + 1) disjoint slices so any pair with dist <= maxDistance collides in >= 1 slice
      const numSlices = maxDistance + 1;
      const baseLen = Math.floor(64 / numSlices);
      const extra = 64 % numSlices;
      const sliceBounds = [];
      let pos = 0;
      for (let s = 0; s < numSlices; s += 1) {
        const len = baseLen + (s < extra ? 1 : 0);
        sliceBounds.push([pos, pos + len]);
        pos += len;
      }

      const sliceTables = Array.from({ length: numSlices }, () => new Map());
      for (let i = 0; i < n; i += 1) {
        const hash = baseClusters[i].hash;
        const candidateSet = new Set();
        for (let s = 0; s < numSlices; s += 1) {
          const [start, end] = sliceBounds[s];
          const key = hash.slice(start, end);
          const table = sliceTables[s];
          let bucket = table.get(key);
          if (bucket) {
            for (let bIdx = 0; bIdx < bucket.length; bIdx += 1) {
              candidateSet.add(bucket[bIdx]);
            }
            bucket.push(i);
          } else {
            table.set(key, [i]);
          }
        }
        for (const cand of candidateSet) {
          tryMergeClusters(cand, i);
        }
      }
    } else {
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          tryMergeClusters(i, j);
        }
      }
    }
  }

  // 3. Assemble merged clusters and tag exact vs fuzzy
  const mergedMap = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    let group = mergedMap.get(root);
    if (!group) {
      group = {
        representative: baseClusters[root].representative,
        items: [],
        hashes: new Set(),
      };
      mergedMap.set(root, group);
    }
    group.hashes.add(baseClusters[i].hash);
    for (const item of baseClusters[i].items) {
      group.items.push(item);
    }
  }

  const result = [];
  for (const group of mergedMap.values()) {
    result.push({
      representative: group.representative,
      items: group.items,
      matchType: group.hashes.size > 1 ? 'fuzzy' : 'exact',
    });
  }
  return result;
}

module.exports = {
  computeDHash,
  computeDHashFromRaw36x32,
  hammingDistance,
  isSimilar,
  areAspectRatiosCompatible,
  clusterSimilarImages,
};
