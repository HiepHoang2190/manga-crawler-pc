const { detectBanner } = require('../../../../export/image/detectors/bannerDetector');

describe('bannerDetector', () => {
  test('flags thin horizontal ad banner (ratio >= 2.8) with structured reasonCode', () => {
    const res1 = detectBanner({ width: 728, height: 90 });
    expect(res1.isBanner).toBe(true);
    expect(res1.reasonCode).toBe('aspect_ratio');

    const res2 = detectBanner({ width: 1600, height: 400 });
    expect(res2.isBanner).toBe(true);
    expect(res2.reasonCode).toBe('aspect_ratio');
  });

  test('flags compact wide banner (ratio >= 2.2 and height <= 360) and short strips', () => {
    const compact = detectBanner({ width: 800, height: 300 });
    expect(compact.isBanner).toBe(true);
    expect(compact.reasonCode).toBe('aspect_ratio');

    const shortStrip = detectBanner({ width: 800, height: 180 });
    expect(shortStrip.isBanner).toBe(true);
    expect(shortStrip.reasonCode).toBe('aspect_ratio');

    const mediumWide = detectBanner({ width: 460, height: 220 });
    expect(mediumWide.isBanner).toBe(true);
    expect(mediumWide.reasonCode).toBe('short_height');
  });

  test('does NOT flag manga double spread (1.18..1.75) or high-res panoramic spread (2400x1050)', () => {
    expect(detectBanner({ width: 1400, height: 1000 }).isBanner).toBe(false);
    expect(detectBanner({ width: 1600, height: 1100 }).isBanner).toBe(false);
    expect(detectBanner({ width: 2400, height: 1050 }).isBanner).toBe(false);
  });

  test('does NOT flag regular manga portrait page or webtoon strip', () => {
    expect(detectBanner({ width: 800, height: 1200 }).isBanner).toBe(false);
    expect(detectBanner({ width: 800, height: 2500 }).isBanner).toBe(false);
  });

  test('handles invalid inputs gracefully', () => {
    expect(detectBanner(null).isBanner).toBe(false);
    expect(detectBanner({}).isBanner).toBe(false);
    expect(detectBanner({ width: 0, height: 100 }).isBanner).toBe(false);
  });
});
