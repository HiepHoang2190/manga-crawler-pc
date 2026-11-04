const service = require('./services/tuThienBaoService');
const { getIconPath } = require('./iconPath');

const LABEL = 'TuThienBao';

module.exports = {
  id: 'tuthienbao',
  label: LABEL,
  domain: 'http://tuthienbao.com/',
  extraDomains: ['https://tuthienbao.com/'],
  icon: getIconPath('tuthienbao'),
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
