const service = require('./services/truyenTranhPhapBiService');
const { getIconPath } = require('./iconPath');

const LABEL = 'Truyện Tranh Pháp Bỉ';

module.exports = {
  id: 'truyentranhphapbi',
  label: LABEL,
  domain: 'https://www.truyentranhphapbi.com/',
  hostIncludes: ['truyentranhphapbi'],
  icon: getIconPath('truyentranhphapbi'),
  imageReferer: 'https://www.truyentranhphapbi.com/',
  suggestsVpn: true,
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
