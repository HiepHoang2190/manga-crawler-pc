const { isSimilar, areAspectRatiosCompatible } = require('./fuzzyHashMatcher');

/**
 * Check if a 0-indexed page is near the start (first 2) or end (last 2) of a chapter.
 * @param {number} index
 * @param {number} totalPages
 * @returns {boolean}
 */
function isEdgePage(index, totalPages) {
  if (!totalPages || totalPages <= 0) return true;
  if (totalPages <= 3) return true;
  return index <= 1 || index >= totalPages - 2;
}

/**
 * Detect recurring edge credit/recruit/outro pages across >= 2 distinct chapters.
 * Skips blank pages and enforces aspect ratio compatibility.
 * @param {Array<{ id: string, images: Array<{ fullPath: string, hash: string, index: number, totalPages: number, width?: number, height?: number, isBlank?: boolean }> }>} buckets
 * @returns {Set<string>}
 */
function detectEdgeCreditPages(buckets) {
  const creditPaths = new Set();
  if (!Array.isArray(buckets) || buckets.length < 2) return creditPaths;

  const edgeImages = [];
  for (const bucket of buckets) {
    for (const img of bucket.images || []) {
      if (img.isBlank || !img.hash) continue;
      if (isEdgePage(img.index, img.totalPages)) {
        edgeImages.push({ ...img, bucketId: bucket.id });
      }
    }
  }

  const clusters = [];
  for (const item of edgeImages) {
    let matchedCluster = null;
    for (const cluster of clusters) {
      if (
        isSimilar(item.hash, cluster.representativeHash, 4) &&
        areAspectRatiosCompatible(item, cluster.representativeItem, 0.35)
      ) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.items.push(item);
      matchedCluster.bucketIds.add(item.bucketId);
    } else {
      clusters.push({
        representativeHash: item.hash,
        representativeItem: item,
        items: [item],
        bucketIds: new Set([item.bucketId]),
      });
    }
  }

  for (const cluster of clusters) {
    if (cluster.bucketIds.size >= 2) {
      for (const item of cluster.items) {
        creditPaths.add(item.fullPath);
      }
    }
  }

  return creditPaths;
}

module.exports = {
  isEdgePage,
  detectEdgeCreditPages,
};
