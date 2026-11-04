// src/features/tools-studio/image-pipeline/imagePipeline.structure.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dirname, f), 'utf8');

function expectUiRules(src) {
  expect(src).not.toMatch(/<select[\s>]/);
  // Native HTML elements only; component props such as <StudioLayout.RightSidebar title=…> are allowed.
  expect(src).not.toMatch(/<(button|a|span|div|input|label|img|li|p|nav|aside|main|header)\b[^>]*\stitle=/);
  expect(src).toMatch(/useI18n/);
}

test('ActionStackPanel renders XnConvert-style cards with reorder, enable and remove', () => {
  const src = read('ActionStackPanel.jsx');
  expectUiRules(src);
  for (const token of ['arrow_upward', 'arrow_downward', 'remove_circle_outline', "type: 'move'", "type: 'toggleEnabled'", "type: 'remove'", "type: 'add'", "type: 'clear'", "type: 'select'", 'data-tooltip', 'aria-label', 'imagePipeline.actions.heading']) {
    expect(src).toContain(token);
  }
  // Clear all tasks trash icon has no tooltip on hover and is actively text-error when actions exist
  expect(src).toContain("aria-label={t('imagePipeline.actions.clearAll')}");
  expect(src).not.toContain("data-tooltip={t('imagePipeline.actions.clearAll')}");
  expect(src).toMatch(/actions\.length > 0\s*\?\s*['"][^'"]*text-error/);
  // Remove action (-) icon has no tooltip on hover
  expect(src).toContain("aria-label={t('imagePipeline.actions.remove')}");
  expect(src).not.toContain("data-tooltip={t('imagePipeline.actions.remove')}");
});

test('ActionParamsForm covers the three action types without native selects', () => {
  const src = read('ActionParamsForm.jsx');
  expectUiRules(src);
  for (const token of ['autoTrim', 'margin', 'sampleCorner', 'tolerance', 'fillWhite', 'fillBlack', 'readingDirection', 'ratioThreshold', 'SearchableSelect']) {
    expect(src).toContain(token);
  }
});

test('TemplateToolbar exposes select, save, save-as, delete, import and export with tooltips', () => {
  const src = read('TemplateToolbar.jsx');
  expectUiRules(src);
  for (const token of ['SearchableSelect', 'save_as', 'file_open', 'ios_share', 'delete', 'imagePipeline.template.unsaved', 'data-tooltip', 'aria-label', 'min-w-[11.5rem]']) {
    expect(src).toContain(token);
  }
  // 3-dots actions button has no tooltip on hover
  expect(src).toContain("aria-label={t('imagePipeline.template.actions')}");
  expect(src).not.toContain("data-tooltip={t('imagePipeline.template.actions')}");
});

test('SaveTemplateDialog is a portal dialog without window.prompt', () => {
  const src = read('SaveTemplateDialog.jsx');
  expectUiRules(src);
  expect(src).toContain('createPortal');
  expect(src).not.toMatch(/window\.prompt/);
  expect(src).toContain("'Escape'");
});

test('PipelineImageList follows the Tools Studio list standard and supports keyboard navigation', () => {
  const src = read('PipelineImageList.jsx');
  expectUiRules(src);
  for (const token of [
    'check_box', 'indeterminate_check_box', 'check_box_outline_blank', 'visibility', 'delete',
    'SearchableSelect', 'sort_by_alpha', 'imagePipeline.badge.skew', 'imagePipeline.badge.stale',
    'h-1 bg-surface-container-highest', 'custom-scrollbar', 'EmptyState',
    "'ArrowDown'", "'ArrowUp'", "'Enter'", 'scrollIntoView', 'data-active',
  ]) {
    expect(src).toContain(token);
  }
});

test('usePipelinePreview debounces and ignores stale responses', () => {
  const src = read('usePipelinePreview.js');
  expect(src).toContain('setTimeout');
  expect(src).toContain('clearTimeout');
  expect(src).toContain('pipelinePreview');
  expect(src).toMatch(/reqId !== reqRef\.current/);
});

test('PipelinePreviewPanel toggles step input / final, supports Space and opens the modal', () => {
  const src = read('PipelinePreviewPanel.jsx');
  expectUiRules(src);
  for (const token of ["'stepInput'", "'final'", 'onOpenFull', "e.code === 'Space'", 'imagePipeline.preview.estimated', 'export function StepOverlay']) {
    expect(src).toContain(token);
  }
});

test('SplitLineOverlay drags top/bottom handles with pointer capture', () => {
  const src = read('SplitLineOverlay.jsx');
  expectUiRules(src);
  for (const token of ['setPointerCapture', 'topRatio', 'bottomRatio', 'imagePipeline.modal.splitHandleTop', 'imagePipeline.modal.splitHandleBottom']) {
    expect(src).toContain(token);
  }
});

test('PipelinePreviewModal is a portal with step strip, per-image overrides and keyboard shortcuts', () => {
  const src = read('PipelinePreviewModal.jsx');
  expectUiRules(src);
  for (const token of [
    'createPortal', 'z-[9990]', 'bg-surface', 'InteractiveCropOverlay', 'SplitLineOverlay', "'stepOutput'",
    "'Escape'", "'ArrowLeft'", "'ArrowRight'", "'['", "']'", 'e.ctrlKey || e.metaKey', "e.code === 'Space'",
    'setOverride', 'clearOverride', 'confirmOverride', 'imagePipeline.modal.skipStep', 'imagePipeline.modal.resetToGlobal',
    'imagePipeline.modal.frameA', 'imagePipeline.modal.afterSplitNotice',
  ]) {
    expect(src).toContain(token);
  }
});

test('ImagePipelineTab composes the Tools Studio standard layout', () => {
  const src = read('ImagePipelineTab.jsx');
  expectUiRules(src);
  for (const token of [
    '<ToolsStudioActionSlot active={isActive}>', '<ToolsStudioCenterSlot active={isActive}>', 'SourcePicker',
    'OutputFormatSelector', 'OutputDestinationSelector',
    'ResizeSplitter', 'StudioLayout.RightSidebar', 'ActionStackPanel', 'PipelineImageList', 'PipelinePreviewPanel',
    'PipelinePreviewModal', 'TemplateToolbar', 'SaveTemplateDialog', 'image-pipeline-start-btn', 'image-pipeline-stop-btn',
    'stop_circle', 'mr-1.5', 'subscribePipelineProgress', 'pipelineRun', 'pipelineAnalyze', 'pipelineCancel',
    'markDownstreamStaleAll', 'markReorderStale', 'removeActionOverrides', 'ensureTemplates', 'parseImportedTemplate',
  ]) {
    expect(src).toContain(token);
  }
  expect(src.indexOf('<ToolsStudioActionSlot')).toBeLessThan(src.indexOf('showSidebar &&'));
  expect(src).not.toMatch(/title=\{[\s\S]*?<span[^>]*data-tooltip=\{t\('imagePipeline\.preview\.spaceHint'\)\}/);
});
