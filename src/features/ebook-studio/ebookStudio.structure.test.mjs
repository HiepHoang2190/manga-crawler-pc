import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/ebook-studio/index.js exports EbookStudio', () => {
  const indexSrc = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(indexSrc).toMatch(/export \{ default as EbookStudio \} from '\.\/EbookStudio';/);
});

test('EbookStudio.jsx mounts all 4 Sub-tabs', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'EbookStudio.jsx'), 'utf8');
  expect(studioSrc).toMatch(/import MangaPackagingSubTab from '\.\/components\/MangaPackagingSubTab';/);
  expect(studioSrc).toMatch(/import FormatConverterSubTab from '\.\/components\/FormatConverterSubTab';/);
  expect(studioSrc).toMatch(/import EbookToolsSubTab from '\.\/components\/EbookToolsSubTab';/);
  expect(studioSrc).toMatch(/import SendToKindleTab from '\.\.\/export\/kindle\/SendToKindleTab';/);
});

test('MangaPackagingSubTab connects DualSourcePicker and all 4 config forms', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  expect(pkgSrc).toMatch(/import DualSourcePicker from '\.\/DualSourcePicker';/);
  expect(pkgSrc).toMatch(/import CbzConfigForm from '\.\/forms\/CbzConfigForm';/);
  expect(pkgSrc).toMatch(/import PdfConfigForm from '\.\/forms\/PdfConfigForm';/);
  expect(pkgSrc).toMatch(/import EpubConfigForm from '\.\/forms\/EpubConfigForm';/);
  expect(pkgSrc).toMatch(/import MobiConfigForm from '\.\/forms\/MobiConfigForm';/);
});

test('FormatConverterSubTab uses DualSourcePicker and batch convert APIs', () => {
  const convSrc = fs.readFileSync(path.join(dirname, 'components/FormatConverterSubTab.jsx'), 'utf8');
  expect(convSrc).toMatch(/import DualSourcePicker from '\.\/DualSourcePicker';/);
  expect(convSrc).toMatch(/ebookBatchConvert/);
  expect(convSrc).toMatch(/ResizeSplitter/);
  expect(convSrc).toMatch(/grid-cols-2/);
  expect(convSrc).toMatch(/ebookStudio\.converter\.formatTitle/);
  expect(convSrc).toMatch(/ebookStudio\.converter\.configTitle/);
  expect(convSrc).toMatch(/rotateDoublePage/);
});

test('MangaPackagingSubTab renders diagnostic card for invalid structure', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  expect(pkgSrc).toMatch(/ebookStudio\.packaging\.invalidStructureTitle/);
  expect(pkgSrc).toMatch(/ebookStudio\.packaging\.supportedStructuresTitle/);
  expect(pkgSrc).toMatch(/folder_off/);
});

test('i18n locales vi.js and en.js contain packaging diagnostic keys', () => {
  const rootDir = path.resolve(dirname, '../../..');
  const viSrc = fs.readFileSync(path.join(rootDir, 'src/i18n/locales/vi.js'), 'utf8');
  const enSrc = fs.readFileSync(path.join(rootDir, 'src/i18n/locales/en.js'), 'utf8');
  const requiredKeys = [
    'ebookStudio.packaging.invalidStructureTitle',
    'ebookStudio.packaging.supportedStructuresTitle',
    'ebookStudio.packaging.structure1',
    'ebookStudio.packaging.structure2',
    'ebookStudio.packaging.structure3',
    'ebookStudio.packaging.rotateDoublePage',
    'ebookStudio.packaging.rotateDoublePageDesc',
    'ebookStudio.packaging.pickerHint',
    'ebookStudio.packaging.promptSelectFolderSub',
    'ebookStudio.converter.queueEmptySub',
  ];
  for (const key of requiredKeys) {
    expect(viSrc).toContain(key);
    expect(enSrc).toContain(key);
  }
});
test('EbookStudio subtabs render cleanly without hover tooltips', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'EbookStudio.jsx'), 'utf8');
  expect(studioSrc).not.toMatch(/data-testid=\{`subtab-\$\{tab\.id\}`\}\s+data-tooltip/);
});
test('EbookToolsSubTab implements 2-panel Studio Layout with ResizeSplitter', () => {
  const toolsSrc = fs.readFileSync(path.join(dirname, 'components/EbookToolsSubTab.jsx'), 'utf8');
  expect(toolsSrc).toMatch(/ResizeSplitter/);
  expect(toolsSrc).toMatch(/grid-cols-2/);
  expect(toolsSrc).toMatch(/combineCbz/);
  expect(toolsSrc).toMatch(/splitCbz/);
  expect(toolsSrc).toMatch(/ebookStudio\.tools\.toolTitle/);
});

test('SendToKindleTab implements 2-panel Studio Layout with ResizeSplitter', () => {
  const kindleSrc = fs.readFileSync(path.resolve(dirname, '../export/kindle/SendToKindleTab.jsx'), 'utf8');
  expect(kindleSrc).toMatch(/ResizeSplitter/);
  expect(kindleSrc).toMatch(/sendToKindle\.accountTitle/);
  expect(kindleSrc).toMatch(/sendToKindleTab\.sendPending/);
  expect(kindleSrc).toMatch(/<SearchableSelect/);
  expect(kindleSrc).toMatch(/filterOptions/);
  expect(kindleSrc).not.toMatch(/data-tooltip=\{account/);
  expect(kindleSrc).not.toMatch(/hover:underline/);
});

test('EbookToolsSubTab includes live split naming preview and expected parts list', () => {
  const toolsSrc = fs.readFileSync(path.join(dirname, 'components/EbookToolsSubTab.jsx'), 'utf8');
  expect(toolsSrc).toMatch(/splitLiveResult/);
  expect(toolsSrc).toMatch(/splitDefaultResult/);
  expect(toolsSrc).toMatch(/splitPartsListTitle/);
  expect(toolsSrc).toMatch(/splitPartList/);
});

test('EbookStudio.jsx omits left-sidebar toggle and passes sidebar resize props to all 4 subtabs', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'EbookStudio.jsx'), 'utf8');
  expect(studioSrc).not.toContain('onToggleLeftSidebar');
  expect(studioSrc).not.toContain('showLeftSidebar');
  expect(studioSrc).toMatch(/showSidebar=\{true\}/);
  expect(studioSrc).toMatch(/showCol1=\{true\}/);
  expect(studioSrc).toMatch(/<EbookToolsSubTab[\s\S]*sidebarWidth=\{sidebarWidth\}/);
  expect(studioSrc).toMatch(/<SendToKindleTab[\s\S]*sidebarWidth=\{sidebarWidth\}/);
});

test('EbookStudio.jsx passes onRunningChange to all 4 subtabs and renders progress icon when busy', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'EbookStudio.jsx'), 'utf8');
  expect(studioSrc).toMatch(/tabBusyMap/);
  expect(studioSrc).toMatch(/handleTabRunningChange/);
  expect(studioSrc).toMatch(/progress_activity/);
  expect(studioSrc).toMatch(/<MangaPackagingSubTab[\s\S]*onRunningChange=\{/);
  expect(studioSrc).toMatch(/<FormatConverterSubTab[\s\S]*onRunningChange=\{/);
  expect(studioSrc).toMatch(/<EbookToolsSubTab[\s\S]*onRunningChange=\{/);
  expect(studioSrc).toMatch(/<SendToKindleTab[\s\S]*onRunningChange=\{/);
});

test('MangaPackagingSubTab.jsx and FormatConverterSubTab.jsx accept and trigger onRunningChange', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  const convSrc = fs.readFileSync(path.join(dirname, 'components/FormatConverterSubTab.jsx'), 'utf8');
  expect(pkgSrc).toMatch(/onRunningChange/);
  expect(pkgSrc).toMatch(/onRunningChange\?\.(\(processing\)|\(Boolean\(processing\)\))/);
  expect(convSrc).toMatch(/onRunningChange/);
  expect(convSrc).toMatch(/onRunningChange\?\.(\(converting\)|\(Boolean\(converting\)\))/);
});

test('EbookStudio mounts action and center slots on toolbar and subtabs render slots outside sidebar', () => {
  const indexSrc = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(indexSrc).toMatch(/export \{[\s\S]*EbookStudioActionSlot[\s\S]*\} from '\.\/EbookStudioActionSlot';/);
  expect(indexSrc).toMatch(/export \{[\s\S]*EbookStudioActionContext[\s\S]*\} from '\.\/EbookStudioActionSlot';/);
  expect(indexSrc).toMatch(/export \{[\s\S]*EbookStudioCenterSlot[\s\S]*\} from '\.\/EbookStudioActionSlot';/);
  expect(indexSrc).toMatch(/export \{[\s\S]*EbookStudioCenterContext[\s\S]*\} from '\.\/EbookStudioActionSlot';/);

  const studioSrc = fs.readFileSync(path.join(dirname, 'EbookStudio.jsx'), 'utf8');
  expect(studioSrc).toMatch(/data-testid="ebook-studio-center-slot"/);
  expect(studioSrc).toMatch(/rightSlot=\{[\s\S]*data-testid="ebook-studio-actions-slot"/);
  expect(studioSrc).toMatch(/<EbookStudioActionContext\.Provider value=\{actionSlotEl\}>/);
  expect(studioSrc).toMatch(/<EbookStudioCenterContext\.Provider value=\{centerSlotEl\}>/);

  const subtabFiles = [
    'components/MangaPackagingSubTab.jsx',
    'components/FormatConverterSubTab.jsx',
    'components/EbookToolsSubTab.jsx',
    '../export/kindle/SendToKindleTab.jsx',
  ];

  for (const relativePath of subtabFiles) {
    const filePath = path.resolve(dirname, relativePath);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/<EbookStudioActionSlot active=\{isActive\}>/);
    expect(content).toMatch(/<EbookStudioCenterSlot active=\{isActive\}>/);

    const actionSlotIndex = content.indexOf('<EbookStudioActionSlot');
    const centerSlotIndex = content.indexOf('<EbookStudioCenterSlot');
    const sidebarIndex = content.search(/\{(isSidebarVisible|showSidebar)\s*&&\s*\(/);
    expect(actionSlotIndex).toBeGreaterThan(-1);
    expect(centerSlotIndex).toBeGreaterThan(-1);
    expect(sidebarIndex).toBeGreaterThan(-1);
    expect(centerSlotIndex).toBeLessThan(sidebarIndex);
  }
});

test('Convert subtabs (Packaging, Converter, Tools) use shared OutputDestinationSelector format', () => {
  const selectorSrc = fs.readFileSync(path.resolve(dirname, '../../shared/ui/OutputDestinationSelector.jsx'), 'utf8');
  expect(selectorSrc).toContain('folder_open');
  expect(selectorSrc).toContain('>close<');
  expect(selectorSrc).toContain('onOutputDirChange');

  const subtabs = [
    'components/MangaPackagingSubTab.jsx',
    'components/FormatConverterSubTab.jsx',
    'components/EbookToolsSubTab.jsx',
  ];

  for (const relPath of subtabs) {
    const content = fs.readFileSync(path.join(dirname, relPath), 'utf8');
    expect(content).toContain('<OutputDestinationSelector');
    expect(content).toContain("inPlaceLabel={t('outputDestination.sameAsSource')}");
    expect(content).toContain('onBrowse={handleSelectOutputDir}');
    expect(content).not.toContain("t('ebookStudio.packaging.change')");
    expect(content).not.toContain("t('ebookStudio.packaging.change', 'Đổi...')");
    expect(content).not.toMatch(/value=\{outputDir[^}]*\}\s+className="[^"]*"\s+readOnly/);
  }
});

test('All 4 config forms (CBZ, PDF, EPUB, MOBI) omit redundant "Chế độ ..." labels and render inline explanations instead of mode tooltips', () => {
  const formFiles = [
    'components/forms/CbzConfigForm.jsx',
    'components/forms/PdfConfigForm.jsx',
    'components/forms/EpubConfigForm.jsx',
    'components/forms/MobiConfigForm.jsx',
  ];

  for (const relPath of formFiles) {
    const content = fs.readFileSync(path.join(dirname, relPath), 'utf8');
    // Must NOT contain redundant 'Chế độ ...' label
    expect(content).not.toMatch(/<label[^>]*>Chế độ (đóng gói|xuất) [^<]+<\/label>/);
    // Mode buttons must NOT have data-tooltip
    expect(content).not.toMatch(/<button[\s\S]*?data-tooltip=\{mode\.tooltip\}/);
    // Must compute activeMode AFTER modes declaration to avoid TDZ ReferenceError
    const modesIndex = content.indexOf('const modes =');
    const activeModeIndex = content.indexOf('const activeMode =');
    expect(modesIndex).toBeGreaterThan(-1);
    expect(activeModeIndex).toBeGreaterThan(modesIndex);
    expect(content).toMatch(/activeMode\?\.tooltip/);
  }
});

test('All 4 config forms and FormatConverterSubTab share unified rotateDoublePage title and description', () => {
  const sharedFieldsSrc = fs.readFileSync(path.join(dirname, 'components/forms/ConfigFormFields.jsx'), 'utf8');
  expect(sharedFieldsSrc).toMatch(/useI18n/);
  expect(sharedFieldsSrc).not.toMatch(/rotateDoublePage[\s\S]*?<span[^>]*>info<\/span>/);
  expect(sharedFieldsSrc).toContain('ebookStudio.packaging.rotateDoublePage');
  expect(sharedFieldsSrc).toContain('ebookStudio.packaging.rotateDoublePageDesc');
  expect(sharedFieldsSrc).toMatch(/Tự động xoay trang đôi theo chiều ngang/);
  expect(sharedFieldsSrc).toMatch(/Tự động nhận diện trang đôi/);

  const formFiles = [
    'components/forms/CbzConfigForm.jsx',
    'components/forms/PdfConfigForm.jsx',
    'components/forms/EpubConfigForm.jsx',
    'components/forms/MobiConfigForm.jsx',
    'components/FormatConverterSubTab.jsx',
  ];

  for (const relPath of formFiles) {
    const content = fs.readFileSync(path.join(dirname, relPath), 'utf8');
    expect(content).toMatch(/import\s+\{[^}]*useI18n[^}]*\}\s+from/);
    expect(content).toMatch(/const\s+\{\s*t\s*\}\s*=\s*useI18n\(\)/);
    expect(content).toContain('<RotateDoublePageOption');
  }
});

test('KindleGenCompilerCard is used by MangaPackagingSubTab and FormatConverterSubTab for sleek compiler status', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  const convSrc = fs.readFileSync(path.join(dirname, 'components/FormatConverterSubTab.jsx'), 'utf8');
  const cardSrc = fs.readFileSync(path.join(dirname, 'components/KindleGenCompilerCard.jsx'), 'utf8');

  expect(pkgSrc).toMatch(/import KindleGenCompilerCard from '\.\/KindleGenCompilerCard';/);
  expect(convSrc).toMatch(/import KindleGenCompilerCard from '\.\/KindleGenCompilerCard';/);
  expect(pkgSrc).toMatch(/compilerSectionTitle[\s\S]*?<KindleGenCompilerCard/);
  expect(convSrc).toMatch(/compilerSectionTitle[\s\S]*?<KindleGenCompilerCard/);
  expect(cardSrc).toMatch(/compilerStatus\?\.available/);
  expect(cardSrc).toMatch(/swap_horiz/);
  expect(cardSrc).toMatch(/folder_open/);
});

test('MangaPackagingSubTab chapter list uses line-clamp-2 break-all for paths and omits folder button tooltip', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  const cardSrc = fs.readFileSync(path.join(dirname, 'components/KindleGenCompilerCard.jsx'), 'utf8');

  // Chapter path must use line-clamp-2 and break-all
  expect(pkgSrc).toMatch(/line-clamp-2\s+break-all[\s\S]*?ch\.path/);

  // Folder open button in chapter list must not have data-tooltip
  const chapterFolderBtn = pkgSrc.match(/<button[^>]*showItemInFolder\(ch\.path\)[\s\S]*?<\/button>/)?.[0] || '';
  expect(chapterFolderBtn).not.toContain('data-tooltip');

  // Folder open button in KindleGenCompilerCard must not have data-tooltip
  const cardFolderBtn = cardSrc.match(/<button[^>]*handleOpenLocation[\s\S]*?<\/button>/)?.[0] || '';
  expect(cardFolderBtn).not.toContain('data-tooltip');
});

test('All 4 Convert subtabs use unified EmptyState component', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  const convSrc = fs.readFileSync(path.join(dirname, 'components/FormatConverterSubTab.jsx'), 'utf8');
  const toolsSrc = fs.readFileSync(path.join(dirname, 'components/EbookToolsSubTab.jsx'), 'utf8');
  const kindleSrc = fs.readFileSync(path.resolve(dirname, '../export/kindle/SendToKindleTab.jsx'), 'utf8');

  expect(pkgSrc).toMatch(/<EmptyState/);
  expect(convSrc).toMatch(/<EmptyState/);
  expect(toolsSrc).toMatch(/<EmptyState/);
  expect(kindleSrc).toMatch(/<EmptyState/);
});

test('FormatConverterSubTab, MangaPackagingSubTab, and EbookToolsSubTab validate output directory and mount SaveDirErrorModal', () => {
  const convSrc = fs.readFileSync(path.join(dirname, 'components/FormatConverterSubTab.jsx'), 'utf8');
  expect(convSrc).toContain('validateSaveDir');
  expect(convSrc).toContain('SaveDirErrorModal');
  expect(convSrc).toContain('outputWarning');

  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  expect(pkgSrc).toContain('validateSaveDir');
  expect(pkgSrc).toContain('SaveDirErrorModal');
  expect(pkgSrc).toContain('outputWarning');

  const toolsSrc = fs.readFileSync(path.join(dirname, 'components/EbookToolsSubTab.jsx'), 'utf8');
  expect(toolsSrc).toContain('validateSaveDir');
  expect(toolsSrc).toContain('SaveDirErrorModal');
  expect(toolsSrc).toContain('outputWarning');
});

test('EbookStudio sub-tab pill buttons match toolbar action button height (h-8 px-3 inside p-0.5 wrapper)', () => {
  const studioSrc = fs.readFileSync(path.join(dirname, 'EbookStudio.jsx'), 'utf8');
  expect(studioSrc).toContain('rounded-xl bg-surface-container-high/70 border border-outline-variant/25');
  expect(studioSrc).toContain('p-0.5');
  expect(studioSrc).toMatch(/data-testid=\{`subtab-\$\{tab\.id\}`\}[\s\S]{0,500}\bh-8 px-3\b/);
  expect(studioSrc).not.toMatch(/data-testid=\{`subtab-\$\{tab\.id\}`\}[\s\S]{0,500}(?:\bpy-1\.5\b|\bh-7\b)/);
});


test('Packaging & Converter render a single Start/Stop toggle CTA with unified Primary and soft-error Stop styles', () => {
  const cases = [
    { file: 'components/MangaPackagingSubTab.jsx', flag: 'processing' },
    { file: 'components/FormatConverterSubTab.jsx', flag: 'converting' },
  ];
  for (const { file, flag } of cases) {
    const src = fs.readFileSync(path.join(dirname, file), 'utf8');
    const slot = src.match(/<EbookStudioCenterSlot active=\{isActive\}>([\s\S]*?)<\/EbookStudioCenterSlot>/)?.[1] || '';
    expect({ file, toggle: new RegExp(`\\{${flag}\\s*\\?\\s*\\(`).test(slot) }).toEqual({ file, toggle: true });
    expect(slot).not.toMatch(new RegExp(`disabled=\\{!${flag}\\b`));
    for (const token of ['bg-error/15', 'border-error/30', 'stop_circle', 'bg-primary', 'text-on-primary', 'h-8', 'px-3.5', 'shrink-0']) {
      expect(slot).toContain(token);
    }
  }
});

test('Tools & Kindle primary CTAs use canonical toolbar CTA classes', () => {
  for (const rel of ['components/EbookToolsSubTab.jsx', '../export/kindle/SendToKindleTab.jsx']) {
    const src = fs.readFileSync(path.resolve(dirname, rel), 'utf8');
    const slot = src.match(/<EbookStudioCenterSlot active=\{isActive\}>([\s\S]*?)<\/EbookStudioCenterSlot>/)?.[1] || '';
    expect(slot).toContain('inline-flex h-8');
    expect(slot).toContain('shadow-2xs');
    expect(slot).toContain('whitespace-nowrap');
    expect(slot).not.toContain('shadow-xs transition-all hover:opacity-90');
  }
});

test('Packaging, Converter & Tools render bottom-pinned Overview cards matching Tools Studio', () => {
  const cases = [
    { file: 'components/MangaPackagingSubTab.jsx', testId: 'packaging-overview-card', keys: ['title', 'totalChapters', 'selected', 'format', 'packagingTip'] },
    { file: 'components/FormatConverterSubTab.jsx', testId: 'converter-overview-card', keys: ['title', 'totalFiles', 'pending', 'completed', 'errors', 'converterTip'] },
    { file: 'components/EbookToolsSubTab.jsx', testId: 'tools-overview-card', keys: ['title', 'mode', 'totalFiles', 'sourceSize', 'estimatedParts', 'toolsCombineTip', 'toolsSplitTip'] },
  ];
  for (const { file, testId, keys } of cases) {
    const src = fs.readFileSync(path.join(dirname, file), 'utf8');
    expect(src).toContain('flex-1 flex flex-col overflow-y-auto custom-scrollbar px-4 py-5 space-y-5 mr-1.5');
    expect(src).toContain('mt-auto pt-2');
    expect(src).toContain(`data-testid="${testId}"`);
    expect(src).toContain('rounded-xl border border-primary/15 bg-primary/5 p-3');
    expect(src).toContain('bar_chart');
    expect(src).toContain('touch_app');
    for (const key of keys) expect(src).toContain(`ebookStudio.overview.${key}`);
  }
});

test('Packaging uses unified theme-aware status / error notification cards', () => {
  const src = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  expect(src).toContain('data-testid="packaging-status-message"');
  expect(src).toContain('data-testid="packaging-status-error"');
  expect(src).toContain('text-xs text-on-surface whitespace-pre-wrap border border-outline-variant/20 rounded-xl p-3 bg-surface-container-highest/50');
  expect(src).toContain('role="status"');
  expect(src).toContain('role="alert"');
  expect(src).not.toContain("resultMsg.includes('Lỗi')");
  expect(src).toContain('ebookStudio.packaging.filesCreated');
});

test('Convert output destination controls follow h-10 rounded-xl sidebar standard', () => {
  const selectorSrc = fs.readFileSync(path.resolve(dirname, '../../shared/ui/OutputDestinationSelector.jsx'), 'utf8');
  expect(selectorSrc).not.toContain('h-9');
  expect(selectorSrc).toContain('h-10 min-w-0 w-full rounded-xl');
  expect(selectorSrc).toContain('inline-flex h-10 w-10 shrink-0');

  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  expect(pkgSrc).toContain('h-10 w-full rounded-xl');
  expect(pkgSrc).toContain("t('ebookStudio.packaging.outputNameLabel')");
});

test('Packaging & Converter workspace filters use SearchableSelect size="sm" instead of chip pills', () => {
  for (const rel of ['components/MangaPackagingSubTab.jsx', 'components/FormatConverterSubTab.jsx']) {
    const src = fs.readFileSync(path.join(dirname, rel), 'utf8');
    expect(src).toMatch(/<SearchableSelect[\s\S]{0,80}value=\{filterStatus\}[\s\S]{0,200}size="sm"/);
    expect(src).toMatch(/<SearchableSelect[\s\S]{0,80}value=\{sortBy\}[\s\S]{0,700}size="sm"/);
    expect(src).not.toContain("'rounded-md px-2 py-1 font-medium transition-colors cursor-pointer'");
  }
});

test('vi.js and en.js define Convert overview keys', () => {
  const rootDir = path.resolve(dirname, '../../..');
  const viSrc = fs.readFileSync(path.join(rootDir, 'src/i18n/locales/vi.js'), 'utf8');
  const enSrc = fs.readFileSync(path.join(rootDir, 'src/i18n/locales/en.js'), 'utf8');
  const keys = [
    'ebookStudio.overview.title',
    'ebookStudio.overview.totalChapters',
    'ebookStudio.overview.selected',
    'ebookStudio.overview.format',
    'ebookStudio.overview.totalFiles',
    'ebookStudio.overview.pending',
    'ebookStudio.overview.completed',
    'ebookStudio.overview.errors',
    'ebookStudio.overview.packagingTip',
    'ebookStudio.overview.converterTip',
    'ebookStudio.packaging.filesCreated',
  ];
  for (const key of keys) {
    expect(viSrc).toContain(`'${key}'`);
    expect(enSrc).toContain(`'${key}'`);
  }
});

test('Packaging & Converter Stop CTA waits for the running job to finish instead of resetting state early', () => {
  const cases = [
    { file: 'components/MangaPackagingSubTab.jsx', setter: 'setProcessing' },
    { file: 'components/FormatConverterSubTab.jsx', setter: 'setConverting' },
  ];
  for (const { file, setter } of cases) {
    const src = fs.readFileSync(path.join(dirname, file), 'utf8');
    const cancelFn = src.match(/const handleCancel = async \(\) => \{([\s\S]*?)\n {2}\};/)?.[1] || '';
    expect(cancelFn).toContain('setCancelling(true)');
    expect(cancelFn).not.toContain(`${setter}(false)`);
    expect(src).toContain("t('ebookStudio.stop')");
    expect(src).toContain('disabled={!api?.ebookCancel || cancelling}');
  }
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  expect(pkgSrc).not.toContain('filteredAndSortedChapters.filter((c) => selectedTitles.has(c.title))');
});

test('Packaging, Converter & Tools split the sidebar into Cấu hình / Thiết lập đầu ra sub-tabs like Xử lý ảnh / Upscale', () => {
  for (const rel of ['components/MangaPackagingSubTab.jsx', 'components/FormatConverterSubTab.jsx', 'components/EbookToolsSubTab.jsx']) {
    const src = fs.readFileSync(path.join(dirname, rel), 'utf8');
    expect(src).toMatch(/const \[sidebarTab, setSidebarTab\] = useState\('config'\)/);
    expect(src).toContain('role="tablist"');
    expect(src).toContain("t('ebookStudio.sidebarTab.config')");
    expect(src).toContain("t('ebookStudio.sidebarTab.output')");
    expect(src).toContain('grid grid-cols-2 p-1 rounded-xl bg-surface-container-highest/60 border border-outline-variant/20 gap-1');
    expect(src).toContain('data-tooltip={outputWarningMsg}');
    expect(src).toContain('sr-only');

    const configIdx = src.indexOf("{sidebarTab === 'config' && (");
    const outputIdx = src.indexOf("{sidebarTab === 'output' && (");
    const outputSelectorIdx = src.indexOf('<OutputDestinationSelector');
    const overviewIdx = src.indexOf('-overview-card"');
    expect(configIdx).toBeGreaterThan(-1);
    expect(outputIdx).toBeGreaterThan(configIdx);
    expect(outputSelectorIdx).toBeGreaterThan(outputIdx);
    expect(overviewIdx).toBeGreaterThan(outputSelectorIdx);
    expect(src).toContain('onBrowse={handleSelectOutputDir}');

    if (rel !== 'components/EbookToolsSubTab.jsx') {
      const sourceIdx = src.indexOf('<DualSourcePicker');
      expect(sourceIdx).toBeGreaterThan(configIdx);
      expect(sourceIdx).toBeLessThan(outputIdx);
      const startFn = src.match(/const handle(?:ExecuteExport|StartConvert) = async \(\) => \{([\s\S]*?)\n {2}\};/)?.[1] || '';
      expect(startFn).toContain("setSidebarTab('output')");
    } else {
      const combineCheckIdx = src.indexOf("activeTool === 'combine'", configIdx);
      const combineOutIdx = src.indexOf('id="tools-combine-output-name"');
      const splitOutIdx = src.indexOf('id="tools-split-base-name"');
      expect(combineCheckIdx).toBeGreaterThan(configIdx);
      expect(combineCheckIdx).toBeLessThan(outputIdx);
      expect(combineOutIdx).toBeGreaterThan(outputSelectorIdx);
      expect(splitOutIdx).toBeGreaterThan(outputSelectorIdx);
      expect(overviewIdx).toBeGreaterThan(splitOutIdx);

      for (const fnName of ['handleStartCombine', 'handleStartSplit']) {
        const fnBody = src.match(new RegExp(`const ${fnName} = async \\(\\) => \\{([\\s\\S]*?)\\n {2}\\};`))?.[1] || '';
        expect(fnBody).toContain("setSidebarTab('output')");
      }

      expect(src).toContain('data-testid="tools-status-error"');
      expect(src).toContain('data-testid="tools-status-message"');
      expect(src).toContain('role="alert"');
      expect(src).toContain('role="status"');
      expect(src).toContain('handleCopyError');
      expect(src).toContain('h-10 w-full rounded-xl');
      expect(src).toContain('id="tools-split-max-mb"');
      expect(src).toContain('showItemInFolder');
      expect(src).toContain('data-tooltip={t(\'combineTab.removeFile\')}');
      expect(src).not.toContain('rounded-lg border border-outline-variant/30 bg-surface px-2.5 py-1.5');
      expect(src).not.toMatch(/<(button|a|span|div|input|label|img)\b[^>]*\stitle=/);
      expect(src).not.toContain('hover:underline');
    }
  }

  const rootDir = path.resolve(dirname, '../../..');
  const toolsSrc = fs.readFileSync(path.join(dirname, 'components/EbookToolsSubTab.jsx'), 'utf8');
  const usedToolsKeys = [...toolsSrc.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);
  expect(usedToolsKeys.length).toBeGreaterThan(10);
  for (const loc of ['vi.js', 'en.js']) {
    const locSrc = fs.readFileSync(path.join(rootDir, 'src/i18n/locales', loc), 'utf8');
    for (const key of usedToolsKeys) {
      expect(locSrc).toContain(`'${key}'`);
    }
  }

  const convSrc = fs.readFileSync(path.join(dirname, 'components/FormatConverterSubTab.jsx'), 'utf8');
  expect(convSrc).toContain("t('ebookStudio.converter.skipExisting')");
  expect(convSrc).toContain('skipExisting');
  expect(convSrc).toMatch(/ebookBatchConvert\(\{[\s\S]*?inPlace/);

  const requiredKeys = [
    'ebookStudio.sidebarTab.config',
    'ebookStudio.sidebarTab.output',
    'outputDestination.sameAsSource',
    'ebookStudio.packaging.outputNameLabel',
    'ebookStudio.converter.skipExisting',
    'ebookStudio.converter.skipExistingDesc',
    'ebookStudio.converter.statusSkipped',
    'ebookStudio.converter.filterSkipped',
    'ebookStudio.overview.skipped',
    'ebookStudio.overview.mode',
    'ebookStudio.overview.sourceSize',
    'ebookStudio.overview.estimatedParts',
    'ebookStudio.overview.toolsCombineTip',
    'ebookStudio.overview.toolsSplitTip',
    'ebookStudio.tools.changeCbzFile',
    'ebookStudio.tools.oneFileSelected',
    'ebookStudio.tools.noFileSelected',
    'ebookStudio.tools.splitSuccess',
    'ebookStudio.tools.openFileLocation',
    'ebookStudio.tools.sourceSizeLabel',
    'ebookStudio.tools.estimatedPartsLabel',
    'ebookStudio.tools.calculating',
    'ebookStudio.tools.partsUnit',
    'ebookStudio.tools.sourceTitle',
    'ebookStudio.tools.removeSource',
    'combineTab.emptyPrompt',
    'splitTab.promptSelect',
  ];
  for (const loc of ['vi.js', 'en.js']) {
    const locSrc = fs.readFileSync(path.join(rootDir, 'src/i18n/locales', loc), 'utf8');
    for (const key of requiredKeys) {
      expect(locSrc).toContain(`'${key}'`);
    }
  }
});

test('Convert Format, Utility Mode, and Config sections use compact single-line chips and flat h-10 controls', () => {
  const pkgSrc = fs.readFileSync(path.join(dirname, 'components/MangaPackagingSubTab.jsx'), 'utf8');
  expect(pkgSrc).toContain('grid-cols-4 gap-1.5');
  expect(pkgSrc).toContain('aria-pressed={isSelected}');
  expect(pkgSrc).toMatch(/h-9 rounded-xl border/);
  expect(pkgSrc).not.toContain('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg');
  expect(pkgSrc).not.toMatch(/<(button|a|span|div|input|label|img)\b[^>]*\stitle=/);
  expect(pkgSrc).not.toContain('hover:underline');

  const convSrc = fs.readFileSync(path.join(dirname, 'components/FormatConverterSubTab.jsx'), 'utf8');
  expect(convSrc).toContain('grid-cols-4 gap-1.5');
  expect(convSrc).toContain('col-span-4');
  expect(convSrc).toContain('aria-pressed={isSelected}');
  expect(convSrc).toMatch(/h-9 rounded-xl border/);
  expect(convSrc).toContain('ebookStudio.converter.folderTitle');
  expect(convSrc).toContain('bordered={false}');
  for (const descKey of ['cbzDesc', 'pdfDesc', 'epubDesc', 'mobiDesc', 'folderDesc']) {
    expect(convSrc).not.toContain(`ebookStudio.converter.${descKey}`);
  }
  expect(convSrc).not.toContain('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg');
  expect(convSrc).not.toContain('space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4');
  expect(convSrc).not.toMatch(/<(button|a|span|div|input|label|img)\b[^>]*\stitle=/);
  expect(convSrc).not.toContain('hover:underline');

  const toolsSrc = fs.readFileSync(path.join(dirname, 'components/EbookToolsSubTab.jsx'), 'utf8');
  expect(toolsSrc).toContain('grid grid-cols-2 gap-1.5');
  expect(toolsSrc).toContain('aria-pressed={activeTool ===');
  expect(toolsSrc).toMatch(/h-9 rounded-xl border/);
  expect(toolsSrc).toContain("activeTool === 'split' && (");
  expect(toolsSrc).toContain('<MaxMbLimitInput');
  const toolsSplitInputIdx = toolsSrc.indexOf('id="tools-split-base-name"');
  const toolsRuleIdx = toolsSrc.indexOf('ebookStudio.tools.splitRuleTitle');
  const toolsRuleDescIdx = toolsSrc.indexOf('ebookStudio.tools.splitRuleDesc');
  const toolsOverviewIdx = toolsSrc.indexOf('data-testid="tools-overview-card"');
  expect(toolsSplitInputIdx).toBeGreaterThan(-1);
  expect(toolsRuleIdx).toBeGreaterThan(toolsSplitInputIdx);
  expect(toolsRuleDescIdx).toBeGreaterThan(toolsRuleIdx);
  expect(toolsRuleDescIdx).toBeLessThan(toolsOverviewIdx);
  expect(toolsSrc.slice(toolsOverviewIdx)).not.toContain('splitRuleTitle');
  expect(toolsSrc.slice(toolsOverviewIdx)).not.toContain('splitRuleDesc');
  expect(toolsSrc).not.toContain('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg');
  expect(toolsSrc).not.toContain('combineDesc');
  expect(toolsSrc).not.toContain('splitDesc');
  expect(toolsSrc).not.toContain('space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-4');

  const sharedFieldsSrc = fs.readFileSync(path.join(dirname, 'components/forms/ConfigFormFields.jsx'), 'utf8');
  expect(sharedFieldsSrc).toContain('aria-pressed={isSelected}');
  expect(sharedFieldsSrc).toMatch(/h-9 rounded-xl border/);
  expect(sharedFieldsSrc).not.toContain('flex-col items-center justify-center');
  expect(sharedFieldsSrc).toContain('onBlur');
  expect(sharedFieldsSrc).toContain('Math.min(max, Math.max(min');
  expect(sharedFieldsSrc).not.toMatch(/<(button|a|span|div|input|label|img)\b[^>]*\stitle=/);

  const forms = [
    'components/forms/CbzConfigForm.jsx',
    'components/forms/PdfConfigForm.jsx',
    'components/forms/EpubConfigForm.jsx',
    'components/forms/MobiConfigForm.jsx',
  ];
  for (const rel of forms) {
    const src = fs.readFileSync(path.join(dirname, rel), 'utf8');
    expect(src).not.toContain('space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/60 p-3');
    expect(src).toContain('<PackagingModeSelector');
    expect(src).toContain('<MaxMbLimitInput');
    expect(src).toContain('<RotateDoublePageOption');
    expect(src).not.toContain('rounded-md border border-outline-variant/30 bg-surface px-2 py-1');
    expect(src).not.toMatch(/<(button|a|span|div|input|label|img)\b[^>]*\stitle=/);
    expect(src).not.toContain('hover:underline');
  }

  const epubSrc = fs.readFileSync(path.join(dirname, 'components/forms/EpubConfigForm.jsx'), 'utf8');
  expect(epubSrc).toContain('h-10 w-full rounded-xl');
  expect(epubSrc).toContain('ariaLabel={t(\'ebookStudio.packaging.epubQuality\')}');
  expect(epubSrc).not.toMatch(/<SearchableSelect[\s\S]*?size="sm"/);

  // Audit ALL t('...') keys across Packaging, Converter, Tools, and Config forms against vi.js & en.js
  const rootDir = path.resolve(dirname, '../../..');
  const auditedFiles = [
    'components/MangaPackagingSubTab.jsx',
    'components/FormatConverterSubTab.jsx',
    'components/EbookToolsSubTab.jsx',
    'components/forms/ConfigFormFields.jsx',
    ...forms,
  ];
  const allUsedKeys = new Set();
  for (const rel of auditedFiles) {
    const src = fs.readFileSync(path.join(dirname, rel), 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) {
      allUsedKeys.add(m[1]);
    }
  }
  expect(allUsedKeys.size).toBeGreaterThan(40);
  for (const loc of ['vi.js', 'en.js']) {
    const locSrc = fs.readFileSync(path.join(rootDir, 'src/i18n/locales', loc), 'utf8');
    for (const key of allUsedKeys) {
      expect(locSrc).toContain(`'${key}'`);
    }
  }
});
