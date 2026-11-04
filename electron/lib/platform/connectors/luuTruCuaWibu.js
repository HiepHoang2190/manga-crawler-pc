const service = require('./services/luuTruCuaWibuService');
const { getIconPath } = require('./iconPath');

const LABEL = 'LuuTruCuaWibu';

module.exports = {
  id: 'luutrucuawibu',
  label: LABEL,
  domain: 'https://luutrucuawibu.blogspot.com/',
  hostIncludes: ['luutrucuawibu'],
  icon: getIconPath('luutrucuawibu'),
  supportsApiFetch: false,

  load(url) {
    return service.load(url);
  },

  downloadChapter(payload) {
    return service.downloadChapter(payload, LABEL);
  },
};
