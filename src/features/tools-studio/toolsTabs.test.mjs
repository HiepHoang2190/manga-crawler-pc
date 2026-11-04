import { resolveInitialToolsTab, TOOLS_TAB_IDS } from './toolsTabs.js';

test('legacy pipeline tabs map to imagePipeline; unknown falls back', () => {
  for (const id of ['crop', 'deskew', 'splitPage', 'imageConvert', 'compress']) expect(resolveInitialToolsTab(id)).toBe('imagePipeline');
  expect(resolveInitialToolsTab('rename')).toBe('rename');
  expect(resolveInitialToolsTab('duplicates')).toBe('duplicates');
  expect(resolveInitialToolsTab(null)).toBe('duplicates');
  expect(TOOLS_TAB_IDS).toEqual(['duplicates', 'rename', 'imagePipeline', 'upscale']);
});
