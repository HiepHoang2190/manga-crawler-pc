const service = require('./services/dtveBookService');
const { DTVEBOOK_IMAGE_REFERER } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');
const cookieManager = require('../cookies/cookieManager');

const LABEL = 'DTV Ebook';

module.exports = {
  id: 'dtvebook',
  label: LABEL,
  requiresCookie: true,
  domain: 'https://dtv-ebook.com.vn/',
  icon: getIconPath('dtvebook'),
  imageReferer: DTVEBOOK_IMAGE_REFERER,
  supportsApiFetch: false,

  async testConnection(activeDomain) {
    const cookie = cookieManager.getEffectiveCookie('dtvebook');
    const domain = activeDomain || this.domain;
    const testUrl = new URL('/than-dong-kiem-si_26874.html', domain).href;
    const res = await service.load(testUrl, { cookie });
    if (res && res.ok) {
      return { ok: true };
    }
    throw new Error(res?.error || 'Không tải được trang sách thử nghiệm.');
  },

  load(url, options) {
    return service.load(url, options);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};

