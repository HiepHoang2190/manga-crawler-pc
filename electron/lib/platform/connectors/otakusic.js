const service = require('./services/otakusicService');
const { OTAKUSIC_IMAGE_REFERER, isOtakusicImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'Otakusic';

module.exports = {
  id: 'otakusic',
  label: LABEL,
  requiresCookie: true,
  domain: 'https://otakusic.com/',
  icon: getIconPath('otakusic'),
  imageReferer: OTAKUSIC_IMAGE_REFERER,
  isImageCdnHost: isOtakusicImageCdnHost,
  supportsApiFetch: true,
  hasLockedChapters: true,

  async testConnection() {
    const res = await service.load('https://otakusic.com/chi-tiet/mua-he-bi-nuot-chung-boi-bong-toi');
    if (res && res.ok) {
      return { ok: true };
    }
    throw new Error(res.error || 'Failed to load test manga');
  },

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
