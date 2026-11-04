// src/features/tools-studio/image-pipeline/actionTypes.js
export const ACTION_TYPES = {
  crop: {
    type: 'crop',
    icon: 'crop',
    labelKey: 'imagePipeline.action.crop',
    descKey: 'imagePipeline.action.cropDesc',
    defaults: {
      cropMode: 'autoTrim',
      pageScope: 'all',
      sampleMode: 'corner',
      sampleCorner: 'topLeft',
      specificColorType: 'black',
      customColorHex: '#000000',
      tolerance: 10,
      edges: { top: true, bottom: true, left: true, right: true },
      margins: { top: 0, bottom: 40, left: 0, right: 0 },
      marginUnit: 'px',
      dpi: 300,
      box: { left: 0, top: 0, width: 800, height: 1200 },
    },
  },
  desaturate: {
    type: 'desaturate',
    icon: 'tonality',
    labelKey: 'imagePipeline.action.desaturate',
    descKey: 'imagePipeline.action.desaturateDesc',
    defaults: { method: 'luminosity', intensity: 100 },
  },
  deskew: {
    type: 'deskew',
    icon: 'straighten',
    labelKey: 'imagePipeline.action.deskew',
    descKey: 'imagePipeline.action.deskewDesc',
    defaults: { cropMode: 'autoCrop', minAngle: 0.1 },
  },
  splitPage: {
    type: 'splitPage',
    icon: 'vertical_split',
    labelKey: 'imagePipeline.action.splitPage',
    descKey: 'imagePipeline.action.splitPageDesc',
    defaults: { minWidth: 1200, ratioThreshold: 1.15, readingDirection: 'ltr' },
  },
};

export const ACTION_TYPE_ORDER = ['crop', 'desaturate', 'deskew', 'splitPage'];

let sequence = 0;

export function generateId(prefix = 'act') {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

export function createAction(type, params = {}) {
  const def = ACTION_TYPES[type];
  if (!def) throw new Error(`Unknown action type: ${type}`);
  return {
    id: generateId('act'),
    type,
    enabled: true,
    collapsed: true,
    params: structuredClone({ ...def.defaults, ...params }),
  };
}
