export const LEGACY_PIPELINE_TAB_IDS = ['crop', 'deskew', 'splitPage', 'imageConvert', 'compress'];
export const TOOLS_TAB_IDS = ['duplicates', 'rename', 'imagePipeline', 'upscale'];

export function resolveInitialToolsTab(saved) {
  if (LEGACY_PIPELINE_TAB_IDS.includes(saved)) return 'imagePipeline';
  return TOOLS_TAB_IDS.includes(saved) ? saved : 'duplicates';
}
