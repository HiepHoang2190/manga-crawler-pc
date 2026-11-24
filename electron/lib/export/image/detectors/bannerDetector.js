/**
 * Detect wide ad banners / abnormal horizontal strips while whitelisting manga double spreads.
 * @param {{ width?: number, height?: number }} metadata
 * @returns {{ isBanner: boolean, aspectRatio: number, isDoubleSpread?: boolean, reasonCode?: 'aspect_ratio' | 'short_height' }}
 */
function detectBanner(metadata) {
  const { width = 0, height = 0 } = metadata || {};
  if (!width || !height || width <= 0 || height <= 0) {
    return { isBanner: false, aspectRatio: 0 };
  }

  const aspectRatio = Number((width / height).toFixed(2));

  // 1. Whitelist standard & wide manga double spreads (1.18..1.75 with normal height >= 500px)
  if (aspectRatio >= 1.18 && aspectRatio <= 1.75 && height >= 500) {
    return { isBanner: false, aspectRatio, isDoubleSpread: true };
  }

  // 2. Extreme flat ad banners (ratio >= 2.8)
  if (aspectRatio >= 2.8) {
    return {
      isBanner: true,
      aspectRatio,
      reasonCode: 'aspect_ratio',
    };
  }

  // 3. Compact wide banners (ratio >= 2.2 with short banner height <= 360px, avoiding high-res panoramic spreads)
  if (aspectRatio >= 2.2 && height <= 360) {
    return {
      isBanner: true,
      aspectRatio,
      reasonCode: 'aspect_ratio',
    };
  }

  // 4. Short wide strip images (height <= 220px and width >= 450px)
  if (height <= 220 && width >= 450) {
    return {
      isBanner: true,
      aspectRatio,
      reasonCode: 'short_height',
    };
  }

  return { isBanner: false, aspectRatio };
}

module.exports = { detectBanner };
