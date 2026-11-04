const service = require('./services/truyenTuoiThoService');
const { getIconPath } = require('./iconPath');

const SITE_LABEL = 'Truyen tuoi tho';
const SITE_REFERER = 'https://truyentuoitho.com/';

function isTruyenTuoiThoCdnHost(hostname) {
  const host_text = String(hostname || '').toLowerCase();
  return host_text.includes('truyentuoitho') || host_text.includes('resourcehub.shop');
}

module.exports = {
  id: 'truyentuoitho',
  label: SITE_LABEL,
  domain: SITE_REFERER,
  hostIncludes: ['truyentuoitho'],
  icon: getIconPath('truyentuoitho'),
  imageReferer: SITE_REFERER,
  isImageCdnHost: isTruyenTuoiThoCdnHost,
  supportsApiFetch: false,
  requiresVpn: true,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, SITE_LABEL);
  },
};
