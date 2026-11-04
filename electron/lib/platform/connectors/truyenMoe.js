/**
 * TruyenMoe connector — https://truyen.moe/
 * Same site family as MoeTruyen; this origin allows foreign VPN IPs.
 */
const service = require('./services/truyenMoeService');
const { TRUYENMOE_IMAGE_REFERER, isTruyenMoeImageCdnHost } = require('../../download/connector/connectorReferer');
const { getIconPath } = require('./iconPath');

const LABEL = 'TruyenMoe';

module.exports = {
  id: 'truyenmoe',
  label: LABEL,
  domain: 'https://truyen.moe/',
  extraDomains: ['https://www.truyen.moe/'],
  hostIncludes: ['truyen.moe'],
  icon: getIconPath('truyenmoe'),
  imageReferer: TRUYENMOE_IMAGE_REFERER,
  isImageCdnHost: isTruyenMoeImageCdnHost,
  supportsApiFetch: false,
  supportsBulkScan: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
