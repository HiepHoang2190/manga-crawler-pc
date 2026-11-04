import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const TAB_FILES = [
  './image-pipeline/ImagePipelineTab.jsx',
  '../export/rename/RenameTab.jsx',
  '../export/duplicates/DuplicateFinderTab.jsx',
  '../export/upscale/UpscaleTab.jsx',
];

test('src/features/tools-studio/index.js exports ToolsStudio', () => {
  const indexSrc = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(indexSrc).toMatch(/export \{ default as ToolsStudio \} from '\.\/ToolsStudio(\.jsx)?';/);
});

test('ToolsStudio.jsx mounts the image pipeline tab plus rename, duplicates and upscale', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'ToolsStudio.jsx'), 'utf8');
  expect(studioSrc).toMatch(/import ImagePipelineTab from '\.\/image-pipeline\/ImagePipelineTab';/);
  expect(studioSrc).toMatch(/import RenameTab from '\.\.\/export\/rename\/RenameTab';/);
  expect(studioSrc).toMatch(/import DuplicateFinderTab from '\.\.\/export\/duplicates\/DuplicateFinderTab';/);
  expect(studioSrc).toMatch(/import UpscaleTab from '\.\.\/export\/upscale\/UpscaleTab';/);
  for (const old of ['CropTab', 'DeskewTab', 'SplitDoublePageTab', 'ImageConvertTab', 'CompressTab']) {
    expect(studioSrc).not.toContain(old);
  }
});

test('ToolsStudio.jsx defines 4 sub-tabs and migrates legacy ids', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'ToolsStudio.jsx'), 'utf8');
  for (const id of ["'imagePipeline'", "'upscale'", "'rename'", "'duplicates'"]) expect(studioSrc).toContain(id);
  expect(studioSrc).toMatch(/resolveInitialToolsTab/);
});

test('ToolsStudio.jsx implements keep-alive layout using hidden classes', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'ToolsStudio.jsx'), 'utf8');
  for (const id of ['imagePipeline', 'rename', 'duplicates', 'upscale']) {
    expect(studioSrc).toContain(`activeTab === '${id}' ? 'h-full w-full flex flex-col min-h-0 min-w-0' : 'hidden'`);
  }
});

test('ToolsStudio passes right sidebar state to the image pipeline tab', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'ToolsStudio.jsx'), 'utf8');
  for (const token of ['showRightSidebar={showRightSidebar}', 'rightWidth={rightWidth}', 'onRightResizeStart={handleRightResizeStart}', 'onToggleRightSidebar={toggleRightSidebar}']) {
    expect(studioSrc).toContain(token);
  }
});

test('ToolsStudio.jsx integrates useToolsSidebarResize and passes props to tabs', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'ToolsStudio.jsx'), 'utf8');
  expect(studioSrc).toMatch(/useToolsSidebarResize/);
  expect(studioSrc).toMatch(/sidebarWidth=\{sidebarWidth\}/);
  expect(studioSrc).toMatch(/handleSplitPointerDown=\{handleSplitPointerDown\}/);
});

test('ToolsStudio.jsx manages tabBusyMap and renders progress spinner on header toolbar when executing', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'ToolsStudio.jsx'), 'utf8');
  expect(studioSrc).toMatch(/tabBusyMap/);
  expect(studioSrc).toMatch(/handleTabRunningChange/);
  expect(studioSrc).toMatch(/progress_activity/);
  expect(studioSrc).toMatch(/animate-spin/);
  expect(studioSrc).toMatch(/animate-ping/);
  expect(studioSrc).toMatch(/onRunningChange=\{\(r\) => handleTabRunningChange\('imagePipeline', r\)\}/);
  expect(studioSrc).toMatch(/onRunningChange=\{\(r\) => handleTabRunningChange\('duplicates', r\)\}/);
});

test('DuplicateFinderTab.jsx implements duplicate group clustering with group cards and actions', () => {
  const dupSrc = fs.readFileSync(path.join(dirname, '../export/duplicates/DuplicateFinderTab.jsx'), 'utf8');
  expect(dupSrc).toMatch(/groupedDuplicates/);
  expect(dupSrc).toMatch(/item\.duplicateGroup/);
  expect(dupSrc).toMatch(/toggleGroupSelection/);
  expect(dupSrc).toMatch(/selectOnlyGroupCopies/);
  expect(dupSrc).toMatch(/uncheckGroup/);
  expect(dupSrc).toMatch(/group\.reclaimableSize/);
  expect(dupSrc).toMatch(/duplicateTab\.group/);
});

test('DuplicateFinderTab.jsx renders representative preview thumbnail for duplicate groups', () => {
  const dupSrc = fs.readFileSync(path.join(dirname, '../export/duplicates/DuplicateFinderTab.jsx'), 'utf8');
  expect(dupSrc).toMatch(/GroupThumbnail/);
  expect(dupSrc).toMatch(/representativeItem/);
  expect(dupSrc).toMatch(/previewThumbnailCache/);
});

test('ToolsStudio integrates ToolsStudioActionSlot and ToolsStudioCenterSlot in Toolbar and provides contexts', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'ToolsStudio.jsx'), 'utf8');
  expect(studioSrc).toMatch(/ToolsStudioActionContext/);
  expect(studioSrc).toMatch(/ToolsStudioCenterContext/);
  expect(studioSrc).toMatch(/tools-studio-actions-slot/);
  expect(studioSrc).toMatch(/tools-studio-center-slot/);
  for (const id of ['imagePipeline', 'rename', 'duplicates', 'upscale']) {
    expect(studioSrc).toContain(`isActive={activeTab === '${id}'}`);
  }
});

test('All tool tabs use ToolsStudioActionSlot mounted outside showSidebar', () => {
  TAB_FILES.forEach((rel) => {
    const tabSrc = fs.readFileSync(path.join(dirname, rel), 'utf8');
    expect(tabSrc).toMatch(/<ToolsStudioActionSlot active=\{isActive\}>/);
    const actionSlotIndex = tabSrc.indexOf('<ToolsStudioActionSlot');
    const showSidebarIndex = tabSrc.indexOf('showSidebar &&');
    expect(actionSlotIndex).toBeGreaterThan(-1);
    expect(showSidebarIndex).toBeGreaterThan(-1);
    expect(actionSlotIndex).toBeLessThan(showSidebarIndex);
  });
});
