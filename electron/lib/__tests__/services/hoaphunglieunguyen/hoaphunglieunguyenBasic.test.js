const { describe, test, expect } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const { getIconPath } = require('../../../platform/connectors/iconPath');
const hoaphunglieunguyen = require('../../../platform/connectors/hoaphunglieunguyen');
const {
  HoaphunglieunguyenService,
  service,
  DOMAIN,
  LABEL,
  SITE_ID,
} = require('../../../platform/connectors/services/hoaphunglieunguyenService');

describe('Hoaphunglieunguyen Basic & Icon Tests', () => {
  test('iconPath should resolve hoaphunglieunguyen icon', () => {
    const iconRelPath = getIconPath('hoaphunglieunguyen');
    expect(iconRelPath).toBe('data/site-icons/hoaphunglieunguyen.png');

    const fullPath = path.resolve(__dirname, '../../../../../public', iconRelPath);
    expect(fs.existsSync(fullPath)).toBe(true);
    expect(fs.statSync(fullPath).size).toBeGreaterThan(0);
  });

  describe('Module Structure & Constants', () => {
    test('should export required constants', () => {
      expect(DOMAIN).toBe('https://hoaphunglieunguyen.com/');
      expect(LABEL).toBe('Hỏa Phụng Liêu Nguyên');
      expect(SITE_ID).toBe('hoaphunglieunguyen');
    });

    test('should export connector entry with required fields', () => {
      expect(hoaphunglieunguyen.id).toBe('hoaphunglieunguyen');
      expect(hoaphunglieunguyen.label).toBe('Hỏa Phụng Liêu Nguyên');
      expect(hoaphunglieunguyen.domain).toBe('https://hoaphunglieunguyen.com/');
      expect(hoaphunglieunguyen.imageReferer).toBe('https://hoaphunglieunguyen.com/');
      expect(hoaphunglieunguyen.supportsApiFetch).toBe(false);
      expect(hoaphunglieunguyen.requiresCookie).toBe(false);
      expect(typeof hoaphunglieunguyen.load).toBe('function');
      expect(typeof hoaphunglieunguyen.downloadChapter).toBe('function');
    });
  });

  describe('Input Validation', () => {
    test('load() should return error for empty or invalid URL', async () => {
      const resEmpty = await hoaphunglieunguyen.load('');
      expect(resEmpty.ok).toBe(false);
      expect(resEmpty.error).toBeDefined();

      const resNull = await hoaphunglieunguyen.load(null);
      expect(resNull.ok).toBe(false);

      const resWhitespace = await hoaphunglieunguyen.load('   ');
      expect(resWhitespace.ok).toBe(false);
    });
  });
});
